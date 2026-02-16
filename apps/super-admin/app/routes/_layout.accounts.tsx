import { useLoaderData, Link } from "react-router";
import type { Route } from "./+types/_layout.accounts";
import { prisma } from "@secretlobby/db";

export function meta() {
  return [{ title: "Accounts - Super Admin" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const accounts = await prisma.account.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: {
          users: true,
          lobbies: true,
        },
      },
      domains: {
        where: { status: "VERIFIED" },
        orderBy: { createdAt: "asc" },
        take: 1,
      },
    },
  });

  // Get base domain from environment
  const baseDomain = process.env.CORE_DOMAIN || "secretlobby.co";
  const consoleDomain = process.env.CONSOLE_DOMAIN || `console.${baseDomain}`;

  // Detect if we're in local development
  const url = new URL(request.url);
  const hostname = request.headers.get("host") || url.hostname;
  const isLocalDev = hostname.includes("localhost") || hostname.includes(".local");
  const protocol = isLocalDev ? "http" : "https";

  return {
    accounts,
    baseDomain,
    consoleDomain,
    protocol,
  };
}

export default function AccountsPage() {
  const { accounts, baseDomain, consoleDomain, protocol } = useLoaderData<typeof loader>();

  return (
    <div className="container mx-auto px-4 py-8">
      <h2 className="text-2xl font-bold mb-8">Accounts</h2>

      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-700">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Primary Domain
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Tier
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Users
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Lobbies
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Created
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {accounts.map((account) => {
              const customDomain = account.domains[0]?.domain;
              const primaryDomain = customDomain || `${account.slug}.${baseDomain}`;
              const lobbyUrl = `${protocol}://${primaryDomain}`;
              const consoleUrl = `${protocol}://${consoleDomain}`;

              return (
                <tr key={account.id} className="hover:bg-gray-750">
                  <td className="px-6 py-4 whitespace-nowrap font-medium">
                    <Link
                      to={`/accounts/${account.id}`}
                      className="text-blue-400 hover:text-blue-300 transition"
                    >
                      {account.name}
                    </Link>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <a
                        href={lobbyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 transition"
                      >
                        {primaryDomain}
                      </a>
                      {customDomain ? (
                        <span className="px-1.5 py-0.5 text-xs rounded bg-green-500/20 text-green-400">
                          Custom
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 text-xs rounded bg-gray-600 text-gray-400">
                          Subdomain
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2 py-1 text-xs rounded-full bg-gray-700">
                      {account.subscriptionTier}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-400">
                    {account._count.users}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-400">
                    {account._count.lobbies}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-400 text-sm">
                    {new Date(account.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <a
                      href={consoleUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-gray-400 hover:text-white transition"
                      title="Open Console"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
                      </svg>
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
