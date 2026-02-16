import { useState, useEffect } from "react";
import { Form, redirect, useActionData, useLoaderData, useSearchParams } from "react-router";
import type { Route } from "./+types/_layout.profile";
import { toast } from "sonner";
import { cn } from "@secretlobby/ui";
import { PASSWORD_REQUIREMENTS, checkPasswordRequirements } from "@secretlobby/auth/requirements";

export async function loader({ request }: Route.LoaderArgs) {
  const { getSession, requireUserAuth, getCsrfToken } = await import("@secretlobby/auth");
  const { getUserById } = await import("@secretlobby/auth");

  const { session } = await getSession(request);
  requireUserAuth(session);

  const userId = session.userId;
  if (!userId) throw redirect("/login");

  const user = await getUserById(userId);
  if (!user) throw redirect("/login");

  const csrfToken = await getCsrfToken(request);
  const baseUrl = new URL(request.url).origin;

  return {
    user: { id: user.id, name: user.name, email: user.email },
    csrfToken,
    baseUrl,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { getSession, requireUserAuth } = await import("@secretlobby/auth");
  const { csrfProtect } = await import("@secretlobby/auth/csrf");
  const { updateUserName, updateUserEmail, updateUserPassword } = await import("~/models/mutations/user.server");

  const { session } = await getSession(request);
  requireUserAuth(session);
  const userId = session.userId;
  if (!userId) return { error: "Not authenticated" };

  await csrfProtect(request);

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "update_name") {
    const name = (formData.get("name") as string)?.trim() ?? null;
    const result = await updateUserName(userId, name);
    if (!result.success) return { error: result.error };
    const { updateSession } = await import("@secretlobby/auth/session");
    const { response } = await updateSession(request, { userName: name || undefined });
    const setCookie = response.headers.get("Set-Cookie");
    return redirect("/profile", {
      headers: setCookie ? { "Set-Cookie": setCookie } : undefined,
    });
  }

  if (intent === "update_email") {
    const newEmail = (formData.get("newEmail") as string)?.trim();
    const currentPassword = formData.get("currentPassword") as string;
    if (!newEmail) return { error: "Email is required" };
    if (!currentPassword) return { error: "Current password is required to change email" };
    const baseUrl = new URL(request.url).origin;
    const result = await updateUserEmail(userId, newEmail, currentPassword, baseUrl);
    if (result.success) return { success: "email", message: "Verification sent to your new email. Please check your inbox and click the link to confirm." };
    return { error: result.error };
  }

  if (intent === "update_password") {
    const currentPassword = formData.get("currentPassword") as string;
    const newPassword = formData.get("newPassword") as string;
    const confirmPassword = formData.get("confirmPassword") as string;
    if (!currentPassword) return { error: "Current password is required" };
    if (newPassword !== confirmPassword) return { error: "New passwords do not match" };
    const result = await updateUserPassword(userId, currentPassword, newPassword);
    if (result.success) return { success: "password", message: "Password updated successfully" };
    return { error: result.error };
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
  const { user, csrfToken } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);

  const handleCopyPassword = () => {
    if (!newPassword) return;
    try {
      const doCopy = async () => {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(newPassword);
        } else {
          // Fallback for older browsers / non-secure contexts
          const textarea = document.createElement("textarea");
          textarea.value = newPassword;
          textarea.style.position = "fixed";
          textarea.style.left = "-9999px";
          document.body.appendChild(textarea);
          textarea.focus();
          textarea.select();
          try {
            document.execCommand("copy");
          } finally {
            document.body.removeChild(textarea);
          }
        }
      };

      void doCopy().then(
        () => {
          setCopiedToClipboard(true);
          toast.success("Password copied to clipboard");
          setTimeout(() => setCopiedToClipboard(false), 2000);
        },
        () => {
          toast.error("Could not copy password");
        }
      );
    } catch {
      toast.error("Could not copy password");
    }
  };

  useEffect(() => {
    const verified = searchParams.get("verified");
    if (verified === "1") {
      toast.success("Your email has been verified.");
      setSearchParams({}, { replace: true });
    } else if (verified === "already") {
      toast.info("Your email was already verified.");
      setSearchParams({}, { replace: true });
    }
    const err = searchParams.get("verify_error");
    if (err) {
      toast.error("Verification link invalid or expired.");
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (actionData?.success) toast.success(actionData.message);
    if (actionData?.error) toast.error(actionData.error);
  }, [actionData]);

  const strength = passwordStrength(newPassword);
  const allReqsMet = PASSWORD_REQUIREMENTS.every((r) => checkPasswordRequirements(newPassword)[r.key]);
  const passwordsMatch = newPassword === confirmPassword && confirmPassword.length > 0;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold mb-2">Profile</h2>
        <p className="text-theme-secondary">Manage your personal details and security</p>
      </div>

      {/* Personal details */}
      <div className="bg-theme-secondary border border-theme rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Personal details</h3>
        <Form method="post" className="space-y-4">
          <input type="hidden" name="intent" value="update_name" />
          <input type="hidden" name="_csrf" value={csrfToken} />
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-theme-secondary mb-2">
              Display name
            </label>
            <input
              type="text"
              id="name"
              name="name"
              defaultValue={user.name ?? ""}
              placeholder="Your name"
              className="w-full max-w-md px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            />
          </div>
          <button type="submit" className="px-4 py-2 btn-primary rounded-lg transition cursor-pointer">
            Save name
          </button>
        </Form>
      </div>

      {/* Email */}
      <div className="bg-theme-secondary border border-theme rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-2">Email address</h3>
        <p className="text-sm text-theme-secondary mb-3">
          This is the email we use for login and important notifications.
        </p>
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <p className="text-xs text-theme-muted uppercase tracking-wide mb-1">Current email</p>
            <p className="text-sm font-medium text-theme-primary break-all">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={() => setShowEmailForm((v) => !v)}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-theme text-xs font-medium text-theme-secondary hover:text-theme-primary hover:border-[var(--color-accent)] hover:bg-theme-tertiary transition cursor-pointer"
          >
            <span>{showEmailForm ? "Cancel" : "Change email"}</span>
          </button>
        </div>
        {showEmailForm && (
          <div className="mt-4 pt-4 border-t border-theme/60">
            <p className="text-xs text-theme-muted mb-3">
              For security, enter your current password and the new email. We'll send a verification link to the new address and only switch once you confirm it.
            </p>
            <Form method="post" className="space-y-4">
              <input type="hidden" name="intent" value="update_email" />
              <input type="hidden" name="_csrf" value={csrfToken} />
              <div>
                <label htmlFor="newEmail" className="block text-sm font-medium text-theme-secondary mb-2">
                  New email
                </label>
                <input
                  type="email"
                  id="newEmail"
                  name="newEmail"
                  required
                  autoComplete="email"
                  placeholder="new@example.com"
                  className="w-full max-w-md px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-(--color-accent)"
                />
              </div>
              <div>
                <label htmlFor="emailCurrentPassword" className="block text-sm font-medium text-theme-secondary mb-2">
                  Current password
                </label>
                <input
                  type="password"
                  id="emailCurrentPassword"
                  name="currentPassword"
                  required
                  autoComplete="current-password"
                  className="w-full max-w-md px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-(--color-accent)"
                />
              </div>
              <button type="submit" className="px-4 py-2 btn-primary rounded-lg transition cursor-pointer">
                Send verification to new email
              </button>
            </Form>
          </div>
        )}
      </div>

      {/* Password */}
      <div className="bg-theme-secondary border border-theme rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Change password</h3>
        <p className="text-sm text-theme-secondary mb-4">
          Use a strong password with a mix of letters, numbers, and symbols. You can use the generator below.
        </p>
        <Form method="post" className="space-y-4">
          <input type="hidden" name="intent" value="update_password" />
          <input type="hidden" name="_csrf" value={csrfToken} />

          <div>
            <label htmlFor="passwordCurrentPassword" className="block text-sm font-medium text-theme-secondary mb-2">
              Current password
            </label>
            <input
              type="password"
              id="passwordCurrentPassword"
              name="currentPassword"
              required
              autoComplete="current-password"
              className="w-full max-w-md px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
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
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-[var(--color-brand-red-muted)] text-[var(--color-brand-red)] text-xs font-medium hover:bg-[var(--color-brand-red)] hover:text-white transition cursor-pointer"
              >
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-current" />
                <span>Generate secure password</span>
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
                className="flex-1 min-w-0 px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
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
                    onClick={handleCopyPassword}
                    className="shrink-0 px-3 py-2 rounded-lg border border-theme text-xs font-medium text-theme-secondary hover:text-theme-primary hover:bg-theme-tertiary transition cursor-pointer"
                    title="Copy password"
                  >
                    {copiedToClipboard ? "Copied!" : "Copy"}
                  </button>
                </>
              )}
            </div>
            {newPassword.length > 0 && (
              <div className="mt-2 max-w-md">
                <div className="flex gap-1 mb-1">
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
                <p className="text-xs text-theme-secondary">
                  Strength: <span className={cn(
                    strength.score <= 1 && "text-red-400",
                    strength.score === 2 && "text-amber-400",
                    strength.score === 3 && "text-yellow-400",
                    strength.score === 4 && "text-green-400"
                  )}>{strength.label || "—"}</span>
                </p>
              </div>
            )}
            <PasswordRequirementsList password={newPassword} />
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
              className="w-full max-w-md px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
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
              allReqsMet && passwordsMatch ? "btn-primary cursor-pointer" : "bg-theme-tertiary text-theme-muted cursor-not-allowed"
            )}
          >
            Update password
          </button>
        </Form>
      </div>
    </div>
  );
}
