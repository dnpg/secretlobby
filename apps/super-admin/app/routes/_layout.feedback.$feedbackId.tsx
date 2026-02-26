import { useLoaderData, Form, useActionData, useNavigation, Link } from "react-router";
import type { Route } from "./+types/_layout.feedback.$feedbackId";
import { useEffect } from "react";
import { toast } from "sonner";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: data?.feedback ? `Feedback: ${data.feedback.subject} - Super Admin` : "Feedback - Super Admin" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { getSession, requireAdminRole } = await import("@secretlobby/auth");
  const { getFeedbackById } = await import("~/models/feedback/queries.server");
  const { getPublicUrl } = await import("@secretlobby/storage");
  const { redirect } = await import("react-router");

  const { session } = await getSession(request);
  requireAdminRole(session);

  const { feedbackId } = params;
  if (!feedbackId) {
    throw redirect("/feedback");
  }

  const feedback = await getFeedbackById(feedbackId);
  if (!feedback) {
    throw redirect("/feedback");
  }

  // Generate public URLs for attachments
  const attachmentsWithUrls = feedback.attachments.map((attachment) => ({
    ...attachment,
    url: getPublicUrl(attachment.key),
  }));

  return { feedback: { ...feedback, attachments: attachmentsWithUrls } };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { getSession, requireAdminRole } = await import("@secretlobby/auth");
  const { updateFeedbackStatus, deleteFeedback } = await import("~/models/feedback/mutations.server");
  const { redirect } = await import("react-router");

  const { session } = await getSession(request);
  requireAdminRole(session);

  const { feedbackId } = params;
  if (!feedbackId) {
    return { error: "Missing feedback ID" };
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  try {
    if (intent === "mark-read") {
      await updateFeedbackStatus(feedbackId, "READ");
      return { success: "Feedback marked as read" };
    }

    if (intent === "mark-archived") {
      await updateFeedbackStatus(feedbackId, "ARCHIVED");
      return { success: "Feedback archived" };
    }

    if (intent === "mark-pending") {
      await updateFeedbackStatus(feedbackId, "PENDING");
      return { success: "Feedback marked as pending" };
    }

    if (intent === "delete") {
      await deleteFeedback(feedbackId);
      throw redirect("/feedback");
    }

    return { error: "Invalid action" };
  } catch (error: unknown) {
    if (error instanceof Response) throw error;
    const message = error instanceof Error ? error.message : "An error occurred";
    return { error: message };
  }
}

export default function FeedbackDetailPage() {
  const { feedback } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  useEffect(() => {
    if (actionData?.success) {
      toast.success(actionData.success);
    }
    if (actionData?.error) {
      toast.error(actionData.error);
    }
  }, [actionData]);

  const typeLabels: Record<string, { label: string; color: string }> = {
    BUG_REPORT: { label: "Bug Report", color: "bg-red-500/20 text-red-400 border-red-800" },
    FEATURE_REQUEST: { label: "Feature Request", color: "bg-blue-500/20 text-blue-400 border-blue-800" },
    GENERAL: { label: "General", color: "bg-gray-500/20 text-gray-400 border-gray-700" },
  };

  const statusLabels: Record<string, { label: string; color: string }> = {
    PENDING: { label: "Pending", color: "bg-yellow-500/20 text-yellow-400 border-yellow-800" },
    READ: { label: "Read", color: "bg-blue-500/20 text-blue-400 border-blue-800" },
    ARCHIVED: { label: "Archived", color: "bg-gray-500/20 text-gray-400 border-gray-700" },
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="space-y-6">
        {/* Header with back button */}
        <div className="flex items-center gap-4">
          <Link
            to="/feedback"
            className="p-2 rounded-lg hover:bg-theme-tertiary text-theme-secondary transition cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
          </Link>
          <div className="flex-1">
            <h2 className="text-2xl font-bold">Feedback Details</h2>
          </div>
        </div>

        {/* Main content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Feedback content - takes 2 columns */}
          <div className="lg:col-span-2 space-y-6">
            {/* Subject and badges */}
            <div className="card p-6">
              <div className="flex items-start justify-between gap-4 mb-4">
                <h3 className="text-xl font-semibold">{feedback.subject}</h3>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`px-2 py-1 text-xs font-medium rounded border ${typeLabels[feedback.type]?.color || typeLabels.GENERAL.color}`}>
                    {typeLabels[feedback.type]?.label || feedback.type}
                  </span>
                  <span className={`px-2 py-1 text-xs font-medium rounded border ${statusLabels[feedback.status]?.color || statusLabels.PENDING.color}`}>
                    {statusLabels[feedback.status]?.label || feedback.status}
                  </span>
                </div>
              </div>

              <div className="text-sm text-theme-muted mb-6">
                Submitted on {new Date(feedback.createdAt).toLocaleDateString()} at {new Date(feedback.createdAt).toLocaleTimeString()}
              </div>

              {/* Message */}
              <div className="bg-theme-tertiary rounded-lg p-4">
                <h4 className="text-sm font-medium text-theme-secondary mb-2">Message</h4>
                <p className="text-theme-primary whitespace-pre-wrap leading-relaxed">{feedback.message}</p>
              </div>

              {/* Attachments */}
              {feedback.attachments.length > 0 && (
                <div className="bg-theme-tertiary rounded-lg p-4 mt-4">
                  <h4 className="text-sm font-medium text-theme-secondary mb-3">
                    Attachments ({feedback.attachments.length})
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {feedback.attachments.map((attachment) => {
                      const isImage = attachment.mimeType.startsWith("image/");
                      const isVideo = attachment.mimeType.startsWith("video/");
                      const isPdf = attachment.mimeType === "application/pdf";

                      return (
                        <div
                          key={attachment.key}
                          className="bg-theme-secondary/50 rounded-lg overflow-hidden border border-theme-secondary/30"
                        >
                          {/* Preview area */}
                          {isImage && (
                            <a
                              href={attachment.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="cursor-pointer block"
                            >
                              <img
                                src={attachment.url}
                                alt={attachment.filename}
                                className="w-full h-40 object-cover hover:opacity-80 transition"
                              />
                            </a>
                          )}
                          {isVideo && (
                            <div className="w-full h-40 bg-theme-tertiary flex items-center justify-center">
                              <a
                                href={attachment.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="cursor-pointer flex flex-col items-center text-theme-muted hover:text-(--color-brand-red) transition"
                              >
                                <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                                </svg>
                                <span className="text-xs mt-1">Video File</span>
                              </a>
                            </div>
                          )}
                          {isPdf && (
                            <div className="w-full h-40 bg-theme-tertiary flex items-center justify-center">
                              <a
                                href={attachment.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="cursor-pointer flex flex-col items-center text-theme-muted hover:text-(--color-brand-red) transition"
                              >
                                <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                                </svg>
                                <span className="text-xs mt-1">PDF Document</span>
                              </a>
                            </div>
                          )}

                          {/* File info */}
                          <div className="p-3">
                            <p className="text-sm font-medium truncate" title={attachment.filename}>
                              {attachment.filename}
                            </p>
                            <div className="flex items-center justify-between mt-1">
                              <span className="text-xs text-theme-muted">
                                {formatFileSize(attachment.size)}
                              </span>
                              <a
                                href={attachment.url}
                                download={attachment.filename}
                                className="cursor-pointer text-xs text-(--color-brand-red) hover:underline flex items-center gap-1"
                              >
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                </svg>
                                Download
                              </a>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="card p-6">
              <h4 className="text-sm font-medium text-theme-secondary mb-4">Actions</h4>
              <div className="flex flex-wrap items-center gap-3">
                {feedback.status === "PENDING" && (
                  <Form method="post">
                    <input type="hidden" name="intent" value="mark-read" />
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="cursor-pointer px-4 py-2 text-sm font-medium bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded-lg transition disabled:opacity-50"
                    >
                      Mark as Read
                    </button>
                  </Form>
                )}
                {feedback.status !== "ARCHIVED" && (
                  <Form method="post">
                    <input type="hidden" name="intent" value="mark-archived" />
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="cursor-pointer px-4 py-2 text-sm font-medium bg-gray-500/20 text-gray-400 hover:bg-gray-500/30 rounded-lg transition disabled:opacity-50"
                    >
                      Archive
                    </button>
                  </Form>
                )}
                {feedback.status === "ARCHIVED" && (
                  <Form method="post">
                    <input type="hidden" name="intent" value="mark-pending" />
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="cursor-pointer px-4 py-2 text-sm font-medium bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 rounded-lg transition disabled:opacity-50"
                    >
                      Restore to Pending
                    </button>
                  </Form>
                )}
                {feedback.status === "READ" && (
                  <Form method="post">
                    <input type="hidden" name="intent" value="mark-pending" />
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="cursor-pointer px-4 py-2 text-sm font-medium bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 rounded-lg transition disabled:opacity-50"
                    >
                      Mark as Unread
                    </button>
                  </Form>
                )}
                <Form method="post" onSubmit={(e) => {
                  if (!confirm("Are you sure you want to delete this feedback? This action cannot be undone.")) {
                    e.preventDefault();
                  }
                }}>
                  <input type="hidden" name="intent" value="delete" />
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="cursor-pointer px-4 py-2 text-sm font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg transition disabled:opacity-50"
                  >
                    Delete
                  </button>
                </Form>
              </div>
            </div>
          </div>

          {/* Sidebar - user and account info */}
          <div className="space-y-6">
            {/* User Info */}
            <div className="card p-6">
              <h4 className="text-sm font-medium text-theme-secondary mb-4">Submitted By</h4>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-(--color-brand-red) flex items-center justify-center text-white font-medium">
                    {(feedback.user?.name || feedback.user?.email || "U").charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium truncate">{feedback.user?.name || "Unknown User"}</p>
                    <p className="text-sm text-theme-muted truncate">{feedback.user?.email}</p>
                  </div>
                </div>
                {feedback.user && (
                  <Link
                    to={`/users/${feedback.user.id}`}
                    className="inline-flex items-center gap-2 text-sm text-(--color-brand-red) hover:underline cursor-pointer"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                    </svg>
                    View User Profile
                  </Link>
                )}
              </div>
            </div>

            {/* Account Info */}
            <div className="card p-6">
              <h4 className="text-sm font-medium text-theme-secondary mb-4">Account</h4>
              <div className="space-y-3">
                <div>
                  <p className="font-medium">{feedback.account?.name || "Unknown Account"}</p>
                  {feedback.account?.slug && (
                    <p className="text-sm text-theme-muted">@{feedback.account.slug}</p>
                  )}
                </div>
                {feedback.account && (
                  <Link
                    to={`/accounts/${feedback.account.id}`}
                    className="inline-flex items-center gap-2 text-sm text-(--color-brand-red) hover:underline cursor-pointer"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
                    </svg>
                    View Account
                  </Link>
                )}
              </div>
            </div>

            {/* Metadata */}
            <div className="card p-6">
              <h4 className="text-sm font-medium text-theme-secondary mb-4">Metadata</h4>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-theme-muted">Feedback ID</dt>
                  <dd className="font-mono text-xs text-theme-secondary">{feedback.id}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-theme-muted">Created</dt>
                  <dd className="text-theme-secondary">{new Date(feedback.createdAt).toLocaleString()}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-theme-muted">Updated</dt>
                  <dd className="text-theme-secondary">{new Date(feedback.updatedAt).toLocaleString()}</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
