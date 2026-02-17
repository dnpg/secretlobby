import { useLoaderData, Link } from "react-router";
import type { Route } from "./+types/_layout.users._index";
import { prisma } from "@secretlobby/db";

function formatDateYYYYMMDD(d: Date): string {
  // Deterministic across server/client (avoids hydration mismatch from locale formatting)
  return d.toISOString().slice(0, 10);
}

export function meta() {
  return [{ title: "Users - Super Admin" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      emailVerified: true,
      lastLoginAt: true,
    },
  });

  return { users };
}

export default function UsersIndex() {
  const { users } = useLoaderData<typeof loader>();

  return (
    <>
      <div className="flex justify-end mb-4">
        <Link
          to="/users/new"
          className="px-4 py-2 text-sm font-medium btn-primary rounded-lg transition"
        >
          New User
        </Link>
      </div>

      <div className="bg-theme-secondary rounded-xl border border-theme overflow-hidden">
        <table className="table-theme">
          <thead>
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-theme-muted uppercase tracking-wider">
                Email
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-theme-muted uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-theme-muted uppercase tracking-wider">
                Verified
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-theme-muted uppercase tracking-wider">
                Last Login
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-theme-muted uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-theme-tertiary">
                <td className="px-6 py-4 whitespace-nowrap font-medium text-theme-primary">
                  {user.email}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-theme-secondary">
                  {user.name || "—"}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {user.emailVerified ? (
                    <span className="text-green-500">Yes</span>
                  ) : (
                    <span className="text-theme-muted">No</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-theme-secondary text-sm">
                  {user.lastLoginAt
                    ? formatDateYYYYMMDD(new Date(user.lastLoginAt))
                    : "Never"}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <Link
                    to={`/users/${user.id}`}
                    className="text-sm text-(--color-brand-red) hover:text-(--color-brand-red-hover) transition cursor-pointer"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
