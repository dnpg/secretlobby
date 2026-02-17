import { NavLink, Outlet, useLoaderData, redirect } from "react-router";
import type { Route } from "./+types/_layout.accounts.$accountId";
import { prisma } from "@secretlobby/db";

export async function loader({ params }: Route.LoaderArgs) {
  const { accountId } = params;

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: {
      id: true,
      name: true,
      slug: true,
      subscriptionTier: true,
    },
  });

  if (!account) {
    throw redirect("/accounts");
  }

  return { account };
}

const navItems = [
  { to: ".", label: "Details", end: true },
  { to: "lobbies", label: "Lobbies" },
  { to: "users", label: "Users" },
];

export default function AccountLayout() {
  const { account } = useLoaderData<typeof loader>();

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <a
            href="/accounts"
            className="text-theme-secondary hover:text-theme-primary transition"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </a>
          <h2 className="text-2xl font-bold">{account.name}</h2>
          <span className="px-2 py-1 text-xs rounded-full bg-theme-tertiary">
            {account.subscriptionTier}
          </span>
        </div>
        <p className="text-theme-secondary text-sm">{account.slug}</p>
      </div>

      {/* Sub-navigation */}
      <nav className="mb-6 border-b border-theme">
        <div className="flex gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `px-4 py-3 text-sm font-medium transition border-b-2 ${
                  isActive
                    ? "border-[var(--color-brand-red)] text-[var(--color-brand-red)]"
                    : "border-transparent text-theme-secondary hover:text-[var(--color-brand-red)]"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Content */}
      <Outlet />
    </div>
  );
}
