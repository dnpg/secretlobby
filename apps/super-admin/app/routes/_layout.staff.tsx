import { Outlet, redirect } from "react-router";
import type { Route } from "./+types/_layout.staff";
import { getSession, requireUserAuth, isStaffOwner } from "@secretlobby/auth";

export function meta() {
  return [{ title: "Staff - Super Admin" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { session } = await getSession(request);
  requireUserAuth(session, "/login");
  if (!isStaffOwner(session)) {
    throw redirect("/");
  }
  return {};
}

export default function StaffLayout() {
  return <Outlet />;
}
