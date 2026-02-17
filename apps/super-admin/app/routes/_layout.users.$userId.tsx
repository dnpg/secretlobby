import { useEffect, useState } from "react";
import { Form, useLoaderData, useActionData, useNavigation, redirect } from "react-router";
import type { Route } from "./+types/_layout.users.$userId";
import type { UserRole } from "@secretlobby/db";
import { PASSWORD_REQUIREMENTS, checkPasswordRequirements } from "@secretlobby/auth/requirements";
import { cn } from "@secretlobby/ui";
import { toast } from "sonner";

function generateSecurePassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const numbers = "23456789";
  const special = "!@#$%&*";
  const pick = (s: string, n: number) =>
    Array.from({ length: n }, () => s[Math.floor(Math.random() * s.length)]);
  const chars = [
    ...pick(upper, 1),
    ...pick(lower, 1),
    ...pick(numbers, 1),
    ...pick(special, 1),
    ...pick(upper + lower + numbers + special, 12),
  ];
  return chars.sort(() => Math.random() - 0.5).join("");
}

export function meta({ data }: Route.MetaArgs) {
  return [{ title: data?.user ? `${data.user.email} - Edit User - Super Admin` : "Edit User - Super Admin" }];
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const { prisma } = await import("@secretlobby/db");
  const { userId } = params;
  if (!userId) {
    throw new Response("Missing userId", { status: 400 });
  }
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
    // Don't silently redirect; this usually means the route is pointing at a different DB
    // than the users list, or the ID doesn't exist.
    let dbHint = "";
    try {
      const raw = process.env.DATABASE_URL;
      if (raw) {
        const url = new URL(raw);
        dbHint = ` (db: ${url.hostname}${url.port ? `:${url.port}` : ""}/${url.pathname.replace("/", "")})`;
      }
    } catch {
      // ignore
    }
    throw new Response(`User not found: ${userId}${dbHint}`, { status: 404 });
  }

  const accounts = await prisma.account.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true },
  });

  return { user, accounts };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { updateUserAdmin, updateAccountUserRole, addUserToAccountAdmin, removeUserFromAccount } = await import(
    "~/models/users/mutations.server"
  );
  const { userId } = params;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "update-profile") {
    const firstName = (formData.get("firstName") as string)?.trim() || null;
    const lastName = (formData.get("lastName") as string)?.trim() || null;
    const name = (formData.get("name") as string)?.trim() || null;
    const email = (formData.get("email") as string)?.trim() ?? "";
    const emailVerified = formData.get("emailVerified") === "on";
    const newPassword = (formData.get("newPassword") as string) || null;
    const confirmNewPassword = (formData.get("confirmNewPassword") as string) || null;
    if (newPassword && confirmNewPassword != null && newPassword !== confirmNewPassword) {
      return { error: "New passwords do not match", intent: "update-profile" };
    }
    const result = await updateUserAdmin(userId, {
      firstName,
      lastName,
      name,
      email,
      emailVerified,
      newPassword: newPassword === "" ? null : newPassword,
    });
    if ("error" in result) return { error: result.error, intent: "update-profile" };
    return { success: "Profile updated.", intent: "update-profile" };
  }

  if (intent === "update-role") {
    const accountUserId = formData.get("accountUserId") as string;
    const role = formData.get("role") as UserRole;
    const result = await updateAccountUserRole(accountUserId, role);
    if ("error" in result) return { error: result.error, intent: "update-role" };
    return { success: "Role updated.", intent: "update-role" };
  }

  if (intent === "add-account") {
    const accountId = (formData.get("accountId") as string)?.trim();
    const role = (formData.get("role") as UserRole) || "VIEWER";
    if (!accountId) return { error: "Select an account", intent: "add-account" };
    const result = await addUserToAccountAdmin(userId, accountId, role);
    if ("error" in result) return { error: result.error, intent: "add-account" };
    return { success: "Added to account.", intent: "add-account" };
  }

  if (intent === "remove-account") {
    const accountUserId = formData.get("accountUserId") as string;
    const result = await removeUserFromAccount(accountUserId);
    if ("error" in result) return { error: result.error, intent: "remove-account" };
    return { success: "Removed from account.", intent: "remove-account" };
  }

  return null;
}

function PasswordRequirementsList({ password }: { password: string }) {
  const results = checkPasswordRequirements(password);
  const hasInput = password.length > 0;

  return (
    <ul className="mt-2 space-y-1 text-sm">
      {PASSWORD_REQUIREMENTS.map((req) => {
        const met = hasInput && results[req.key];
        return (
          <li key={req.key} className="flex items-center gap-2">
            <span className={cn("w-4 text-center", met ? "text-green-500" : "text-theme-muted")}>
              {hasInput ? (met ? "\u2713" : "\u2717") : "\u2022"}
            </span>
            <span className={met ? "text-theme-primary" : "text-theme-secondary"}>{req.label}</span>
          </li>
        );
      })}
    </ul>
  );
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
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  const accountIdsInUse = new Set(user.accounts.map((au) => au.accountId));
  const allReqsMet = PASSWORD_REQUIREMENTS.every((r) => checkPasswordRequirements(newPassword)[r.key]);
  const passwordsMatch = newPassword === confirmNewPassword && confirmNewPassword.length > 0;
  const canSubmitProfile =
    newPassword.length === 0 || (allReqsMet && passwordsMatch);

  const copyNewPassword = async () => {
    if (!newPassword) return;
    try {
      await navigator.clipboard.writeText(newPassword);
      toast.success("Password copied");
    } catch {
      // Fallback for browsers/environments that block clipboard API
      const textArea = document.createElement("textarea");
      textArea.value = newPassword;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand("copy");
        toast.success("Password copied");
      } catch {
        toast.error("Failed to copy password. Please copy it manually.");
      }
      document.body.removeChild(textArea);
    }
  };

  useEffect(() => {
    if (!actionData) return;
    if ("error" in actionData && actionData.error) toast.error(actionData.error);
    if ("success" in actionData && actionData.success) toast.success(actionData.success);
  }, [actionData]);

  return (
    <div className="max-w-2xl space-y-8">
      {/* Profile */}
      <div className="bg-theme-secondary rounded-xl border border-theme p-6">
        <h3 className="text-lg font-semibold mb-4 text-theme-primary">Profile</h3>
        <Form method="post">
          <input type="hidden" name="intent" value="update-profile" />
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
                className="w-full px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-(--color-brand-red)"
              />
            </div>
            <div>
              <label htmlFor="firstName" className="block text-sm font-medium text-theme-secondary mb-1">
                First name
              </label>
              <input
                id="firstName"
                name="firstName"
                type="text"
                autoComplete="given-name"
                defaultValue={user.firstName ?? ""}
                className="w-full px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-(--color-brand-red)"
              />
            </div>
            <div>
              <label htmlFor="lastName" className="block text-sm font-medium text-theme-secondary mb-1">
                Last name
              </label>
              <input
                id="lastName"
                name="lastName"
                type="text"
                autoComplete="family-name"
                defaultValue={user.lastName ?? ""}
                className="w-full px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-(--color-brand-red)"
              />
            </div>
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-theme-secondary mb-1">
                Display name (optional)
              </label>
              <input
                id="name"
                name="name"
                type="text"
                autoComplete="nickname"
                defaultValue={user.name ?? ""}
                className="w-full px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-(--color-brand-red)"
                placeholder="Defaults to first name"
              />
            </div>
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label htmlFor="newPassword" className="block text-sm font-medium text-theme-secondary">
                  New password (leave blank to keep current)
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const p = generateSecurePassword();
                    setNewPassword(p);
                    setConfirmNewPassword(p);
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-(--color-brand-red-muted) text-(--color-brand-red) text-xs font-medium hover:bg-(--color-brand-red) hover:text-white transition cursor-pointer"
                >
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-current" />
                  Generate secure password
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="newPassword"
                  name="newPassword"
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  className="flex-1 min-w-0 px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-(--color-brand-red)"
                  placeholder="••••••••"
                />
                {newPassword.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((v) => !v)}
                      className="shrink-0 px-3 py-2 rounded-lg border border-theme text-xs font-medium text-theme-secondary hover:text-theme-primary hover:bg-theme-tertiary transition cursor-pointer"
                      title={showNewPassword ? "Hide password" : "Show password"}
                    >
                      {showNewPassword ? "Hide" : "Show"}
                    </button>
                    <button
                      type="button"
                      onClick={copyNewPassword}
                      className="shrink-0 px-3 py-2 rounded-lg border border-theme text-xs font-medium text-theme-secondary hover:text-theme-primary hover:bg-theme-tertiary transition cursor-pointer"
                      title="Copy password"
                    >
                      Copy
                    </button>
                  </>
                )}
              </div>
              {newPassword.length > 0 && <PasswordRequirementsList password={newPassword} />}
            </div>
            <div>
              <label htmlFor="confirmNewPassword" className="block text-sm font-medium text-theme-secondary mb-1">
                Confirm new password
              </label>
              <input
                id="confirmNewPassword"
                name="confirmNewPassword"
                type={showNewPassword ? "text" : "password"}
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                autoComplete="new-password"
                className="w-full px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-(--color-brand-red)"
                placeholder="••••••••"
              />
              {confirmNewPassword.length > 0 && (
                <p className={cn("mt-1 text-sm", passwordsMatch ? "text-green-500" : "text-red-400")}>
                  {passwordsMatch ? "\u2713 Passwords match" : "\u2717 Passwords do not match"}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                id="emailVerified"
                name="emailVerified"
                type="checkbox"
                defaultChecked={user.emailVerified}
                className="rounded border-theme bg-theme-tertiary text-(--color-brand-red) focus:ring-(--color-brand-red)"
              />
              <label htmlFor="emailVerified" className="text-sm text-theme-secondary">
                Email verified
              </label>
            </div>
          </div>
          <div className="mt-4">
            <button
              type="submit"
              disabled={isSubmitting || !canSubmitProfile}
              className="px-4 py-2 btn-primary disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition cursor-pointer"
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
                      className="px-2 py-1 bg-theme-tertiary border border-theme rounded text-sm text-theme-primary focus:outline-none focus:ring-1 focus:ring-(--color-brand-red)"
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
                      className="text-sm text-(--color-brand-red) hover:text-(--color-brand-red-hover) disabled:opacity-50 cursor-pointer"
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

        <Form method="post" className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="intent" value="add-account" />
          <div>
            <label htmlFor="add-accountId" className="block text-sm text-theme-muted mb-1">
              Add to account
            </label>
            <select
              id="add-accountId"
              name="accountId"
              className="px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-(--color-brand-red)"
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
              className="px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-(--color-brand-red)"
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
