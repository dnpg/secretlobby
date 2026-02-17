import { useLoaderData } from "react-router";
import type { Route } from "./+types/_layout.accounts.$accountId.users";
import { prisma } from "@secretlobby/db";

export function meta() {
  return [{ title: "Account Users - Super Admin" }];
}

export async function loader({ params }: Route.LoaderArgs) {
  const { accountId } = params;

  const accountUsers = await prisma.accountUser.findMany({
    where: { accountId },
    orderBy: { createdAt: "desc" },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          createdAt: true,
          lastLoginAt: true,
        },
      },
    },
  });

  return { accountUsers };
}

export default function AccountUsers() {
  const { accountUsers } = useLoaderData<typeof loader>();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Users ({accountUsers.length})</h3>
      </div>

      {accountUsers.length > 0 ? (
        <div className="card overflow-hidden">
          <table className="table-theme">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Joined Account</th>
                <th>Last Login</th>
              </tr>
            </thead>
            <tbody>
              {accountUsers.map((accountUser) => (
                <tr key={accountUser.id}>
                  <td>
                    <div>
                      <div className="font-medium">
                        {accountUser.user.name || "—"}
                      </div>
                      <div className="text-sm text-theme-secondary">
                        {accountUser.user.email}
                      </div>
                    </div>
                  </td>
                  <td>
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${
                        accountUser.role === "OWNER"
                          ? "bg-purple-500/20 text-purple-400"
                          : accountUser.role === "ADMIN"
                          ? "bg-(--color-brand-red-muted) text-(--color-brand-red)"
                          : "bg-theme-tertiary text-theme-secondary"
                      }`}
                    >
                      {accountUser.role}
                    </span>
                  </td>
                  <td className="text-theme-secondary text-sm">
                    {new Date(accountUser.createdAt).toLocaleDateString()}
                  </td>
                  <td className="text-theme-secondary text-sm">
                    {accountUser.user.lastLoginAt
                      ? new Date(accountUser.user.lastLoginAt).toLocaleString()
                      : "Never"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card p-12 text-center">
          <p className="text-theme-secondary">No users in this account.</p>
        </div>
      )}
    </div>
  );
}
