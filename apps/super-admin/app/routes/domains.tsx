import { useLoaderData, redirect } from "react-router";
import type { Route } from "./+types/domains";
import { getSession, requireUserAuth, isAdmin } from "@secretlobby/auth";
import { prisma } from "@secretlobby/db";

export function meta() {
  return [{ title: "Domains - Super Admin" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { session } = await getSession(request);

  try {
    requireUserAuth(session, "/login");
  } catch {
    throw redirect("/login");
  }

  if (!isAdmin(session)) {
    throw redirect("/login");
  }

  const domains = await prisma.domain.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      account: {
        select: { name: true, slug: true },
      },
    },
  });

  return { domains };
}

export default function DomainsPage() {
  const { domains } = useLoaderData<typeof loader>();

  return (
    <div className="container mx-auto px-4 py-8">
      <h2 className="text-2xl font-bold mb-8">Custom Domains</h2>

      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-700">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Domain
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Account
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                SSL
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Verified At
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {domains.map((domain) => (
              <tr key={domain.id} className="hover:bg-gray-750">
                <td className="px-6 py-4 whitespace-nowrap font-medium">
                  {domain.domain}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-gray-400">
                  {domain.account.name}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`px-2 py-1 text-xs rounded-full ${
                      domain.status === "VERIFIED"
                        ? "bg-green-500/20 text-green-400"
                        : domain.status === "PENDING"
                        ? "bg-yellow-500/20 text-yellow-400"
                        : "bg-red-500/20 text-red-400"
                    }`}
                  >
                    {domain.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {domain.sslEnabled ? (
                    <span className="text-green-400">Enabled</span>
                  ) : (
                    <span className="text-gray-500">Disabled</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-gray-400 text-sm">
                  {domain.verifiedAt
                    ? new Date(domain.verifiedAt).toLocaleDateString()
                    : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
