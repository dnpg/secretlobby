import { useLoaderData, Form, useActionData, useNavigation, Link } from "react-router";
import type { Route } from "./+types/_layout.emails.templates.$key";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

export function meta({ params }: Route.MetaArgs) {
  return [{ title: `Edit template: ${params.key} - Super Admin` }];
}

const WRAPPER_START = `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
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
<body style="margin:0; padding:0; -webkit-text-size-adjust:100%; background-color:#ffffff;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#ffffff;">
    <tr>
      <td align="center" style="padding:20px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px; margin:0 auto; background-color:#ffffff;">`;

const WRAPPER_END = `</table>
      </td>
    </tr>
  </table>
</body>
</html>`;

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

  const { session } = await getSession(request);
  requireAdminRole(session);

  const key = params.key;
  if (!key) return { error: "Missing key" };

  const formData = await request.formData();
  const subject = formData.get("subject") as string;
  const bodyHtml = formData.get("bodyHtml") as string;

  if (!subject?.trim()) return { error: "Subject is required" };
  if (bodyHtml == null) return { error: "Body HTML is required" };

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

  const [subject, setSubject] = useState(template.subject);
  const [bodyHtml, setBodyHtml] = useState(template.bodyHtml);
  const [previewVars, setPreviewVars] = useState<Record<string, string | number>>(() => ({
    ...getDefaultPreviewVars(template.key),
    year: new Date().getFullYear(),
    consoleUrl,
  }));

  useEffect(() => {
    if (actionData?.success) toast.success("Template saved");
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
        <Link to="/emails" className="text-gray-400 hover:text-white transition">
          ← Back to Emails
        </Link>
      </div>

      <div className="mb-8">
        <h2 className="text-2xl font-bold">Edit template: {template.name}</h2>
        <p className="text-gray-400 text-sm mt-1">
          Key: <code className="bg-gray-800 px-2 py-0.5 rounded">{template.key}</code>. Use placeholders: {"{{userName}}"}, {"{{inviteUrl}}"}, {"{{verificationUrl}}"}, {"{{resetUrl}}"}, {"{{expiresInDays}}"}.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Form method="post" className="space-y-6">
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
            <label className="block text-sm font-medium text-gray-400 mb-2">Subject line</label>
            <input
              type="text"
              name="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-red-500 font-mono"
            />
          </div>

          <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
            <label className="block text-sm font-medium text-gray-400 mb-2">Body HTML (table-based, inline styles only)</label>
            <p className="text-xs text-gray-500 mb-2">
              Use tables and inline styles for compatibility with Gmail, Outlook, Apple Mail. Avoid external CSS or complex layout.
            </p>
            <textarea
              name="bodyHtml"
              value={bodyHtml}
              onChange={(e) => setBodyHtml(e.target.value)}
              rows={24}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-red-500 font-mono text-sm"
              spellCheck={false}
            />
          </div>

          <div className="flex flex-wrap gap-4 items-center">
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50"
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
              className="px-6 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition"
            >
              Revert to default
            </button>
            <Link to="/emails" className="px-6 py-2 bg-gray-700 rounded-lg hover:bg-gray-600 transition">
              Cancel
            </Link>
          </div>
        </Form>

        <div className="space-y-6">
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Preview</h3>
              <span className="text-xs text-gray-400">
                Rendered in a sandboxed iframe
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              {Object.keys(getDefaultPreviewVars(template.key)).map((k) => (
                <div key={k}>
                  <label className="block text-xs font-medium text-gray-400 mb-1">
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
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
                  />
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">
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
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
                />
              </div>
            </div>

            <div className="rounded-lg overflow-hidden border border-gray-700 bg-white">
              <iframe
                title="Email template preview"
                className="w-full"
                style={{ height: 760 }}
                sandbox=""
                srcDoc={previewHtml}
              />
            </div>
            <p className="text-xs text-gray-500 mt-3">
              Note: some email-client-specific behaviors (Outlook quirks, Gmail clipping) can only be validated by sending a test email.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
