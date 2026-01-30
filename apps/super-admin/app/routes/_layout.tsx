import { NavLink, Form, Outlet, useLoaderData, redirect } from "react-router";
import type { Route } from "./+types/_layout";
import { getSession, requireUserAuth, isAdmin } from "@secretlobby/auth";

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

  return {
    user: {
      name: session.userName,
      email: session.userEmail,
    },
  };
}

const navItems = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/accounts", label: "Accounts" },
  { to: "/users", label: "Users" },
  { to: "/domains", label: "Domains" },
  { to: "/plans", label: "Plans" },
  { to: "/settings", label: "Settings" },
];

export default function Layout() {
  const { user } = useLoaderData<typeof loader>();

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

      <main>
        <Outlet />
      </main>
    </div>
  );
}
