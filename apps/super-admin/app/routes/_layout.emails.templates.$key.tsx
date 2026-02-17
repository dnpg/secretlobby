import { useLoaderData, Form, useActionData, useNavigation, Link } from "react-router";
import type { Route } from "./+types/_layout.emails.templates.$key";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

// Local copy of email wrapper (matches @secretlobby/email defaults) so this route loads in the browser
// without pulling in server-only email package code (nodemailer, resend).
const WRAPPER_START = `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="x-apple-disable-message-reformatting" content="yes" />
  <meta name="format-detection" content="telephone=no, date=no, address=no, email=no" />
  <title></title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
</head>
<body style="margin:0; padding:0; -webkit-text-size-adjust:100%; background-color:#f4f4f5;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%; background-color:#f4f4f5;">
    <tr>
      <td align="center" style="padding:24px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%; max-width:600px; min-width:280px; margin:0 auto; background-color:#ffffff;">`;

const WRAPPER_END = `</table>
      </td>
    </tr>
  </table>
</body>
</html>`;

export function meta({ params }: Route.MetaArgs) {
  return [{ title: `Edit template: ${params.key} - Super Admin` }];
}

function substitute(str: string, variables: Record<string, string | number>) {
  let out = str;
  for (const [key, value] of Object.entries(variables)) {
    out = out.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), String(value ?? ""));
  }
  return out;
}

function getDefaultPreviewVars(key: string): Record<string, string | number> {
  if (key === "invitation") {
    return {
      userName: "Diego",
      inviteUrl: "https://console.secretlobby.co/signup?code=example",
      expiresInDays: 7,
    };
  }
  if (key === "email_verification") {
    return {
      userName: "Diego",
      verificationUrl: "https://console.secretlobby.co/verify?token=example",
    };
  }
  if (key === "password_reset") {
    return {
      userName: "Diego",
      resetUrl: "https://console.secretlobby.co/reset-password?token=example",
    };
  }
  return { userName: "Diego" };
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { getSession, requireAdminRole } = await import("@secretlobby/auth");
  const { prisma } = await import("@secretlobby/db");

  const { session } = await getSession(request);
  requireAdminRole(session);

  const key = params.key;
  if (!key) throw new Response("Not found", { status: 404 });

  const template = await prisma.emailTemplate.findUnique({
    where: { key },
  });

  if (!template) throw new Response("Template not found", { status: 404 });

  const [
    header,
    footer,
    {
      DEFAULT_INVITATION_BODY_HTML,
      DEFAULT_EMAIL_VERIFICATION_BODY_HTML,
      DEFAULT_PASSWORD_RESET_BODY_HTML,
      DEFAULT_EMAIL_SUBJECTS,
    },
  ] = await Promise.all([
    prisma.emailHtmlElement.findUnique({ where: { key: "header" } }),
    prisma.emailHtmlElement.findUnique({ where: { key: "footer" } }),
    import("@secretlobby/email").then((m) => ({
      DEFAULT_INVITATION_BODY_HTML: m.DEFAULT_INVITATION_BODY_HTML,
      DEFAULT_EMAIL_VERIFICATION_BODY_HTML: m.DEFAULT_EMAIL_VERIFICATION_BODY_HTML,
      DEFAULT_PASSWORD_RESET_BODY_HTML: m.DEFAULT_PASSWORD_RESET_BODY_HTML,
      DEFAULT_EMAIL_SUBJECTS: m.DEFAULT_EMAIL_SUBJECTS,
    })),
  ]);

  const defaultBodies: Record<string, string> = {
    invitation: DEFAULT_INVITATION_BODY_HTML,
    email_verification: DEFAULT_EMAIL_VERIFICATION_BODY_HTML,
    password_reset: DEFAULT_PASSWORD_RESET_BODY_HTML,
  };

  const consoleUrl = process.env.CONSOLE_URL ?? "https://console.secretlobby.co";

  return {
    template,
    elements: {
      headerHtml: header?.html ?? "",
      footerHtml: footer?.html ?? "",
    },
    defaultSubject: DEFAULT_EMAIL_SUBJECTS[key as keyof typeof DEFAULT_EMAIL_SUBJECTS] ?? "",
    defaultBodyHtml: defaultBodies[key] ?? "",
    consoleUrl,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { getSession, requireAdminRole } = await import("@secretlobby/auth");
  const { prisma } = await import("@secretlobby/db");
  const { sendMail } = await import("@secretlobby/email");

  const { session } = await getSession(request);
  requireAdminRole(session);

  const key = params.key;
  if (!key) return { error: "Missing key" };

  const formData = await request.formData();
  const intent = formData.get("intent");
  const subject = formData.get("subject") as string;
  const bodyHtml = formData.get("bodyHtml") as string;

  if (!subject?.trim()) return { error: "Subject is required" };
  if (bodyHtml == null) return { error: "Body HTML is required" };

  if (intent === "sendPreview") {
    const adminEmail = session.userEmail;
    if (!adminEmail?.trim()) return { error: "Your account has no email; cannot send preview." };

    let previewVars: Record<string, string | number> = getDefaultPreviewVars(key);
    try {
      const raw = formData.get("previewVars");
      if (typeof raw === "string" && raw) previewVars = { ...previewVars, ...JSON.parse(raw) };
    } catch {
      // use defaults
    }
    previewVars = { ...previewVars, year: new Date().getFullYear(), consoleUrl: process.env.CONSOLE_URL ?? "https://console.secretlobby.co" };

    const [header, footer] = await Promise.all([
      prisma.emailHtmlElement.findUnique({ where: { key: "header" } }),
      prisma.emailHtmlElement.findUnique({ where: { key: "footer" } }),
    ]);
    const headerHtml = substitute(header?.html ?? "", previewVars);
    const footerHtml = substitute(footer?.html ?? "", previewVars);
    const body = substitute(bodyHtml, previewVars);
    const html = WRAPPER_START + headerHtml + body + footerHtml + WRAPPER_END;
    const from = process.env.EMAIL_FROM || "SecretLobby <noreply@secretlobby.co>";

    try {
      await sendMail({ from, to: adminEmail, subject: subject.trim(), html });
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Failed to send preview email." };
    }
    return { previewSent: true };
  }

  await prisma.emailTemplate.update({
    where: { key },
    data: { subject: subject.trim(), bodyHtml },
  });

  return { success: true };
}

export default function EditTemplatePage() {
  const { template, elements, defaultSubject, defaultBodyHtml, consoleUrl } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const isSendingPreview = isSubmitting && navigation.formData?.get("intent") === "sendPreview";

  const [subject, setSubject] = useState(template.subject);
  const [bodyHtml, setBodyHtml] = useState(template.bodyHtml);
  const [previewVars, setPreviewVars] = useState<Record<string, string | number>>(() => ({
    ...getDefaultPreviewVars(template.key),
    year: new Date().getFullYear(),
    consoleUrl,
  }));

  useEffect(() => {
    if (actionData?.success) toast.success("Template saved");
    if (actionData?.previewSent) toast.success("Preview email sent to your email.");
    if (actionData?.error) toast.error(actionData.error);
  }, [actionData]);

  useEffect(() => {
    // If the route changes to a different template key, reset editor state.
    setSubject(template.subject);
    setBodyHtml(template.bodyHtml);
    setPreviewVars({
      ...getDefaultPreviewVars(template.key),
      year: new Date().getFullYear(),
      consoleUrl,
    });
  }, [template.key, template.subject, template.bodyHtml, consoleUrl]);

  const previewHtml = useMemo(() => {
    const vars = previewVars;
    const header = substitute(elements.headerHtml || "", vars);
    const footer = substitute(elements.footerHtml || "", vars);
    const body = substitute(bodyHtml || "", vars);
    return WRAPPER_START + header + body + footer + WRAPPER_END;
  }, [bodyHtml, elements.footerHtml, elements.headerHtml, previewVars]);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex items-center gap-4">
        <Link to="/emails" className="text-theme-secondary hover:text-theme-primary transition">
          ← Back to Emails
        </Link>
      </div>

      <div className="mb-8">
        <h2 className="text-2xl font-bold">Edit template: {template.name}</h2>
        <p className="text-theme-secondary text-sm mt-1">
          Key: <code className="bg-theme-card px-2 py-0.5 rounded">{template.key}</code>. Use placeholders: {"{{userName}}"}, {"{{inviteUrl}}"}, {"{{verificationUrl}}"}, {"{{resetUrl}}"}, {"{{expiresInDays}}"}.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Form method="post" className="space-y-6">
          <div className="card p-6">
            <label className="block text-sm font-medium text-theme-secondary mb-2">Subject line</label>
            <input
              type="text"
              name="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              className="w-full px-3 py-2 bg-theme-primary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] font-mono"
            />
          </div>

          <div className="card p-6">
            <label className="block text-sm font-medium text-theme-secondary mb-2">Body HTML (table-based, inline styles only)</label>
            <p className="text-xs text-theme-muted mb-2">
              Use tables and inline styles for compatibility with Gmail, Outlook, Apple Mail. Avoid external CSS or complex layout.
            </p>
            <textarea
              name="bodyHtml"
              value={bodyHtml}
              onChange={(e) => setBodyHtml(e.target.value)}
              rows={24}
              className="w-full px-3 py-2 bg-theme-primary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] font-mono text-sm"
              spellCheck={false}
            />
          </div>

          <div className="flex flex-wrap gap-4 items-center">
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2 btn-primary rounded-lg transition disabled:opacity-50"
            >
              {isSubmitting ? "Saving..." : "Save template"}
            </button>
            <button
              type="button"
              onClick={() => {
                setSubject(defaultSubject);
                setBodyHtml(defaultBodyHtml);
                toast.success("Reverted to default template. Click Save to persist.");
              }}
              className="px-6 py-2 btn-secondary rounded-lg hover:bg-theme-secondary transition"
            >
              Revert to default
            </button>
            <Link to="/emails" className="px-6 py-2 bg-theme-tertiary rounded-lg hover:bg-theme-secondary transition">
              Cancel
            </Link>
          </div>
        </Form>

        <div className="space-y-6">
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Preview</h3>
              <span className="text-xs text-theme-secondary">
                Rendered in a sandboxed iframe
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              {Object.keys(getDefaultPreviewVars(template.key)).map((k) => (
                <div key={k}>
                  <label className="block text-xs font-medium text-theme-secondary mb-1">
                    {k}
                  </label>
                  <input
                    type={k.toLowerCase().includes("days") ? "number" : "text"}
                    value={String(previewVars[k] ?? "")}
                    onChange={(e) =>
                      setPreviewVars((prev) => ({
                        ...prev,
                        [k]:
                          k.toLowerCase().includes("days")
                            ? Number(e.target.value || 0)
                            : e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 bg-theme-primary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] text-sm"
                  />
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium text-theme-secondary mb-1">
                  year
                </label>
                <input
                  type="number"
                  value={String(previewVars.year ?? new Date().getFullYear())}
                  onChange={(e) =>
                    setPreviewVars((prev) => ({
                      ...prev,
                      year: Number(e.target.value || new Date().getFullYear()),
                    }))
                  }
                  className="w-full px-3 py-2 bg-theme-primary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] text-sm"
                />
              </div>
            </div>

            <div className="rounded-lg overflow-hidden border border-theme bg-white">
              <iframe
                title="Email template preview"
                className="w-full"
                style={{ height: 760 }}
                sandbox=""
                srcDoc={previewHtml}
              />
            </div>
            <p className="text-xs text-theme-muted mt-3">
              Note: some email-client-specific behaviors (Outlook quirks, Gmail clipping) can only be validated by sending a test email.
            </p>
            <Form method="post" className="mt-4">
              <input type="hidden" name="intent" value="sendPreview" />
              <input type="hidden" name="subject" value={subject} />
              <input type="hidden" name="bodyHtml" value={bodyHtml} />
              <input type="hidden" name="previewVars" value={JSON.stringify(previewVars)} />
              <button
                type="submit"
                disabled={isSendingPreview}
                className="px-4 py-2 btn-secondary rounded-lg hover:bg-theme-secondary transition disabled:opacity-50 text-sm"
              >
                {isSendingPreview ? "Sending…" : "Send preview email to me"}
              </button>
            </Form>
          </div>
        </div>
      </div>
    </div>
  );
}
