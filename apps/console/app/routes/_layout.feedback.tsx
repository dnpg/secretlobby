import { useEffect, useState, useRef } from "react";
import { redirect, useFetcher, useLoaderData } from "react-router";
import type { Route } from "./+types/_layout.feedback";
import { toast } from "sonner";

const MAX_FILES = 5;
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB per file

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "application/pdf",
];

export function meta() {
  return [{ title: "Submit Feedback - SecretLobby Console" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { getSession, requireUserAuth, getCsrfToken } = await import("@secretlobby/auth");

  const { session } = await getSession(request);
  requireUserAuth(session);

  const accountId = session.currentAccountId;
  if (!accountId) {
    throw redirect("/login");
  }

  const csrfToken = await getCsrfToken(request);

  return { csrfToken };
}

export async function action({ request }: Route.ActionArgs) {
  const { getSession, requireUserAuth } = await import("@secretlobby/auth");
  const { csrfProtect } = await import("@secretlobby/auth/csrf");
  const { createFeedbackWithAttachments, getSystemFeedbackNotificationEmail } = await import(
    "~/models/mutations/feedback.server"
  );
  const { sendFeedbackNotificationEmail } = await import("@secretlobby/email");
  const { uploadFile } = await import("@secretlobby/storage");
  const { prisma } = await import("@secretlobby/db");
  const { createLogger, formatError } = await import("@secretlobby/logger/server");

  const logger = createLogger({ service: "console:feedback" });

  const { session } = await getSession(request);
  requireUserAuth(session);
  await csrfProtect(request);

  const accountId = session.currentAccountId;
  const userId = session.userId;
  if (!accountId || !userId) {
    return { error: "Not authenticated" };
  }

  const formData = await request.formData();
  const type = formData.get("type") as string;
  const subject = formData.get("subject") as string;
  const message = formData.get("message") as string;
  const files = formData.getAll("files") as File[];

  // Validation
  if (!type || !["BUG_REPORT", "FEATURE_REQUEST", "GENERAL"].includes(type)) {
    return { error: "Please select a feedback type" };
  }

  if (!subject || subject.trim().length < 3) {
    return { error: "Subject must be at least 3 characters" };
  }

  if (!message || message.trim().length < 10) {
    return { error: "Message must be at least 10 characters" };
  }

  // Filter out empty files
  const validFiles = files.filter((file) => file.size > 0);

  // Validate files
  for (const file of validFiles) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return { error: `File "${file.name}" has unsupported type` };
    }
    if (file.size > MAX_FILE_SIZE) {
      return { error: `File "${file.name}" exceeds 25MB limit` };
    }
  }

  if (validFiles.length > MAX_FILES) {
    return { error: `Maximum ${MAX_FILES} files allowed` };
  }

  try {
    // STEP 1: Upload ALL files to R2 first
    // If any upload fails, we stop and don't create the feedback
    const uploadedFiles: { filename: string; key: string; mimeType: string; size: number }[] = [];

    for (const file of validFiles) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const ext = file.name.split(".").pop() || "bin";
      const slug =
        file.name
          .replace(/\.[^/.]+$/, "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/-{2,}/g, "-")
          .replace(/^-|-$/g, "") || "file";
      const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
      const key = `feedback/${accountId}/${slug}-${suffix}.${ext}`;

      // Upload to R2 - if this fails, the whole submission fails
      await uploadFile(key, buffer, file.type);
      logger.info({ key, filename: file.name }, "File uploaded to R2");

      uploadedFiles.push({
        filename: file.name,
        key,
        mimeType: file.type,
        size: file.size,
      });
    }

    // STEP 2: Create feedback with attachments in database
    // Only happens if ALL uploads succeeded
    const feedback = await createFeedbackWithAttachments({
      accountId,
      userId,
      type: type as "BUG_REPORT" | "FEATURE_REQUEST" | "GENERAL",
      subject: subject.trim(),
      message: message.trim(),
      attachments: uploadedFiles,
    });

    logger.info(
      { feedbackId: feedback.id, attachmentCount: uploadedFiles.length },
      "Feedback created with attachments"
    );

    // STEP 3: Send email notification (non-blocking)
    const [user, account, notificationEmail] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true },
      }),
      prisma.account.findUnique({
        where: { id: accountId },
        select: { name: true },
      }),
      getSystemFeedbackNotificationEmail(),
    ]);

    if (notificationEmail && user && account) {
      try {
        await sendFeedbackNotificationEmail({
          to: notificationEmail,
          userName: user.name || "Unknown User",
          userEmail: user.email,
          accountName: account.name,
          feedbackType: type,
          feedbackSubject: subject.trim(),
          feedbackMessage: message.trim(),
        });
      } catch (emailError) {
        logger.error({ error: formatError(emailError) }, "Failed to send feedback notification email");
      }
    }

    return { success: true };
  } catch (error) {
    logger.error({ error: formatError(error) }, "Failed to create feedback");
    return { error: "An error occurred while submitting your feedback. Please try again." };
  }
}

interface FilePreview {
  file: File;
  preview: string | null;
  id: string;
}

export default function FeedbackPage() {
  const { csrfToken } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [submitted, setSubmitted] = useState(false);
  const [files, setFiles] = useState<FilePreview[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const isSubmitting = fetcher.state === "submitting";

  // Handle fetcher response
  useEffect(() => {
    if (fetcher.data?.error) {
      toast.error(fetcher.data.error);
    }

    if (fetcher.data?.success) {
      toast.success("Thank you for your feedback! We appreciate you taking the time to help us improve.");
      // Cleanup previews
      files.forEach((f) => {
        if (f.preview) URL.revokeObjectURL(f.preview);
      });
      setFiles([]);
      setSubmitted(true);
      formRef.current?.reset();
    }
  }, [fetcher.data]);

  // Cleanup previews on unmount
  useEffect(() => {
    return () => {
      files.forEach((f) => {
        if (f.preview) URL.revokeObjectURL(f.preview);
      });
    };
  }, []);

  const generateId = (): string => {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  };

  const handleFiles = (newFiles: FileList | File[]) => {
    const fileArray = Array.from(newFiles);
    const validFiles: FilePreview[] = [];

    for (const file of fileArray) {
      if (files.length + validFiles.length >= MAX_FILES) {
        toast.error(`Maximum ${MAX_FILES} files allowed`);
        break;
      }

      if (!ALLOWED_TYPES.includes(file.type)) {
        toast.error(`"${file.name}" is not a supported file type`);
        continue;
      }

      if (file.size > MAX_FILE_SIZE) {
        toast.error(`"${file.name}" exceeds the 25MB size limit`);
        continue;
      }

      const preview = file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
      validFiles.push({ file, preview, id: generateId() });
    }

    setFiles((prev) => [...prev, ...validFiles]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const selectedFiles = e.target.files;
    if (selectedFiles && selectedFiles.length > 0) {
      handleFiles(selectedFiles);
    }
    if (e.target) {
      e.target.value = "";
    }
  };

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const removed = prev.find((f) => f.id === id);
      if (removed?.preview) URL.revokeObjectURL(removed.preview);
      return prev.filter((f) => f.id !== id);
    });
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const form = e.currentTarget;
    const formData = new FormData(form);

    // Add files to formData
    for (const fileItem of files) {
      formData.append("files", fileItem.file);
    }

    fetcher.submit(formData, {
      method: "POST",
      encType: "multipart/form-data",
    });
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith("image/")) {
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
        </svg>
      );
    }
    if (mimeType.startsWith("video/")) {
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
        </svg>
      );
    }
    if (mimeType === "application/pdf") {
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      );
    }
    return (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    );
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (submitted) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold mb-2">Feedback Submitted</h2>
        </div>

        <div className="bg-theme-secondary border border-theme rounded-lg p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
            <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold mb-2">Thank You!</h3>
          <p className="text-theme-secondary mb-6">
            Your feedback has been submitted successfully. We appreciate you taking the time to help us improve SecretLobby.
          </p>
          <button
            onClick={() => setSubmitted(false)}
            className="cursor-pointer px-6 py-2 btn-primary rounded-lg transition"
          >
            Submit More Feedback
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Submit Feedback</h2>
        <p className="text-theme-secondary">
          Help us improve SecretLobby by sharing your thoughts, reporting bugs, or requesting features.
        </p>
      </div>

      <div className="bg-theme-secondary border border-theme rounded-lg p-6 relative">
        {/* Submitting Overlay */}
        {isSubmitting && (
          <div className="absolute inset-0 bg-theme-secondary/95 backdrop-blur-sm rounded-lg z-10 flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--color-brand-red)]/20 flex items-center justify-center">
                <svg className="w-8 h-8 text-[var(--color-brand-red)] animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold mb-1">Submitting Feedback</h3>
              <p className="text-theme-secondary text-sm">
                {files.length > 0 ? "Uploading files and saving your feedback..." : "Saving your feedback..."}
              </p>
            </div>
          </div>
        )}

        <form
          ref={formRef}
          method="post"
          encType="multipart/form-data"
          className="space-y-6"
          onSubmit={handleSubmit}
        >
          <input type="hidden" name="_csrf" value={csrfToken} />

          {/* Feedback Type */}
          <div>
            <label htmlFor="type" className="block text-sm font-medium text-theme-secondary mb-2">
              Feedback Type
            </label>
            <select
              id="type"
              name="type"
              required
              disabled={isSubmitting}
              className="w-full px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] disabled:opacity-50"
            >
              <option value="">Select a type...</option>
              <option value="BUG_REPORT">Bug Report</option>
              <option value="FEATURE_REQUEST">Feature Request</option>
              <option value="GENERAL">General Feedback</option>
            </select>
          </div>

          {/* Subject */}
          <div>
            <label htmlFor="subject" className="block text-sm font-medium text-theme-secondary mb-2">
              Subject
            </label>
            <input
              type="text"
              id="subject"
              name="subject"
              required
              minLength={3}
              maxLength={200}
              disabled={isSubmitting}
              placeholder="Brief description of your feedback"
              className="w-full px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary placeholder:text-theme-muted focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] disabled:opacity-50"
            />
          </div>

          {/* Message */}
          <div>
            <label htmlFor="message" className="block text-sm font-medium text-theme-secondary mb-2">
              Message
            </label>
            <textarea
              id="message"
              name="message"
              required
              minLength={10}
              rows={6}
              disabled={isSubmitting}
              placeholder="Please provide as much detail as possible..."
              className="w-full px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary placeholder:text-theme-muted focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] resize-y disabled:opacity-50"
            />
            <p className="text-xs text-theme-muted mt-2">
              For bug reports, please include steps to reproduce the issue and any error messages you see.
            </p>
          </div>

          {/* File Upload */}
          <div>
            <label className="block text-sm font-medium text-theme-secondary mb-2">
              Attachments <span className="text-theme-muted font-normal">(optional, max {MAX_FILES} files)</span>
            </label>

            {/* Drop Zone */}
            <div
              className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                dragOver
                  ? "border-[var(--color-brand-red)] bg-[var(--color-brand-red)]/10"
                  : "border-theme hover:border-theme-secondary"
              } ${files.length >= MAX_FILES || isSubmitting ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
              onDragOver={(e) => {
                e.preventDefault();
                if (files.length < MAX_FILES && !isSubmitting) setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                if (files.length < MAX_FILES && !isSubmitting) handleDrop(e);
                else e.preventDefault();
              }}
              onClick={() => files.length < MAX_FILES && !isSubmitting && fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ALLOWED_TYPES.join(",")}
                onChange={handleFileSelect}
                className="hidden"
                disabled={files.length >= MAX_FILES || isSubmitting}
              />

              <svg
                className="mx-auto h-10 w-10 text-theme-muted"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z"
                />
              </svg>
              <p className="mt-2 text-sm text-theme-secondary">
                {files.length >= MAX_FILES ? (
                  "Maximum files reached"
                ) : (
                  <>Drop files here or <span className="text-[var(--color-brand-red)]">browse</span></>
                )}
              </p>
              <p className="text-xs text-theme-muted mt-1">
                Images, videos, or PDFs up to 25MB each
              </p>
            </div>

            {/* File List */}
            {files.length > 0 && (
              <div className="mt-4 space-y-2">
                {files.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 p-3 bg-theme-tertiary rounded-lg border border-theme"
                  >
                    {/* Preview or Icon */}
                    {item.preview ? (
                      <img
                        src={item.preview}
                        alt={item.file.name}
                        className="w-10 h-10 object-cover rounded"
                      />
                    ) : (
                      <div className="w-10 h-10 flex items-center justify-center bg-theme-secondary rounded text-theme-muted">
                        {getFileIcon(item.file.type)}
                      </div>
                    )}

                    {/* File Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.file.name}</p>
                      <p className="text-xs text-theme-muted">{formatFileSize(item.file.size)}</p>
                    </div>

                    {/* Remove Button */}
                    <button
                      type="button"
                      onClick={() => removeFile(item.id)}
                      disabled={isSubmitting}
                      className="cursor-pointer p-1.5 rounded-lg hover:bg-red-500/20 text-theme-muted hover:text-red-400 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Submit */}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSubmitting}
              className="cursor-pointer px-6 py-2 btn-primary rounded-lg transition disabled:opacity-50"
            >
              {isSubmitting ? "Submitting..." : "Submit Feedback"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
