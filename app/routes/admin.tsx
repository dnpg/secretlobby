import { Outlet, NavLink, redirect, Form, useLoaderData } from "react-router";
import type { Route } from "./+types/admin";
import { getSession, requireUserAuth } from "~/lib/session.server";
import { ColorModeToggle } from "~/components/ColorModeToggle";

export async function loader({ request }: Route.LoaderArgs) {
  const { session } = await getSession(request);

  // Require user-based authentication
  requireUserAuth(session);

  return {
    user: {
      name: session.userName,
      email: session.userEmail,
    },
    account: {
      id: session.currentAccountId,
      slug: session.currentAccountSlug,
      role: session.currentAccountRole,
    },
  };
}

const navItems = [
  { to: "", label: "Content", end: true },
  { to: "media", label: "Media" },
  { to: "playlist", label: "Playlist" },
  { to: "theme", label: "Theme" },
];

export default function AdminLayout() {
  const { user, account } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen bg-theme-primary text-theme-primary">
      <header className="bg-theme-secondary border-b border-theme">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold">Admin Panel</h1>
          <div className="flex items-center gap-4">
            {/* User info */}
            <div className="text-sm text-theme-secondary hidden sm:block">
              {user.name || user.email}
              {account.role && (
                <span className="ml-2 px-2 py-0.5 text-xs bg-theme-tertiary rounded-full">
                  {account.role}
                </span>
              )}
            </div>
            <ColorModeToggle />
            <NavLink
              to="/player"
              className="px-4 py-2 text-sm btn-primary rounded-lg transition cursor-pointer"
            >
              View Player
            </NavLink>
            <Form method="post" action="/logout">
              <button
                type="submit"
                className="px-4 py-2 text-sm btn-secondary rounded-lg transition cursor-pointer"
              >
                Logout
              </button>
            </Form>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="bg-theme-secondary border-b border-theme">
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
                      ? "border-[var(--color-accent)] text-theme-primary"
                      : "border-transparent text-theme-secondary hover:text-theme-primary"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <Outlet />
      </main>
    </div>
  );
}
