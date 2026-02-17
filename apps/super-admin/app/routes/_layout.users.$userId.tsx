import { Form, useLoaderData, useActionData, useNavigation, redirect } from "react-router";
import type { Route } from "./+types/_layout.users.$userId";
import { prisma } from "@secretlobby/db";
import type { UserRole } from "@secretlobby/db";
import {
  updateUserAdmin,
  updateAccountUserRole,
  addUserToAccountAdmin,
  removeUserFromAccount,
} from "~/models/users/mutations.server";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: data?.user ? `${data.user.email} - Edit User - Super Admin` : "Edit User - Super Admin" }];
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const { userId } = params;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      accounts: {
        include: {
          account: {
            select: { id: true, name: true, slug: true },
          },
        },
      },
    },
  });
  if (!user) {
    throw redirect("/users");
  }

  const accounts = await prisma.account.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true },
  });

  return { user, accounts };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { userId } = params;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "update-profile") {
    const name = (formData.get("name") as string)?.trim() || null;
    const email = (formData.get("email") as string)?.trim() ?? "";
    const emailVerified = formData.get("emailVerified") === "on";
    const newPassword = (formData.get("newPassword") as string) || null;
    const result = await updateUserAdmin(userId, {
      name,
      email,
      emailVerified,
      newPassword: newPassword === "" ? null : newPassword,
    });
    if (result.error) return { error: result.error, intent: "update-profile" };
    return { success: "Profile updated.", intent: "update-profile" };
  }

  if (intent === "update-role") {
    const accountUserId = formData.get("accountUserId") as string;
    const role = formData.get("role") as UserRole;
    const result = await updateAccountUserRole(accountUserId, role);
    if (result.error) return { error: result.error, intent: "update-role" };
    return { success: "Role updated.", intent: "update-role" };
  }

  if (intent === "add-account") {
    const accountId = (formData.get("accountId") as string)?.trim();
    const role = (formData.get("role") as UserRole) || "VIEWER";
    if (!accountId) return { error: "Select an account", intent: "add-account" };
    const result = await addUserToAccountAdmin(userId, accountId, role);
    if (result.error) return { error: result.error, intent: "add-account" };
    return { success: "Added to account.", intent: "add-account" };
  }

  if (intent === "remove-account") {
    const accountUserId = formData.get("accountUserId") as string;
    const result = await removeUserFromAccount(accountUserId);
    if (result.error) return { error: result.error, intent: "remove-account" };
    return { success: "Removed from account.", intent: "remove-account" };
  }

  return null;
}

const ROLES: { value: UserRole; label: string }[] = [
  { value: "OWNER", label: "Owner" },
  { value: "ADMIN", label: "Admin" },
  { value: "EDITOR", label: "Editor" },
  { value: "VIEWER", label: "Viewer" },
];

export default function EditUserPage() {
  const { user, accounts } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const accountIdsInUse = new Set(user.accounts.map((au) => au.accountId));

  return (
    <div className="max-w-2xl space-y-8">
      {/* Profile */}
      <div className="bg-theme-secondary rounded-xl border border-theme p-6">
        <h3 className="text-lg font-semibold mb-4 text-theme-primary">Profile</h3>
        <Form method="post">
          <input type="hidden" name="intent" value="update-profile" />
          {actionData?.intent === "update-profile" && (
            <div className="mb-4 rounded-lg px-4 py-2 text-sm border bg-[var(--color-brand-red-muted)] border-[var(--color-brand-red)]/30 text-[var(--color-brand-red)]">
              {actionData.error}
            </div>
          )}
          {actionData?.intent === "update-profile" && actionData.success && (
            <div className="mb-4 rounded-lg px-4 py-2 text-sm border bg-green-500/10 border-green-500/30 text-green-500">
              {actionData.success}
            </div>
          )}
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-theme-secondary mb-1">
                Email *
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                defaultValue={user.email}
                className="w-full px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-red)]"
              />
            </div>
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-theme-secondary mb-1">
                Name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                defaultValue={user.name ?? ""}
                className="w-full px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-red)]"
              />
            </div>
            <div>
              <label htmlFor="newPassword" className="block text-sm font-medium text-theme-secondary mb-1">
                New password (leave blank to keep current)
              </label>
              <input
                id="newPassword"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                className="w-full px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-red)]"
                placeholder="••••••••"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                id="emailVerified"
                name="emailVerified"
                type="checkbox"
                defaultChecked={user.emailVerified}
                className="rounded border-theme bg-theme-tertiary text-[var(--color-brand-red)] focus:ring-[var(--color-brand-red)]"
              />
              <label htmlFor="emailVerified" className="text-sm text-theme-secondary">
                Email verified
              </label>
            </div>
          </div>
          <div className="mt-4">
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 btn-primary disabled:opacity-50 rounded-lg text-sm font-medium transition"
            >
              {isSubmitting ? "Saving…" : "Save profile"}
            </button>
          </div>
        </Form>
      </div>

      {/* Account memberships */}
      <div className="bg-theme-secondary rounded-xl border border-theme p-6">
        <h3 className="text-lg font-semibold mb-4 text-theme-primary">Account memberships</h3>

        {user.accounts.length > 0 ? (
          <ul className="space-y-3 mb-6">
            {user.accounts.map((au) => (
              <li
                key={au.id}
                className="flex items-center justify-between gap-4 py-2 border-b border-theme last:border-0"
              >
                <div>
                  <span className="font-medium text-theme-primary">{au.account.name}</span>
                  <span className="text-theme-muted text-sm ml-2">({au.account.slug})</span>
                </div>
                <div className="flex items-center gap-2">
                  <Form method="post" className="flex items-center gap-2">
                    <input type="hidden" name="intent" value="update-role" />
                    <input type="hidden" name="accountUserId" value={au.id} />
                    <select
                      name="role"
                      defaultValue={au.role}
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
                  <Form method="post" onSubmit={(e) => !confirm("Remove this user from the account?") && e.preventDefault()}>
                    <input type="hidden" name="intent" value="remove-account" />
                    <input type="hidden" name="accountUserId" value={au.id} />
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="text-sm text-[var(--color-brand-red)] hover:text-[var(--color-brand-red-hover)] disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </Form>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-theme-muted text-sm mb-4">Not a member of any account.</p>
        )}

        {actionData?.intent === "add-account" && actionData.error && (
          <div className="mb-4 rounded-lg px-4 py-2 text-sm bg-[var(--color-brand-red-muted)] border border-[var(--color-brand-red)]/30 text-[var(--color-brand-red)]">
            {actionData.error}
          </div>
        )}
        {actionData?.intent === "add-account" && actionData.success && (
          <div className="mb-4 rounded-lg px-4 py-2 text-sm bg-green-500/10 border border-green-500/30 text-green-500">
            {actionData.success}
          </div>
        )}

        <Form method="post" className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="intent" value="add-account" />
          <div>
            <label htmlFor="add-accountId" className="block text-sm text-theme-muted mb-1">
              Add to account
            </label>
            <select
              id="add-accountId"
              name="accountId"
              className="px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-red)]"
            >
              <option value="">Select account…</option>
              {accounts
                .filter((a) => !accountIdsInUse.has(a.id))
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.slug})
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label htmlFor="add-role" className="block text-sm text-theme-muted mb-1">
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
            disabled={isSubmitting || accounts.filter((a) => !accountIdsInUse.has(a.id)).length === 0}
            className="px-4 py-2 btn-secondary disabled:opacity-50 rounded-lg text-sm font-medium transition"
          >
            Add to account
          </button>
        </Form>
      </div>
    </div>
  );
}
