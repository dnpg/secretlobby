import { Outlet, Link, useLocation } from "react-router";
import type { Route } from "./+types/_layout.users";

export function meta() {
  return [{ title: "Users - Super Admin" }];
}

export default function UsersLayout() {
  const location = useLocation();
  const isList = location.pathname === "/users" || location.pathname === "/users/";

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          {!isList && (
            <Link
              to="/users"
              className="text-sm text-theme-secondary hover:text-[var(--color-brand-red)] transition"
            >
              ← Back to users
            </Link>
          )}
          <h2 className="text-2xl font-bold">Users</h2>
        </div>
      </div>
      <Outlet />
    </div>
  );
}
