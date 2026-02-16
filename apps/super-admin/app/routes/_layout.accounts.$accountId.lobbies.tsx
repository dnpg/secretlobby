import { useLoaderData } from "react-router";
import type { Route } from "./+types/_layout.accounts.$accountId.lobbies";
import { prisma } from "@secretlobby/db";

export function meta() {
  return [{ title: "Account Lobbies - Super Admin" }];
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const { accountId } = params;

  const lobbies = await prisma.lobby.findMany({
    where: { accountId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: {
          tracks: true,
        },
      },
    },
  });

  // Get base domain from environment
  const baseDomain = process.env.CORE_DOMAIN || "secretlobby.co";

  // Get account slug for subdomain URLs
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { slug: true },
  });

  // Detect if we're in local development
  const url = new URL(request.url);
  const hostname = request.headers.get("host") || url.hostname;
  const isLocalDev = hostname.includes("localhost") || hostname.includes(".local");
  const protocol = isLocalDev ? "http" : "https";

  return {
    lobbies,
    accountSlug: account?.slug || "",
    baseDomain,
    protocol,
  };
}

export default function AccountLobbies() {
  const { lobbies, accountSlug, baseDomain, protocol } = useLoaderData<typeof loader>();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Lobbies ({lobbies.length})</h3>
      </div>

      {lobbies.length > 0 ? (
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Slug
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Tracks
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
              {lobbies.map((lobby) => {
                const lobbyUrl = lobby.isDefault
                  ? `${protocol}://${accountSlug}.${baseDomain}`
                  : `${protocol}://${accountSlug}.${baseDomain}/${lobby.slug}`;

                return (
                  <tr key={lobby.id} className="hover:bg-gray-750">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{lobby.name}</span>
                        {lobby.isDefault && (
                          <span className="px-1.5 py-0.5 text-xs rounded bg-blue-500/20 text-blue-400">
                            Default
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-400 font-mono text-sm">
                      {lobby.slug}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-xs rounded-full ${
                          lobby.isPublished
                            ? "bg-green-500/20 text-green-400"
                            : "bg-yellow-500/20 text-yellow-400"
                        }`}
                      >
                        {lobby.isPublished ? "Published" : "Draft"}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-400">
                      {lobby._count.tracks}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-400 text-sm">
                      {new Date(lobby.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <a
                        href={lobbyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 transition text-sm"
                      >
                        View
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-12 text-center">
          <p className="text-gray-400">No lobbies created yet.</p>
        </div>
      )}
    </div>
  );
}
