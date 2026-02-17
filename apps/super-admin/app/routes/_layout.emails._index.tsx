import { useLoaderData, Link } from "react-router";
import type { Route } from "./+types/_layout.emails._index";

export function meta() {
  return [{ title: "Notification Emails - Super Admin" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { getSession, requireAdminRole } = await import("@secretlobby/auth");
  const { prisma } = await import("@secretlobby/db");

  const { session } = await getSession(request);
  requireAdminRole(session);

  const [elements, templates] = await Promise.all([
    prisma.emailHtmlElement.findMany({ orderBy: { key: "asc" } }),
    prisma.emailTemplate.findMany({ orderBy: { key: "asc" } }),
  ]);

  return { elements, templates };
}

export default function EmailsIndexPage() {
  const { elements, templates } = useLoaderData<typeof loader>();

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-2">Notification Emails</h2>
        <p className="text-theme-secondary text-sm">
          Manage reusable HTML blocks (header, footer) and notification email templates.
          Use table-based inline HTML for best compatibility across email clients.
        </p>
      </div>

      <div className="space-y-8">
        {/* Reusable HTML elements */}
        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b border-theme">
            <h3 className="text-lg font-semibold">Reusable HTML Elements</h3>
            <p className="text-sm text-theme-secondary mt-1">
              Header and footer are included in every notification email. Edit the HTML below (inline styles only).
            </p>
          </div>
          <div>
            {elements.length === 0 ? (
              <div className="px-6 py-8 text-center text-theme-secondary">
                No elements yet. Run <code className="bg-theme-tertiary px-2 py-1 rounded">pnpm run db:seed</code> to create default header and footer.
              </div>
            ) : (
              elements.map((el, index) => (
                <div key={el.id} className={`px-6 py-4 flex items-center justify-between ${index < elements.length - 1 ? 'border-b border-[var(--color-border)]' : ''}`}>
                  <div>
                    <span className="font-medium">{el.name}</span>
                    <span className="text-theme-muted text-sm ml-2">({el.key})</span>
                  </div>
                  <Link
                    to={`/emails/elements/${el.key}`}
                    className="px-4 py-2 bg-theme-tertiary text-sm rounded-lg hover:bg-theme-secondary transition"
                  >
                    Edit HTML
                  </Link>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Notification templates */}
        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b border-theme">
            <h3 className="text-lg font-semibold">Notification Templates</h3>
            <p className="text-sm text-theme-secondary mt-1">
              Subject and body for each notification type. Placeholders: {"{{userName}}"}, {"{{inviteUrl}}"}, {"{{verificationUrl}}"}, {"{{resetUrl}}"}, {"{{expiresInDays}}"}.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="table-theme">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Key</th>
                  <th>Subject</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {templates.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center text-theme-secondary !py-8">
                      No templates yet. Run <code className="bg-theme-tertiary px-2 py-1 rounded">pnpm run db:seed</code> to create defaults.
                    </td>
                  </tr>
                ) : (
                  templates.map((t) => (
                    <tr key={t.id}>
                      <td className="font-medium">{t.name}</td>
                      <td className="text-theme-secondary text-sm">{t.key}</td>
                      <td className="text-theme-primary text-sm max-w-xs truncate">{t.subject}</td>
                      <td>
                        <Link
                          to={`/emails/templates/${t.key}`}
                          className="px-4 py-2 bg-theme-tertiary text-sm rounded-lg hover:bg-theme-secondary transition"
                        >
                          Edit
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
