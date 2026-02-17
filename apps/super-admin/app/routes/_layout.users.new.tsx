import { Form, useLoaderData, useActionData, useNavigation, redirect, Link } from "react-router";
import type { Route } from "./+types/_layout.users.new";
import type { UserRole } from "@secretlobby/db";

export function meta() {
  return [{ title: "New User - Super Admin" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { prisma } = await import("@secretlobby/db");
  const accounts = await prisma.account.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true },
  });
  return { accounts };
}

export async function action({ request }: Route.ActionArgs) {
  const { createUserAdmin } = await import("~/models/users/mutations.server");
  const formData = await request.formData();
  const intent = formData.get("intent");
  if (intent !== "create") return null;

  const email = (formData.get("email") as string)?.trim() ?? "";
  const password = (formData.get("password") as string) ?? "";
  const firstName = (formData.get("firstName") as string)?.trim() || null;
  const lastName = (formData.get("lastName") as string)?.trim() || null;
  const name = (formData.get("name") as string)?.trim() || null;
  const emailVerified = formData.get("emailVerified") === "on";
  const accountId = (formData.get("accountId") as string)?.trim() || null;
  const role = (formData.get("role") as UserRole) || "VIEWER";

  const result = await createUserAdmin({
    email,
    password,
    firstName,
    lastName,
    name,
    emailVerified,
    accountId: accountId || undefined,
    role: accountId ? role : undefined,
  });

  if (result.error) {
    return { error: result.error };
  }
  throw redirect(`/users/${result.userId}`);
}

const ROLES: { value: UserRole; label: string }[] = [
  { value: "OWNER", label: "Owner" },
  { value: "ADMIN", label: "Admin" },
  { value: "EDITOR", label: "Editor" },
  { value: "VIEWER", label: "Viewer" },
];

export default function NewUserPage() {
  const { accounts } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <div className="max-w-xl">
      <Form method="post">
        <input type="hidden" name="intent" value="create" />
        <div className="space-y-6 bg-theme-secondary rounded-xl border border-theme p-6">
          <h3 className="text-lg font-semibold text-theme-primary">Create user</h3>

          {actionData?.error && (
            <div className="rounded-lg bg-[var(--color-brand-red-muted)] border border-[var(--color-brand-red)]/30 text-[var(--color-brand-red)] px-4 py-2 text-sm">
              {actionData.error}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-theme-secondary mb-1">
              Email *
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-red)]"
              placeholder="user@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-theme-secondary mb-1">
              Password *
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="new-password"
              className="w-full px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-red)]"
              placeholder="••••••••"
            />
            <p className="mt-1 text-xs text-theme-muted">Min 8 characters, uppercase, lowercase, number, symbol</p>
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
              className="w-full px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-red)]"
              placeholder="Jane"
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
              className="w-full px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-red)]"
              placeholder="Doe"
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
              className="w-full px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-red)]"
              placeholder="Defaults to first name"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              id="emailVerified"
              name="emailVerified"
              type="checkbox"
              className="rounded border-theme bg-theme-tertiary text-[var(--color-brand-red)] focus:ring-[var(--color-brand-red)]"
            />
            <label htmlFor="emailVerified" className="text-sm text-theme-secondary">
              Mark email as verified
            </label>
          </div>

          <div className="border-t border-theme pt-6">
            <h4 className="text-sm font-medium text-theme-secondary mb-3">Add to account (optional)</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="accountId" className="block text-sm text-theme-muted mb-1">
                  Account
                </label>
                <select
                  id="accountId"
                  name="accountId"
                  className="w-full px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-red)]"
                >
                  <option value="">— None —</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.slug})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="role" className="block text-sm text-theme-muted mb-1">
                  Role
                </label>
                <select
                  id="role"
                  name="role"
                  className="w-full px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-red)]"
                >
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 btn-primary disabled:opacity-50 rounded-lg text-sm font-medium transition"
            >
              {isSubmitting ? "Creating…" : "Create user"}
            </button>
            <Link
              to="/users"
              className="px-4 py-2 btn-secondary rounded-lg text-sm font-medium transition"
            >
              Cancel
            </Link>
          </div>
        </div>
      </Form>
    </div>
  );
}
