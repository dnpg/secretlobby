import { redirect } from "react-router";
import type { Route } from "./+types/_layout.staff.search-users";
import { getSession, requireUserAuth, isStaffOwner } from "@secretlobby/auth";
import { prisma } from "@secretlobby/db";

const SEARCH_LIMIT = 20;

/**
 * GET /staff/search-users?q=... - Returns JSON list of users not already staff, matching query.
 * Used by the assign-staff combobox; supports thousands of users via server-side search.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const { session } = await getSession(request);
  requireUserAuth(session, "/login");
  if (!isStaffOwner(session)) {
    throw redirect("/login");
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  if (!q || q.length < 2) {
    return Response.json({ users: [] });
  }

  const staffUserIds = await prisma.staff.findMany({ select: { userId: true } }).then((r) => r.map((x) => x.userId));

  const searchFilter = {
    OR: [
      { email: { contains: q, mode: "insensitive" as const } },
      { name: { contains: q, mode: "insensitive" as const } },
    ],
    ...(staffUserIds.length > 0 ? { id: { notIn: staffUserIds } } : {}),
  };

  const users = await prisma.user.findMany({
    where: searchFilter,
    select: { id: true, email: true, name: true },
    orderBy: [{ email: "asc" }],
    take: SEARCH_LIMIT,
  });

  return Response.json({ users });
}

export default function StaffSearchUsersResource() {
  return null;
}
