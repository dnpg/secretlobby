import { useState } from "react";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import type { Route } from "./+types/reset-password";
import { verifyPasswordResetToken, resetPassword, resetPasswordSchema } from "@secretlobby/auth";
import { PASSWORD_REQUIREMENTS, checkPasswordRequirements } from "@secretlobby/auth/requirements";
import { cn } from "@secretlobby/ui";

export function meta() {
  return [{ title: "Reset Password - Console" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return { valid: false, error: "No reset token provided" };
  }

  const result = await verifyPasswordResetToken(token);
  if (!result.valid) {
    return { valid: false, error: result.error };
  }

  return { valid: true, token };
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const token = formData.get("token");
  const password = formData.get("password");
  const confirmPassword = formData.get("confirmPassword");

  const parsed = resetPasswordSchema.safeParse({ token, password, confirmPassword });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const err of parsed.error.errors) {
      const field = err.path[0]?.toString() || "form";
      errors[field] = err.message;
    }
    return { success: false, errors };
  }

  // Re-verify token before resetting
  const verification = await verifyPasswordResetToken(parsed.data.token);
  if (!verification.valid) {
    return { success: false, errors: { form: "This reset link has expired. Please request a new one." } };
  }

  await resetPassword(verification.userId, parsed.data.password);
  return { success: true };
}

function PasswordRequirementsList({ password }: { password: string }) {
  const results = checkPasswordRequirements(password);
  const hasInput = password.length > 0;

  return (
    <div className="mt-3 p-3 rounded-lg bg-gray-750 border border-gray-600/50">
      <p className="text-xs font-medium text-gray-400 mb-2">Password must contain:</p>
      <ul className="space-y-1.5">
        {PASSWORD_REQUIREMENTS.map((req) => {
          const met = hasInput && results[req.key];
          return (
            <li key={req.key} className="flex items-center gap-2 text-xs">
              <span className={`w-4 text-center ${met ? "text-green-400" : "text-gray-500"}`}>
                {hasInput ? (met ? "\u2713" : "\u2717") : "\u2022"}
              </span>
              <span className={met ? "text-green-300" : "text-gray-400"}>
                {req.label}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function ResetPassword() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const allRequirementsMet = PASSWORD_REQUIREMENTS.every((req) => req.test(password));
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;
  const canSubmit = allRequirementsMet && passwordsMatch && !isSubmitting;

  // Success state (check before invalid token, since action clears the token)
  if (actionData?.success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="w-full max-w-md p-8">
          <div className="bg-gray-800 rounded-2xl p-8 shadow-2xl border border-gray-700">
            <div className="text-center">
              <div className="mb-4 text-green-400 bg-green-500/10 py-4 px-4 rounded-lg">
                <p className="font-medium">Password Reset Successful</p>
                <p className="text-sm text-green-300 mt-1">
                  Your password has been updated. You can now sign in with your new password.
                </p>
              </div>
              <a
                href="/login"
                className="inline-block mt-4 py-3 px-6 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition cursor-pointer"
              >
                Sign In
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Invalid token state
  if (!loaderData.valid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="w-full max-w-md p-8">
          <div className="bg-gray-800 rounded-2xl p-8 shadow-2xl border border-gray-700">
            <div className="text-center">
              <div className="mb-4 text-red-400 bg-red-500/10 py-4 px-4 rounded-lg">
                <p className="font-medium">Invalid or Expired Link</p>
                <p className="text-sm text-red-300 mt-1">
                  {loaderData.error || "This password reset link is no longer valid."}
                </p>
              </div>
              <a
                href="/forgot-password"
                className="inline-block mt-4 py-3 px-6 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition cursor-pointer"
              >
                Request New Link
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="w-full max-w-md p-8">
        <div className="bg-gray-800 rounded-2xl p-8 shadow-2xl border border-gray-700">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-white">Set New Password</h1>
            <p className="text-gray-400 mt-2">Choose a strong password for your account</p>
          </div>

          {actionData?.errors?.form && (
            <div className="mb-6 text-red-400 text-sm text-center bg-red-500/10 py-3 px-4 rounded-lg">
              {actionData.errors.form}
            </div>
          )}

          <Form method="post" className="space-y-4">
            <input type="hidden" name="token" value={loaderData.token} />

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1">
                New Password
              </label>
              <input
                type="password"
                id="password"
                name="password"
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-lg bg-gray-700 border border-gray-600 text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <PasswordRequirementsList password={password} />
              {actionData?.errors?.password && (
                <p className="mt-1 text-xs text-red-400">{actionData.errors.password}</p>
              )}
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300 mb-1">
                Confirm Password
              </label>
              <input
                type="password"
                id="confirmPassword"
                name="confirmPassword"
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-lg bg-gray-700 border border-gray-600 text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {confirmPassword.length > 0 && (
                <p className={`mt-1 text-xs ${passwordsMatch ? "text-green-400" : "text-red-400"}`}>
                  {passwordsMatch ? "\u2713 Passwords match" : "\u2717 Passwords do not match"}
                </p>
              )}
              {actionData?.errors?.confirmPassword && (
                <p className="mt-1 text-xs text-red-400">{actionData.errors.confirmPassword}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              className={cn("w-full py-3 px-4 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50", {"cursor-pointer": canSubmit, "cursor-not-allowed": !canSubmit})}
            >
              {isSubmitting ? "Resetting..." : "Reset Password"}
            </button>
          </Form>
        </div>
      </div>
    </div>
  );
}
