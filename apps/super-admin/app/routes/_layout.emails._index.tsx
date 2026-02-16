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
        <p className="text-gray-400 text-sm">
          Manage reusable HTML blocks (header, footer) and notification email templates.
          Use table-based inline HTML for best compatibility across email clients.
        </p>
      </div>

      <div className="space-y-8">
        {/* Reusable HTML elements */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-700">
            <h3 className="text-lg font-semibold">Reusable HTML Elements</h3>
            <p className="text-sm text-gray-400 mt-1">
              Header and footer are included in every notification email. Edit the HTML below (inline styles only).
            </p>
          </div>
          <div className="divide-y divide-gray-700">
            {elements.length === 0 ? (
              <div className="px-6 py-8 text-center text-gray-400">
                No elements yet. Run <code className="bg-gray-700 px-2 py-1 rounded">pnpm run db:seed</code> to create default header and footer.
              </div>
            ) : (
              elements.map((el) => (
                <div key={el.id} className="px-6 py-4 flex items-center justify-between">
                  <div>
                    <span className="font-medium">{el.name}</span>
                    <span className="text-gray-500 text-sm ml-2">({el.key})</span>
                  </div>
                  <Link
                    to={`/emails/elements/${el.key}`}
                    className="px-4 py-2 bg-gray-700 text-sm rounded-lg hover:bg-gray-600 transition"
                  >
                    Edit HTML
                  </Link>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Notification templates */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-700">
            <h3 className="text-lg font-semibold">Notification Templates</h3>
            <p className="text-sm text-gray-400 mt-1">
              Subject and body for each notification type. Placeholders: {"{{userName}}"}, {"{{inviteUrl}}"}, {"{{verificationUrl}}"}, {"{{resetUrl}}"}, {"{{expiresInDays}}"}.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Key</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Subject</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {templates.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-gray-400">
                      No templates yet. Run <code className="bg-gray-700 px-2 py-1 rounded">pnpm run db:seed</code> to create defaults.
                    </td>
                  </tr>
                ) : (
                  templates.map((t) => (
                    <tr key={t.id}>
                      <td className="px-6 py-4 font-medium">{t.name}</td>
                      <td className="px-6 py-4 text-gray-400 text-sm">{t.key}</td>
                      <td className="px-6 py-4 text-gray-300 text-sm max-w-xs truncate">{t.subject}</td>
                      <td className="px-6 py-4">
                        <Link
                          to={`/emails/templates/${t.key}`}
                          className="px-4 py-2 bg-gray-700 text-sm rounded-lg hover:bg-gray-600 transition"
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
