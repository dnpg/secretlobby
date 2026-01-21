import { NavLink, Form, useLoaderData, redirect } from "react-router";
import type { Route } from "./+types/_index";
import { getSession, requireUserAuth, isAdmin } from "@secretlobby/auth";
import { prisma } from "@secretlobby/db";

export function meta() {
  return [{ title: "Super Admin - Dashboard" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { session } = await getSession(request);

  try {
    requireUserAuth(session, "/login");
  } catch {
    throw redirect("/login");
  }

  // TODO: Add super admin role check
  // For now, just require admin role
  if (!isAdmin(session)) {
    throw redirect("/login");
  }

  // Get stats
  const [accountCount, userCount, domainCount] = await Promise.all([
    prisma.account.count(),
    prisma.user.count(),
    prisma.domain.count(),
  ]);

  return {
    user: {
      name: session.userName,
      email: session.userEmail,
    },
    stats: {
      accounts: accountCount,
      users: userCount,
      domains: domainCount,
    },
  };
}

const navItems = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/accounts", label: "Accounts" },
  { to: "/users", label: "Users" },
  { to: "/domains", label: "Domains" },
];

export default function SuperAdminDashboard() {
  const { user, stats } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen">
      <header className="bg-gray-800 border-b border-gray-700">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-red-500">Super Admin</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-400">{user.name || user.email}</span>
            <Form method="post" action="/logout">
              <button
                type="submit"
                className="px-4 py-2 text-sm bg-gray-700 rounded-lg hover:bg-gray-600 transition"
              >
                Logout
              </button>
            </Form>
          </div>
        </div>
      </header>

      <nav className="bg-gray-800 border-b border-gray-700">
        <div className="container mx-auto px-4">
          <div className="flex gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `px-4 py-3 text-sm font-medium transition border-b-2 ${
                    isActive
                      ? "border-red-500 text-white"
                      : "border-transparent text-gray-400 hover:text-white"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-8">
        <h2 className="text-2xl font-bold mb-8">Dashboard</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <h3 className="text-gray-400 text-sm font-medium uppercase tracking-wider">
              Total Accounts
            </h3>
            <p className="text-4xl font-bold mt-2">{stats.accounts}</p>
          </div>

          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <h3 className="text-gray-400 text-sm font-medium uppercase tracking-wider">
              Total Users
            </h3>
            <p className="text-4xl font-bold mt-2">{stats.users}</p>
          </div>

          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <h3 className="text-gray-400 text-sm font-medium uppercase tracking-wider">
              Custom Domains
            </h3>
            <p className="text-4xl font-bold mt-2">{stats.domains}</p>
          </div>
        </div>
      </main>
    </div>
  );
}
