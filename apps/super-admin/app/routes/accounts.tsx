import { useLoaderData, redirect } from "react-router";
import type { Route } from "./+types/accounts";
import { getSession, requireUserAuth, isAdmin } from "@secretlobby/auth";
import { prisma } from "@secretlobby/db";

export function meta() {
  return [{ title: "Accounts - Super Admin" }];
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

  const accounts = await prisma.account.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: {
          users: true,
          lobbies: true,
        },
      },
    },
  });

  return { accounts };
}

export default function AccountsPage() {
  const { accounts } = useLoaderData<typeof loader>();

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
                Slug
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
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {accounts.map((account) => (
              <tr key={account.id} className="hover:bg-gray-750">
                <td className="px-6 py-4 whitespace-nowrap font-medium">
                  {account.name}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-gray-400">
                  {account.slug}
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
