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
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Joined Account
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Last Login
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {accountUsers.map((accountUser) => (
                <tr key={accountUser.id} className="hover:bg-gray-750">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="font-medium">
                        {accountUser.user.name || "—"}
                      </div>
                      <div className="text-sm text-gray-400">
                        {accountUser.user.email}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${
                        accountUser.role === "OWNER"
                          ? "bg-purple-500/20 text-purple-400"
                          : accountUser.role === "ADMIN"
                          ? "bg-blue-500/20 text-blue-400"
                          : "bg-gray-600 text-gray-300"
                      }`}
                    >
                      {accountUser.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-400 text-sm">
                    {new Date(accountUser.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-400 text-sm">
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
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-12 text-center">
          <p className="text-gray-400">No users in this account.</p>
        </div>
      )}
    </div>
  );
}
