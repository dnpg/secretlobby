import { Form, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/forgot-password";
import { forgotPasswordSchema, generatePasswordResetToken } from "@secretlobby/auth";
import { sendPasswordResetEmail } from "@secretlobby/email";
import { cn } from "@secretlobby/ui";

export function meta() {
  return [{ title: "Forgot Password - Console" }];
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const rawEmail = formData.get("email");

  const parsed = forgotPasswordSchema.safeParse({ email: rawEmail });
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message, sent: false };
  }

  const result = await generatePasswordResetToken(parsed.data.email);

  if (result) {
    const authUrl = process.env.AUTH_URL || "http://localhost:3001";
    const resetUrl = `${authUrl}/reset-password?token=${result.token}`;

    try {
      await sendPasswordResetEmail({
        to: result.user.email,
        resetUrl,
        userName: result.user.name || undefined,
      });
    } catch (e) {
      console.error("Failed to send password reset email:", e);
    }
  }

  // Always return success to prevent email enumeration
  return { sent: true };
}

export default function ForgotPassword() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="w-full max-w-md p-8">
        <div className="bg-gray-800 rounded-2xl p-8 shadow-2xl border border-gray-700">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-white">Reset Password</h1>
            <p className="text-gray-400 mt-2">
              Enter your email and we'll send you a reset link
            </p>
          </div>

          {actionData?.sent ? (
            <div className="text-center">
              <div className="mb-4 text-green-400 bg-green-500/10 py-4 px-4 rounded-lg">
                <p className="font-medium">Check your email</p>
                <p className="text-sm text-green-300 mt-1">
                  If an account exists with that email, you'll receive a password reset link.
                </p>
              </div>
              <a
                href="/login"
                className="text-blue-400 hover:text-blue-300 text-sm font-medium"
              >
                Back to login
              </a>
            </div>
          ) : (
            <>
              {actionData?.error && (
                <div className="mb-6 text-red-400 text-sm text-center bg-red-500/10 py-3 px-4 rounded-lg">
                  {actionData.error}
                </div>
              )}

              <Form method="post" className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    placeholder="you@example.com"
                    required
                    autoComplete="email"
                    className="w-full px-4 py-3 rounded-lg bg-gray-700 border border-gray-600 text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={cn("w-full py-3 px-4 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50", {"cursor-pointer": !isSubmitting, "cursor-not-allowed": isSubmitting})}
                >
                  {isSubmitting ? "Sending..." : "Send Reset Link"}
                </button>
              </Form>

              <div className="mt-6 text-center text-sm text-gray-400">
                <a href="/login" className="text-blue-400 hover:text-blue-300 font-medium">
                  Back to login
                </a>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
