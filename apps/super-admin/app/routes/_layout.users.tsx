import { useLoaderData } from "react-router";
import type { Route } from "./+types/_layout.users";
import { prisma } from "@secretlobby/db";

export function meta() {
  return [{ title: "Users - Super Admin" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      accounts: {
        include: {
          account: {
            select: { name: true, slug: true },
          },
        },
      },
    },
  });

  return { users };
}

export default function UsersPage() {
  const { users } = useLoaderData<typeof loader>();

  return (
    <div className="container mx-auto px-4 py-8">
      <h2 className="text-2xl font-bold mb-8">Users</h2>

      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-700">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Email
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Verified
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Accounts
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Last Login
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-gray-750">
                <td className="px-6 py-4 whitespace-nowrap font-medium">
                  {user.email}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-gray-400">
                  {user.name || "-"}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {user.emailVerified ? (
                    <span className="text-green-400">Yes</span>
                  ) : (
                    <span className="text-gray-500">No</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-gray-400">
                  {user.accounts.length}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-gray-400 text-sm">
                  {user.lastLoginAt
                    ? new Date(user.lastLoginAt).toLocaleDateString()
                    : "Never"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
