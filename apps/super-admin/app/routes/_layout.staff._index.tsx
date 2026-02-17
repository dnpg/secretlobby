import { Form, useLoaderData, useActionData, useNavigation, useFetcher } from "react-router";
import type { Route } from "./+types/_layout.staff._index";
import { useState, useEffect, useRef } from "react";
import type { StaffRole } from "@secretlobby/db";
import { getSession, requireUserAuth, isStaffOwner } from "@secretlobby/auth";
import { prisma } from "@secretlobby/db";
import {
  addStaff,
  removeStaff,
  updateStaffRole,
} from "~/models/staff/mutations.server";

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;

export async function loader({ request }: Route.LoaderArgs) {
  const { session } = await getSession(request);
  requireUserAuth(session, "/login");

  const { prisma } = await import("@secretlobby/db");
  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);

  const [staffList, totalCount, ownerCount] = await Promise.all([
    prisma.staff.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            lastLoginAt: true,
          },
        },
      },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.staff.count(),
    prisma.staff.count({ where: { role: "OWNER" } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return {
    staffList,
    totalCount,
    ownerCount,
    page,
    pageSize: PAGE_SIZE,
    totalPages,
    canManageStaff: isStaffOwner(session),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { session } = await getSession(request);
  requireUserAuth(session, "/login");
  if (!isStaffOwner(session)) {
    return { error: "Forbidden" };
  }

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "create") {
    const firstName = (formData.get("firstName") as string)?.trim() || undefined;
    const lastName = (formData.get("lastName") as string)?.trim() || undefined;
    const name = (formData.get("name") as string)?.trim() || undefined;
    const email = (formData.get("email") as string)?.trim()?.toLowerCase();
    const password = formData.get("password") as string;
    const role = (formData.get("role") as StaffRole) || "ADMIN";
    if (!email) return { error: "Email is required" };
    if (!password) return { error: "Password is required" };

    const { checkPasswordRequirements, PASSWORD_REQUIREMENTS } = await import("@secretlobby/auth");
    const checks = checkPasswordRequirements(password);
    const failed = PASSWORD_REQUIREMENTS.filter((r) => !checks[r.key]);
    if (failed.length) {
      return { error: `Password must meet: ${failed.map((r) => r.label).join(", ")}` };
    }

    const { createUser } = await import("@secretlobby/auth");
    let user: { id: string };
    try {
      user = await createUser(email, password, { firstName, lastName, name });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to create user";
      if (message.includes("Unique constraint") || message.includes("unique")) {
        return { error: "A user with this email already exists. Use “Assign existing user” instead." };
      }
      return { error: message };
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true },
    });

    const result = await addStaff(user.id, role);
    if ("error" in result) return { error: result.error };
    return { success: "User created and added as staff." };
  }

  if (intent === "add") {
    const userId = formData.get("userId") as string;
    const role = (formData.get("role") as StaffRole) || "ADMIN";
    if (!userId) return { error: "Please select a user" };

    const result = await addStaff(userId, role);
    if ("error" in result) return { error: result.error };
    return { success: "Staff member added." };
  }

  if (intent === "remove") {
    const staffId = formData.get("staffId") as string;
    if (!staffId) return { error: "Staff ID required" };
    const staffCount = await prisma.staff.count();
    if (staffCount <= 1) {
      return { error: "Cannot remove the last super admin. At least one staff member is required." };
    }
    const result = await removeStaff(staffId);
    if ("error" in result) return { error: result.error };
    return { success: "Staff access removed." };
  }

  if (intent === "role") {
    const staffId = formData.get("staffId") as string;
    const role = formData.get("role") as StaffRole;
    if (!staffId || !role) return { error: "Missing staff ID or role" };
    // Prevent demoting the last owner
    if (role !== "OWNER") {
      const staff = await prisma.staff.findUnique({
        where: { id: staffId },
        select: { role: true },
      });
      if (staff?.role === "OWNER") {
        const owners = await prisma.staff.count({ where: { role: "OWNER" } });
        if (owners <= 1) {
          return { error: "Cannot change the last owner's role. At least one owner is required." };
        }
      }
    }
    const result = await updateStaffRole(staffId, role);
    if ("error" in result) return { error: result.error };
    return { success: "Role updated." };
  }

  return null;
}

const ROLES: { value: StaffRole; label: string }[] = [
  { value: "OWNER", label: "Owner (can manage staff)" },
  { value: "ADMIN", label: "Admin (super-admin access only)" },
];

type UserOption = { id: string; email: string; name: string | null };

export default function StaffIndexPage() {
  const { staffList, totalCount, ownerCount, page, pageSize, totalPages, canManageStaff } = useLoaderData<typeof loader>();
  const actionData = useActionData<{ error?: string; success?: string } | null>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [assignQuery, setAssignQuery] = useState("");
  const [assignResults, setAssignResults] = useState<UserOption[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserOption | null>(null);
  const [assignRole, setAssignRole] = useState<StaffRole>("ADMIN");
  const [showAssignDropdown, setShowAssignDropdown] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const assignInputRef = useRef<HTMLInputElement>(null);
  const assignDropdownRef = useRef<HTMLDivElement>(null);

  const searchFetcher = useFetcher<{ users: UserOption[] }>();

  useEffect(() => {
    if (!assignQuery.trim() || assignQuery.length < 2) {
      setAssignResults([]);
      return;
    }
    const t = setTimeout(() => {
      searchFetcher.load(`/staff/search-users?q=${encodeURIComponent(assignQuery)}`);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [assignQuery]);

  useEffect(() => {
    if (searchFetcher.data?.users) {
      setAssignResults(searchFetcher.data.users);
      setShowAssignDropdown(true);
    }
  }, [searchFetcher.data]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        assignDropdownRef.current &&
        !assignDropdownRef.current.contains(e.target as Node) &&
        assignInputRef.current &&
        !assignInputRef.current.contains(e.target as Node)
      ) {
        setShowAssignDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalCount);

  return (
    <div className="container mx-auto px-4 py-8">
      <h2 className="text-2xl font-bold mb-2 text-theme-primary">Staff</h2>
      <p className="text-theme-secondary text-sm mb-6">
        Users listed here can sign in to Super Admin. Owners can manage staff; Admins have full access but cannot add or remove staff.
      </p>

      {actionData?.error && (
        <div className="mb-4 rounded-lg bg-[var(--color-brand-red-muted)] border border-[var(--color-brand-red)]/30 text-[var(--color-brand-red)] px-4 py-2 text-sm">
          {actionData.error}
        </div>
      )}
      {actionData?.success && (
        <div className="mb-4 rounded-lg bg-green-500/10 border border-green-500/30 text-green-500 px-4 py-2 text-sm">
          {actionData.success}
        </div>
      )}

      {/* Compact Add staff row: assign (search + select) or create new — Owners only */}
      {canManageStaff && (
      <div className="bg-theme-secondary rounded-xl border border-theme p-4 mb-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]" ref={assignDropdownRef}>
            <label htmlFor="assign-search" className="block text-sm font-medium text-theme-secondary mb-1">
              Assign existing user
            </label>
            <div className="relative">
              <input
                ref={assignInputRef}
                id="assign-search"
                type="text"
                value={selectedUser ? (selectedUser.name ? `${selectedUser.name} (${selectedUser.email})` : selectedUser.email) : assignQuery}
                onChange={(e) => {
                  setSelectedUser(null);
                  setAssignQuery(e.target.value);
                }}
                onFocus={() => assignQuery.length >= 2 && setShowAssignDropdown(true)}
                placeholder="Type to search by name or email (min 2 chars)"
                className="w-full px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-red)]"
              />
              {selectedUser && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedUser(null);
                    setAssignQuery("");
                    assignInputRef.current?.focus();
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-theme-muted hover:text-theme-primary"
                  aria-label="Clear selection"
                >
                  ×
                </button>
              )}
              {showAssignDropdown && assignResults.length > 0 && !selectedUser && (
                <ul className="absolute z-10 mt-1 w-full max-h-60 overflow-auto bg-theme-tertiary border border-theme rounded-lg shadow-lg">
                  {assignResults.map((u) => (
                    <li key={u.id}>
                      <button
                        type="button"
                        className="w-full px-4 py-2 text-left text-theme-primary hover:bg-theme focus:bg-theme focus:outline-none"
                        onClick={() => {
                          setSelectedUser(u);
                          setAssignResults([]);
                          setShowAssignDropdown(false);
                          setAssignQuery("");
                        }}
                      >
                        {u.name ? `${u.name} — ${u.email}` : u.email}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="w-48">
            <label htmlFor="assign-role" className="block text-sm font-medium text-theme-secondary mb-1">
              Role
            </label>
            <select
              id="assign-role"
              name="role"
              value={assignRole}
              onChange={(e) => setAssignRole(e.target.value as StaffRole)}
              className="w-full px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-red)]"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <Form method="post" className="flex items-end">
            <input type="hidden" name="intent" value="add" />
            <input type="hidden" name="userId" value={selectedUser?.id ?? ""} />
            <input type="hidden" name="role" value={assignRole} />
            <button
              type="submit"
              disabled={isSubmitting || !selectedUser}
              className="px-4 py-2 btn-primary rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {isSubmitting ? "Adding…" : "Add as staff"}
            </button>
          </Form>
          <span className="text-theme-muted text-sm">or</span>
          <button
            type="button"
            onClick={() => setShowCreateForm((v) => !v)}
            className="px-4 py-2 rounded-lg border border-theme text-theme-primary hover:bg-theme-tertiary text-sm font-medium"
          >
            {showCreateForm ? "Cancel" : "Create new user"}
          </button>
        </div>

        {showCreateForm && (
          <Form method="post" className="mt-4 pt-4 border-t border-theme grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <input type="hidden" name="intent" value="create" />
            <div>
              <label htmlFor="create-firstName" className="block text-xs font-medium text-theme-muted mb-1">First name</label>
              <input id="create-firstName" name="firstName" type="text" placeholder="Jane" className="w-full px-3 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary text-sm" />
            </div>
            <div>
              <label htmlFor="create-lastName" className="block text-xs font-medium text-theme-muted mb-1">Last name</label>
              <input id="create-lastName" name="lastName" type="text" placeholder="Doe" className="w-full px-3 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary text-sm" />
            </div>
            <div>
              <label htmlFor="create-name" className="block text-xs font-medium text-theme-muted mb-1">Display name (optional)</label>
              <input id="create-name" name="name" type="text" placeholder="Defaults to first name" className="w-full px-3 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary text-sm" />
            </div>
            <div>
              <label htmlFor="create-email" className="block text-xs font-medium text-theme-muted mb-1">Email *</label>
              <input id="create-email" name="email" type="email" required placeholder="jane@company.com" className="w-full px-3 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary text-sm" />
            </div>
            <div>
              <label htmlFor="create-password" className="block text-xs font-medium text-theme-muted mb-1">Password *</label>
              <input id="create-password" name="password" type="password" required autoComplete="new-password" placeholder="••••••••" className="w-full px-3 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary text-sm" />
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label htmlFor="create-role" className="block text-xs font-medium text-theme-muted mb-1">Role</label>
                <select id="create-role" name="role" className="w-full px-3 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary text-sm">
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <button type="submit" disabled={isSubmitting} className="px-3 py-2 btn-primary rounded-lg text-sm font-medium disabled:opacity-50">
                Create & add
              </button>
            </div>
          </Form>
        )}
      </div>
      )}

      {/* Paginated staff table */}
      <div className="bg-theme-secondary rounded-xl border border-theme overflow-hidden">
        <div className="px-4 py-2 border-b border-theme flex justify-between items-center">
          <span className="text-sm text-theme-muted">
            {totalCount === 0 ? "No staff" : `Showing ${start}–${end} of ${totalCount}`}
          </span>
          {totalPages > 1 && (
            <div className="flex gap-2">
              <Form method="get" action="/staff">
                <input type="hidden" name="page" value={String(Math.max(1, page - 1))} />
                <button type="submit" disabled={page <= 1} className="px-2 py-1 text-sm disabled:opacity-50 text-theme-primary">
                  Previous
                </button>
              </Form>
              <span className="text-theme-muted text-sm py-1">
                Page {page} of {totalPages}
              </span>
              <Form method="get" action="/staff">
                <input type="hidden" name="page" value={String(page + 1)} />
                <button type="submit" disabled={page >= totalPages} className="px-2 py-1 text-sm disabled:opacity-50 text-theme-primary">
                  Next
                </button>
              </Form>
            </div>
          )}
        </div>
        <table className="w-full">
          <thead className="bg-theme-tertiary">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-theme-muted uppercase tracking-wider">User</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-theme-muted uppercase tracking-wider">Role</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-theme-muted uppercase tracking-wider">Last login</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-theme-muted uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-theme">
            {staffList.map((staff) => (
              <tr key={staff.id} className="hover:bg-theme-tertiary">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div>
                    <div className="font-medium text-theme-primary">{staff.user.name || "—"}</div>
                    <div className="text-sm text-theme-secondary">{staff.user.email}</div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {canManageStaff && !(staff.role === "OWNER" && ownerCount <= 1) ? (
                    <Form method="post" className="inline">
                      <input type="hidden" name="intent" value="role" />
                      <input type="hidden" name="staffId" value={staff.id} />
                      <select
                        name="role"
                        defaultValue={staff.role}
                        onChange={(e) => e.currentTarget.form?.requestSubmit()}
                        className="px-2 py-1 bg-theme-tertiary border border-theme rounded text-sm text-theme-primary focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-red)]"
                      >
                        {ROLES.map((r) => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                    </Form>
                  ) : (
                    <span className="text-theme-primary text-sm" title={staff.role === "OWNER" && ownerCount <= 1 ? "At least one owner is required" : undefined}>
                      {staff.role === "OWNER" ? "Owner" : "Admin"}
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-theme-secondary text-sm">
                  {staff.user.lastLoginAt ? new Date(staff.user.lastLoginAt).toLocaleString() : "Never"}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {canManageStaff ? (
                    <Form method="post" onSubmit={(e) => !confirm("Remove Super Admin access for this user?") && e.preventDefault()}>
                      <input type="hidden" name="intent" value="remove" />
                      <input type="hidden" name="staffId" value={staff.id} />
                      <button
                        type="submit"
                        disabled={isSubmitting || totalCount <= 1}
                        title={totalCount <= 1 ? "At least one super admin is required" : undefined}
                        className="text-sm text-[var(--color-brand-red)] hover:text-[var(--color-brand-red-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Remove access
                      </button>
                    </Form>
                  ) : (
                    <span className="text-theme-muted text-sm">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {staffList.length === 0 && (
          <div className="px-6 py-12 text-center text-theme-muted">
            {canManageStaff ? "No staff yet. Assign an existing user or create a new user above." : "No staff yet."}
          </div>
        )}
      </div>
    </div>
  );
}
