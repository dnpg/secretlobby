import { Form, useLoaderData, useActionData, useNavigation, redirect } from "react-router";
import type { Route } from "./+types/_layout.staff";
import { getSession, requireUserAuth, isStaffOwner } from "@secretlobby/auth";
import { prisma } from "@secretlobby/db";
import {
  addStaff,
  removeStaff,
  updateStaffRole,
} from "~/models/staff/mutations.server";
import type { StaffRole } from "@secretlobby/db";

export function meta() {
  return [{ title: "Staff - Super Admin" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { session } = await getSession(request);
  requireUserAuth(session, "/login");
  if (!isStaffOwner(session)) {
    throw redirect("/");
  }

  const staffList = await prisma.staff.findMany({
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
  });

  return { staffList };
}

export async function action({ request }: Route.ActionArgs) {
  const { session } = await getSession(request);
  requireUserAuth(session, "/login");
  if (!isStaffOwner(session)) {
    return { error: "Forbidden" };
  }

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "add") {
    const email = (formData.get("email") as string)?.trim()?.toLowerCase();
    const role = (formData.get("role") as StaffRole) || "ADMIN";
    if (!email) return { error: "Email is required" };

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (!user) return { error: "No user found with this email. They must sign up first." };

    const result = await addStaff(user.id, role);
    if (result.error) return { error: result.error };
    return { success: "Staff member added." };
  }

  if (intent === "remove") {
    const staffId = formData.get("staffId") as string;
    if (!staffId) return { error: "Staff ID required" };
    const result = await removeStaff(staffId);
    if (result.error) return { error: result.error };
    return { success: "Staff access removed." };
  }

  if (intent === "role") {
    const staffId = formData.get("staffId") as string;
    const role = formData.get("role") as StaffRole;
    if (!staffId || !role) return { error: "Missing staff ID or role" };
    const result = await updateStaffRole(staffId, role);
    if (result.error) return { error: result.error };
    return { success: "Role updated." };
  }

  return null;
}

const ROLES: { value: StaffRole; label: string }[] = [
  { value: "OWNER", label: "Owner (can manage staff)" },
  { value: "ADMIN", label: "Admin (super-admin access only)" },
];

export default function StaffPage() {
  const { staffList } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <div className="container mx-auto px-4 py-8">
      <h2 className="text-2xl font-bold mb-2 text-theme-primary">Staff</h2>
      <p className="text-theme-secondary text-sm mb-8">
        Users listed here can sign in to Super Admin. They use the same User table; no separate account is required. Owners can manage staff; Admins have full super-admin access but cannot add or remove staff.
      </p>

      {actionData?.error && (
        <div className="mb-6 rounded-lg bg-[var(--color-brand-red-muted)] border border-[var(--color-brand-red)]/30 text-[var(--color-brand-red)] px-4 py-2 text-sm">
          {actionData.error}
        </div>
      )}
      {actionData?.success && (
        <div className="mb-6 rounded-lg bg-green-500/10 border border-green-500/30 text-green-500 px-4 py-2 text-sm">
          {actionData.success}
        </div>
      )}

      <div className="bg-theme-secondary rounded-xl border border-theme p-6 mb-8">
        <h3 className="text-lg font-semibold text-theme-primary mb-4">Add staff</h3>
        <p className="text-theme-muted text-sm mb-4">
          The user must already exist (e.g. they have signed up to the console). Enter their email to grant Super Admin access.
        </p>
        <Form method="post" className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="intent" value="add" />
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-theme-secondary mb-1">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              placeholder="colleague@company.com"
              className="w-64 px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-red)]"
            />
          </div>
          <div>
            <label htmlFor="add-role" className="block text-sm font-medium text-theme-secondary mb-1">
              Role
            </label>
            <select
              id="add-role"
              name="role"
              className="px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-red)]"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-2 btn-primary rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {isSubmitting ? "Adding…" : "Add staff"}
          </button>
        </Form>
      </div>

      <div className="bg-theme-secondary rounded-xl border border-theme overflow-hidden">
        <table className="w-full">
          <thead className="bg-theme-tertiary">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-theme-muted uppercase tracking-wider">
                User
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-theme-muted uppercase tracking-wider">
                Role
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-theme-muted uppercase tracking-wider">
                Last login
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-theme-muted uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-theme">
            {staffList.map((staff) => (
              <tr key={staff.id} className="hover:bg-theme-tertiary">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div>
                    <div className="font-medium text-theme-primary">
                      {staff.user.name || "—"}
                    </div>
                    <div className="text-sm text-theme-secondary">{staff.user.email}</div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
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
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </Form>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-theme-secondary text-sm">
                  {staff.user.lastLoginAt
                    ? new Date(staff.user.lastLoginAt).toLocaleString()
                    : "Never"}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <Form
                    method="post"
                    onSubmit={(e) =>
                      !confirm("Remove Super Admin access for this user?") && e.preventDefault()
                    }
                  >
                    <input type="hidden" name="intent" value="remove" />
                    <input type="hidden" name="staffId" value={staff.id} />
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="text-sm text-[var(--color-brand-red)] hover:text-[var(--color-brand-red-hover)] disabled:opacity-50"
                    >
                      Remove access
                    </button>
                  </Form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {staffList.length === 0 && (
          <div className="px-6 py-12 text-center text-theme-muted">
            No staff yet. Add a user by email above to grant Super Admin access.
          </div>
        )}
      </div>
    </div>
  );
}
