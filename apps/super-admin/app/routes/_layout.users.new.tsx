import { Form, useLoaderData, useActionData, useNavigation, redirect, Link } from "react-router";
import type { Route } from "./+types/_layout.users.new";
import type { UserRole } from "@secretlobby/db";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PASSWORD_REQUIREMENTS, checkPasswordRequirements } from "@secretlobby/auth/requirements";
import { cn } from "@secretlobby/ui";

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
  const confirmPassword = (formData.get("confirmPassword") as string) ?? "";
  const firstName = (formData.get("firstName") as string)?.trim() || null;
  const lastName = (formData.get("lastName") as string)?.trim() || null;
  const name = (formData.get("name") as string)?.trim() || null;
  const emailVerified = formData.get("emailVerified") === "on";
  const accountId = (formData.get("accountId") as string)?.trim() || null;
  const role = (formData.get("role") as UserRole) || "VIEWER";

  if (password !== confirmPassword) {
    return { error: "Passwords do not match" };
  }

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

function PasswordRequirementsList({ password }: { password: string }) {
  const results = checkPasswordRequirements(password);
  const hasInput = password.length > 0;

  return (
    <ul className="mt-2 space-y-1 text-sm">
      {PASSWORD_REQUIREMENTS.map((req) => {
        const met = hasInput && results[req.key];
        return (
          <li key={req.key} className="flex items-center gap-2">
            <span className={met ? "w-4 text-center text-green-500" : "w-4 text-center text-theme-muted"}>
              {hasInput ? (met ? "\u2713" : "\u2717") : "\u2022"}
            </span>
            <span className={met ? "text-theme-primary" : "text-theme-secondary"}>{req.label}</span>
          </li>
        );
      })}
    </ul>
  );
}

export default function NewUserPage() {
  const { accounts } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    if (actionData?.error) toast.error(actionData.error);
  }, [actionData?.error]);

  const allReqsMet = PASSWORD_REQUIREMENTS.every((r) => checkPasswordRequirements(password)[r.key]);
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;

  const copyPassword = async () => {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      toast.success("Password copied");
    } catch {
      // Fallback for browsers/environments that block clipboard API
      const textArea = document.createElement("textarea");
      textArea.value = password;
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

  function passwordStrength(pw: string): { score: number; label: string } {
    if (!pw) return { score: 0, label: "" };
    const results = checkPasswordRequirements(pw);
    const met = PASSWORD_REQUIREMENTS.filter((r) => results[r.key]).length;
    const lengthBonus = pw.length >= 12 ? 1 : 0;
    const score = Math.min(4, met + lengthBonus);
    const labels = ["Weak", "Fair", "Good", "Strong"];
    return { score, label: labels[score - 1] ?? "Weak" };
  }

  function generateSecurePassword(): string {
    const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const lower = "abcdefghjkmnpqrstuvwxyz";
    const numbers = "23456789";
    const special = "!@#$%&*";
    const pick = (s: string, n: number) => Array.from({ length: n }, () => s[Math.floor(Math.random() * s.length)]);
    const chars = [
      ...pick(upper, 1),
      ...pick(lower, 1),
      ...pick(numbers, 1),
      ...pick(special, 1),
      ...pick(upper + lower + numbers + special, 12),
    ];
    return chars.sort(() => Math.random() - 0.5).join("");
  }

  const strength = passwordStrength(password);

  return (
    <div className="max-w-xl">
      <Form method="post">
        <input type="hidden" name="intent" value="create" />
        <div className="space-y-6 bg-theme-secondary rounded-xl border border-theme p-6">
          <h3 className="text-lg font-semibold text-theme-primary">Create user</h3>

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
              className="w-full px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-(--color-brand-red)"
              placeholder="user@example.com"
            />
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <label htmlFor="password" className="block text-sm font-medium text-theme-secondary">
                Password *
              </label>
              <button
                type="button"
                onClick={() => {
                  const p = generateSecurePassword();
                  setPassword(p);
                  setConfirmPassword(p);
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-(--color-brand-red-muted) text-(--color-brand-red) text-xs font-medium hover:bg-(--color-brand-red) hover:text-white transition cursor-pointer"
              >
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-current" />
                Generate secure password
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="flex-1 min-w-0 px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-(--color-brand-red)"
                placeholder="••••••••"
              />
              {password.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="shrink-0 px-3 py-2 rounded-lg border border-theme text-xs font-medium text-theme-secondary hover:text-theme-primary hover:bg-theme-tertiary transition cursor-pointer"
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                  <button
                    type="button"
                    onClick={copyPassword}
                    className="shrink-0 px-3 py-2 rounded-lg border border-theme text-xs font-medium text-theme-secondary hover:text-theme-primary hover:bg-theme-tertiary transition cursor-pointer"
                    title="Copy password"
                  >
                    Copy
                  </button>
                </>
              )}
            </div>
            {password.length > 0 && (
              <>
                <div className="mt-2 flex gap-1 mb-1">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className={cn(
                        "h-1.5 flex-1 rounded-full transition-colors",
                        i <= strength.score
                          ? strength.score <= 1
                            ? "bg-red-500"
                            : strength.score <= 2
                              ? "bg-amber-500"
                              : strength.score <= 3
                                ? "bg-yellow-500"
                                : "bg-green-500"
                          : "bg-theme-tertiary"
                      )}
                    />
                  ))}
                </div>
                <p className="text-xs text-theme-secondary mb-2">Strength: {strength.label || "—"}</p>
                <PasswordRequirementsList password={password} />
              </>
            )}
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-theme-secondary mb-1">
              Confirm password *
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-(--color-brand-red)"
              placeholder="••••••••"
            />
            {confirmPassword.length > 0 && (
              <p className={cn("mt-1 text-sm", passwordsMatch ? "text-green-500" : "text-red-400")}>
                {passwordsMatch ? "\u2713 Passwords match" : "\u2717 Passwords do not match"}
              </p>
            )}
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
              className="w-full px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-(--color-brand-red)"
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
              className="w-full px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-(--color-brand-red)"
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
              className="w-full px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-(--color-brand-red)"
              placeholder="Defaults to first name"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              id="emailVerified"
              name="emailVerified"
              type="checkbox"
              className="rounded border-theme bg-theme-tertiary text-(--color-brand-red) focus:ring-(--color-brand-red)"
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
                  className="w-full px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-(--color-brand-red)"
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
                  className="w-full px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-(--color-brand-red)"
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
              disabled={isSubmitting || !allReqsMet || !passwordsMatch}
              className="px-4 py-2 btn-primary disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition cursor-pointer"
            >
              {isSubmitting ? "Creating…" : "Create user"}
            </button>
            <Link
              to="/users"
              className="px-4 py-2 btn-secondary rounded-lg text-sm font-medium transition cursor-pointer"
            >
              Cancel
            </Link>
          </div>
        </div>
      </Form>
    </div>
  );
}
