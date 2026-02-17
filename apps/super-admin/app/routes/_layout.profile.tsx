import { useState, useEffect } from "react";
import { Form, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/_layout.profile";
import { cn } from "@secretlobby/ui";
import { PASSWORD_REQUIREMENTS, checkPasswordRequirements } from "@secretlobby/auth/requirements";
import { toast } from "sonner";
import { updateOwnPassword } from "~/models/users/mutations.server";
import { updateUserAdmin } from "~/models/users/mutations.server";

export async function loader({ request }: Route.LoaderArgs) {
  const { getSession, requireUserAuth } = await import("@secretlobby/auth");

  const { session } = await getSession(request);
  requireUserAuth(session, "/login");
  if (!session.userId) throw redirect("/login");

  const { prisma } = await import("@secretlobby/db");
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, name: true, firstName: true, lastName: true, email: true },
  });
  if (!user) throw redirect("/login");

  return {
    user: { id: user.id, name: user.name, firstName: user.firstName, lastName: user.lastName, email: user.email },
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { getSession, requireUserAuth, updateSession } = await import("@secretlobby/auth");

  const { session } = await getSession(request);
  requireUserAuth(session, "/login");
  const userId = session.userId;
  if (!userId) return { error: "Not authenticated" };

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "update_name") {
    const firstName = (formData.get("firstName") as string)?.trim() || null;
    const lastName = (formData.get("lastName") as string)?.trim() || null;
    const name = (formData.get("name") as string)?.trim() || null;
    const result = await updateUserAdmin(userId, { firstName, lastName, name });
    if ("error" in result) return { error: result.error };
    const displayName = name ?? firstName ?? undefined;
    const { response } = await updateSession(request, { userName: displayName || undefined });
    const setCookie = response.headers.get("Set-Cookie");
    return redirect("/profile", {
      headers: setCookie ? { "Set-Cookie": setCookie } : undefined,
    });
  }

  if (intent === "update_password") {
    const currentPassword = formData.get("currentPassword") as string;
    const newPassword = formData.get("newPassword") as string;
    const confirmPassword = formData.get("confirmPassword") as string;
    if (!currentPassword) return { error: "Current password is required" };
    if (newPassword !== confirmPassword) return { error: "New passwords do not match" };
    const result = await updateOwnPassword(userId, currentPassword, newPassword);
    if ("success" in result) return { success: "password", message: "Password updated successfully" };
    return { error: result.error, intent: "update_password" };
  }

  return { error: "Invalid action" };
}

function passwordStrength(password: string): { score: number; label: string } {
  if (!password) return { score: 0, label: "" };
  const results = checkPasswordRequirements(password);
  const met = PASSWORD_REQUIREMENTS.filter((r) => results[r.key]).length;
  const lengthBonus = password.length >= 12 ? 1 : 0;
  const score = Math.min(4, met + lengthBonus);
  const labels = ["Weak", "Fair", "Good", "Strong"];
  return { score, label: labels[score - 1] ?? "Weak" };
}

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

export default function Profile() {
  const { user } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);

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
    if (actionData?.success) {
      setNewPassword("");
      setConfirmPassword("");
    }
  }, [actionData]);

  useEffect(() => {
    if (!actionData) return;
    if (actionData?.success === "password" && (actionData as { message?: string }).message) {
      toast.success((actionData as { message?: string }).message);
      return;
    }
    if ((actionData as { error?: string }).error) {
      toast.error((actionData as { error?: string }).error);
    }
  }, [actionData]);

  const strength = passwordStrength(newPassword);
  const allReqsMet = PASSWORD_REQUIREMENTS.every((r) => checkPasswordRequirements(newPassword)[r.key]);
  const passwordsMatch = newPassword === confirmPassword && confirmPassword.length > 0;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold mb-2 text-theme-primary">Profile</h2>
        <p className="text-theme-secondary">Manage your display name and password. Email cannot be changed here.</p>
      </div>
      {/* Saved/error messages are shown via Sonner toasts */}

      {/* Identity: first name, last name, display name */}
      <div className="bg-theme-secondary rounded-xl border border-theme p-6">
        <h3 className="text-lg font-semibold mb-4 text-theme-primary">Name & display name</h3>
        <Form method="post" className="space-y-4">
          <input type="hidden" name="intent" value="update_name" />
          <div>
            <label htmlFor="firstName" className="block text-sm font-medium text-theme-secondary mb-2">
              First name
            </label>
            <input
              type="text"
              id="firstName"
              name="firstName"
              autoComplete="given-name"
              defaultValue={user.firstName ?? ""}
              placeholder="Jane"
              className="w-full max-w-md px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-(--color-brand-red)"
            />
          </div>
          <div>
            <label htmlFor="lastName" className="block text-sm font-medium text-theme-secondary mb-2">
              Last name
            </label>
            <input
              type="text"
              id="lastName"
              name="lastName"
              autoComplete="family-name"
              defaultValue={user.lastName ?? ""}
              placeholder="Doe"
              className="w-full max-w-md px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-(--color-brand-red)"
            />
          </div>
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-theme-secondary mb-2">
              Display name (optional)
            </label>
            <input
              type="text"
              id="name"
              name="name"
              autoComplete="nickname"
              defaultValue={user.name ?? ""}
              placeholder="Defaults to first name"
              className="w-full max-w-md px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-(--color-brand-red)"
            />
          </div>
          <button type="submit" className="px-4 py-2 btn-primary rounded-lg transition">
            Save name
          </button>
        </Form>
      </div>

      {/* Email (read-only) */}
      <div className="bg-theme-secondary rounded-xl border border-theme p-6">
        <h3 className="text-lg font-semibold mb-2 text-theme-primary">Email address</h3>
        <p className="text-sm text-theme-secondary mb-2">Used for login. Contact an owner to change it.</p>
        <p className="text-sm font-medium text-theme-primary break-all">{user.email}</p>
      </div>

      {/* Password */}
      <div className="bg-theme-secondary rounded-xl border border-theme p-6">
        <h3 className="text-lg font-semibold mb-4 text-theme-primary">Change password</h3>
        <p className="text-sm text-theme-secondary mb-4">
          Use a strong password with a mix of letters, numbers, and symbols.
        </p>
        {/* Saved/error messages are shown via Sonner toasts */}
        <Form method="post" className="space-y-4">
          <input type="hidden" name="intent" value="update_password" />
          <div>
            <label htmlFor="currentPassword" className="block text-sm font-medium text-theme-secondary mb-2">
              Current password
            </label>
            <input
              type="password"
              id="currentPassword"
              name="currentPassword"
              required
              autoComplete="current-password"
              className="w-full max-w-md px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-(--color-brand-red)"
            />
          </div>
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <label htmlFor="newPassword" className="block text-sm font-medium text-theme-secondary">
                New password
              </label>
              <button
                type="button"
                onClick={() => {
                  const p = generateSecurePassword();
                  setNewPassword(p);
                  setConfirmPassword(p);
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-(--color-brand-red-muted) text-(--color-brand-red) text-xs font-medium hover:bg-(--color-brand-red) hover:text-white transition cursor-pointer"
              >
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-current" />
                Generate secure password
              </button>
            </div>
            <div className="flex items-center gap-2 max-w-md">
              <input
                type={showNewPassword ? "text" : "password"}
                id="newPassword"
                name="newPassword"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="flex-1 min-w-0 px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-(--color-brand-red)"
              />
              {newPassword.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowNewPassword((v) => !v)}
                  className="shrink-0 px-3 py-2 rounded-lg border border-theme text-xs font-medium text-theme-secondary hover:text-theme-primary hover:bg-theme-tertiary transition cursor-pointer"
                  title={showNewPassword ? "Hide password" : "Show password"}
                >
                  {showNewPassword ? "Hide" : "Show"}
                </button>
              )}
              {newPassword.length > 0 && (
                <button
                  type="button"
                  onClick={copyNewPassword}
                  className="shrink-0 px-3 py-2 rounded-lg border border-theme text-xs font-medium text-theme-secondary hover:text-theme-primary hover:bg-theme-tertiary transition cursor-pointer"
                  title="Copy password"
                >
                  Copy
                </button>
              )}
            </div>
            {newPassword.length > 0 && (
              <>
                <div className="mt-2 max-w-md flex gap-1 mb-1">
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
                <PasswordRequirementsList password={newPassword} />
              </>
            )}
          </div>
          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-theme-secondary mb-2">
              Confirm new password
            </label>
            <input
              type="password"
              id="confirmPassword"
              name="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="w-full max-w-md px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-(--color-brand-red)"
            />
            {confirmPassword.length > 0 && (
              <p className={cn("mt-1 text-sm", passwordsMatch ? "text-green-500" : "text-red-400")}>
                {passwordsMatch ? "\u2713 Passwords match" : "\u2717 Passwords do not match"}
              </p>
            )}
          </div>
          <button
            type="submit"
            disabled={!allReqsMet || !passwordsMatch}
            className={cn(
              "px-4 py-2 rounded-lg transition",
              allReqsMet && passwordsMatch ? "btn-primary" : "bg-theme-tertiary text-theme-muted cursor-not-allowed"
            )}
          >
            Update password
          </button>
        </Form>
      </div>
    </div>
  );
}
