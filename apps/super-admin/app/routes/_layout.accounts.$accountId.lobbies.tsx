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
        <div className="card overflow-hidden">
          <table className="table-theme">
            <thead>
              <tr>
                <th>Name</th>
                <th>Slug</th>
                <th>Status</th>
                <th>Tracks</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {lobbies.map((lobby) => {
                const lobbyUrl = lobby.isDefault
                  ? `${protocol}://${accountSlug}.${baseDomain}`
                  : `${protocol}://${accountSlug}.${baseDomain}/${lobby.slug}`;

                return (
                  <tr key={lobby.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{lobby.name}</span>
                        {lobby.isDefault && (
                          <span className="px-1.5 py-0.5 text-xs rounded bg-blue-500/20 text-blue-400">
                            Default
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="text-theme-secondary font-mono text-sm">
                      {lobby.slug}
                    </td>
                    <td>
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
                    <td className="text-theme-secondary">
                      {lobby._count.tracks}
                    </td>
                    <td className="text-theme-secondary text-sm">
                      {new Date(lobby.createdAt).toLocaleDateString()}
                    </td>
                    <td>
                      <a
                        href={lobbyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="link-primary transition text-sm"
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
        <div className="card p-12 text-center">
          <p className="text-theme-secondary">No lobbies created yet.</p>
        </div>
      )}
    </div>
  );
}
