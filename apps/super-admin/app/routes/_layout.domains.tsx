import { useLoaderData } from "react-router";
import type { Route } from "./+types/_layout.domains";
import { prisma } from "@secretlobby/db";

export function meta() {
  return [{ title: "Domains - Super Admin" }];
}

export async function loader({ request }: Route.LoaderArgs) {
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

      <div className="card overflow-hidden">
        <table className="table-theme">
          <thead>
            <tr>
              <th>Domain</th>
              <th>Account</th>
              <th>Status</th>
              <th>SSL</th>
              <th>Verified At</th>
            </tr>
          </thead>
          <tbody>
            {domains.map((domain) => (
              <tr key={domain.id}>
                <td className="font-medium">{domain.domain}</td>
                <td className="text-theme-secondary">{domain.account.name}</td>
                <td>
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
                <td>
                  {domain.sslEnabled ? (
                    <span className="text-green-400">Enabled</span>
                  ) : (
                    <span className="text-theme-muted">Disabled</span>
                  )}
                </td>
                <td className="text-theme-secondary text-sm">
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
