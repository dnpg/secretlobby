import { NavLink, Form, Outlet, useLoaderData, redirect } from "react-router";
import type { Route } from "./+types/_layout";
import { getSession, requireUserAuth, isAdmin, isStaffOwner } from "@secretlobby/auth";
import { ColorModeToggle } from "@secretlobby/ui";

function Logo({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 572.4 572.4"
      className={className}
      aria-label="Secret Lobby"
    >
      <circle
        cx="286.2"
        cy="286.2"
        r="226"
        fill="currentColor"
        className="text-[#ed1b2f]"
        stroke="#231f20"
        strokeMiterlimit="10"
        strokeWidth="15.6"
      />
      <g fill="#231f20">
        <path d="M172.2,264l-2.9-3.5c-.9-1.1-.9-2.5.2-3.3,4.8-3.1,8.5-5.5,10.6-12.4,1.9-6.2-.6-11.3-5.2-12.7-5.4-1.7-10.2,1.9-16.6,9.6-6.7,7.9-13.7,13.6-24,10.4-7-2.2-14.9-10.5-10.4-24.7,2.8-8.9,9.5-14.2,10.4-14.9.7-.6,2.1-.9,3.2.4l2.7,3.3c.9,1.1,1.1,2.4,0,3.4-3.3,2.8-6.6,5.5-8.2,10.7-2.3,7.5,1.6,11.6,4.9,12.6,5.1,1.6,9.5-1.4,14.8-7.8,7.4-9.1,15.1-16.4,26-13,9.3,2.9,14.3,13.6,10.7,25.2-3.4,10.9-11.3,16-13.1,17-1,.6-1.8,1.1-3-.4Z" />
        <path d="M155.3,172.4c-.7-.7-.7-1.8,0-2.5l26.6-26.4c.7-.7,1.9-.7,2.5,0l3.7,3.7c.7.7.7,1.8,0,2.5l-21,20.8,13.5,13.6,17.8-17.6c.7-.7,1.9-.7,2.5,0l3.7,3.7c.7.7.7,1.9,0,2.5l-17.8,17.6,14.2,14.3,21-20.8c.7-.7,1.9-.7,2.5,0l3.6,3.7c.7.7.7,1.8,0,2.5l-26.6,26.4c-.7.7-1.9.7-2.5,0l-43.6-44Z" />
        <path d="M247.3,112.6c9.1-2.5,16.6-1.2,24.2,2.5,1,.5,1.3,1.6.8,2.5l-2.9,5.1c-.4,1-1.2,1.2-2.3.6-5.2-2.6-11.7-3.4-17.3-1.8-12.9,3.5-19.8,17-16.4,29.6,3.4,12.7,16.2,20.8,29.1,17.3,6.6-1.8,10.5-5.6,14-10.2.6-.9,1.5-1,2.1-.7l5.3,3c.9.4,1,1.7.6,2.5-4.5,7.6-11.6,12.5-19.6,14.7-18.1,4.9-36.5-5.6-41.4-23.7-4.9-18.1,5.8-36.6,23.9-41.4Z" />
        <path d="M310.5,111.2c.3-.9,1.2-1.5,2.2-1.2l24.5,6.9c10.8,3.1,17.2,14.1,14.2,24.8-2.3,8.3-9.8,13.6-18.5,14.5l5.9,26.4c.3,1.4-.7,2.6-2.3,2.2l-6.8-1.9c-1-.3-1.4-.9-1.6-1.7l-5.2-26.9-13.6-3.8-6.5,23c-.3.9-1.3,1.5-2.2,1.2l-5.9-1.7c-1-.3-1.5-1.3-1.2-2.2l16.8-59.7ZM327.8,147.3c5.9,1.7,12.4-1.9,14.2-8.1,1.7-5.9-2.1-12.2-8-13.8l-16-4.5-6.2,21.9,16,4.5Z" />
        <path d="M392,147.2c.7-.7,1.8-.7,2.5,0l26.4,26.6c.7.7.7,1.9,0,2.5l-3.7,3.7c-.7.7-1.8.7-2.5,0l-20.9-21-13.6,13.5,17.6,17.7c.7.7.7,1.9,0,2.5l-3.7,3.7c-.7.7-1.9.7-2.5,0l-17.6-17.7-14.3,14.2,20.9,21c.7.7.7,1.9,0,2.5l-3.7,3.6c-.7.7-1.8.7-2.5,0l-26.4-26.6c-.7-.7-.7-1.9,0-2.5l44-43.7Z" />
        <path d="M438.1,226.4l-4.5-14.6c-.3-1,.3-1.9,1.2-2.2l5-1.5c.9-.3,1.9.2,2.2,1.2l11.8,38.5c.3,1-.3,1.9-1.2,2.2l-5,1.5c-.9.3-1.9-.2-2.2-1.2l-4.5-14.6-52.5,16.2c-.9.3-1.9-.3-2.2-1.2l-1.8-5.9c-.3-.9.3-1.9,1.2-2.2l52.6-16.2Z" />
      </g>
      <g fill="#231f20">
        <path d="M183.7,326.3c.8-.5,1.9-.2,2.4.7l3,5.4c.5.8.1,2-.7,2.4l-48,27.1,12.5,22.1c.5.9.1,2-.7,2.4l-4.5,2.5c-.8.5-1.9.2-2.4-.7l-16.4-29c-.5-.9-.1-2,.7-2.4l54-30.5Z" />
        <path d="M231.6,377.2c16.1,9.6,21.2,30.3,11.5,46.3-9.6,16.1-30.1,21.1-46.2,11.5-16.1-9.6-21.2-30.1-11.6-46.1,9.6-16.1,30.2-21.4,46.2-11.7ZM201.6,427.3c11.5,6.9,26.6,3,33.5-8.5,6.8-11.4,3.3-26.8-8.2-33.7-11.4-6.8-26.7-2.7-33.5,8.7-6.9,11.5-3.2,26.7,8.2,33.5Z" />
        <path d="M303.2,425c5.7,2,11.3,6.5,11.5,14.8.3,10.5-8.1,18.3-19.9,18.7l-22,.7c-1,0-1.8-.8-1.8-1.7l-1.9-62c0-.9.7-1.8,1.7-1.8l21-.6c11.3-.3,19.7,6.9,20,16.7.2,7-3.6,12.4-8.6,15.1v.2ZM291.8,421.5c6-.2,9.9-4.4,9.7-10.3-.2-6.2-4.3-9.5-10.3-9.3l-12.3.4.6,19.7,12.3-.4ZM294.9,449.9c6.4-.2,9.6-4.7,9.4-10.5-.2-5.7-4.6-9.7-10-9.5l-14.6.4.6,20,14.6-.4Z" />
        <path d="M369.1,399c5.9-1.1,13,.1,17.3,7.3,5.4,9,2,19.9-8.1,26l-18.8,11.4c-.9.5-2,.2-2.4-.6l-32.1-53.1c-.5-.8-.3-1.9.6-2.4l18-10.8c9.7-5.9,20.6-3.7,25.6,4.8,3.6,6,3,12.5-.1,17.4v.2ZM357.4,401.5c5.1-3.1,6.4-8.7,3.4-13.8-3.2-5.3-8.4-6.2-13.6-3.1l-10.5,6.3,10.2,16.8,10.5-6.3ZM374.1,424.7c5.5-3.3,6.1-8.8,3.1-13.8-3-4.9-8.8-6.2-13.4-3.4l-12.5,7.6,10.4,17.2,12.5-7.6Z" />
        <path d="M399.6,353.2l-11.7-26.6c-.2-.4-.3-1.2,0-1.7l3.6-6c.8-1.3,2.4-1.2,3.1.1l15.4,35.1,25.6,15.3c.8.5,1.1,1.6.6,2.4l-3.2,5.3c-.5.9-1.6,1.1-2.4.6l-25.6-15.3-38.1,2.7c-1.4,0-2.3-1.4-1.6-2.7l3.6-5.9c.4-.6,1-.8,1.5-.9l29-2.3v-.2Z" />
      </g>
      <line
        x1="60.3"
        y1="286.2"
        x2="512.2"
        y2="286.2"
        fill="currentColor"
        className="text-[#ed1b2f]"
        stroke="#231f20"
        strokeMiterlimit="10"
        strokeWidth="15.6"
      />
    </svg>
  );
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

  return {
    user: {
      name: session.userName,
      email: session.userEmail,
    },
    canManageStaff: isStaffOwner(session),
  };
}

const navItems: { to: string; label: string; end?: boolean; staffOnly?: boolean }[] = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/accounts", label: "Accounts" },
  { to: "/users", label: "Users" },
  { to: "/domains", label: "Domains" },
  { to: "/interested", label: "Interested" },
  { to: "/invitations", label: "Invitations" },
  { to: "/emails", label: "Emails" },
  { to: "/plans", label: "Plans" },
  { to: "/staff", label: "Staff", staffOnly: true },
  { to: "/security", label: "Security" },
  { to: "/settings", label: "Settings" },
];

export default function Layout() {
  const { user, canManageStaff } = useLoaderData<typeof loader>();
  const visibleNavItems = navItems.filter((item) => !item.staffOnly || canManageStaff);

  return (
    <div className="min-h-screen bg-theme-primary">
      <header className="bg-theme-secondary border-b border-theme sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Logo className="w-9 h-9 shrink-0" />
            <span className="text-lg font-semibold tracking-tight text-theme-primary">Admin</span>
          </div>
          <div className="flex items-center gap-4">
            <ColorModeToggle />
            <span className="text-sm text-theme-secondary">{user.name || user.email}</span>
            <Form method="post" action="/logout">
              <button
                type="submit"
                className="px-4 py-2 text-sm btn-secondary rounded-lg transition"
              >
                Logout
              </button>
            </Form>
          </div>
        </div>
      </header>

      <nav className="bg-theme-secondary border-b border-theme">
        <div className="container mx-auto px-4">
          <div className="flex gap-1">
            {visibleNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end ?? false}
                className={({ isActive }) =>
                  `px-4 py-3 text-sm font-medium transition border-b-2 ${
                    isActive
                      ? "border-(--color-brand-red) text-(--color-brand-red)"
                      : "border-transparent text-theme-secondary hover:text-(--color-brand-red)"
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
