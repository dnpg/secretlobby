import { Form, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import type { Route } from "./+types/admin.login";
import { getSession, createSessionResponse } from "~/lib/session.server";
import { authenticateWithPassword, isGoogleConfigured } from "~/lib/auth.server";

const ERROR_MESSAGES: Record<string, string> = {
  google_not_configured: "Google sign-in is not configured.",
  missing_oauth_params: "Missing OAuth parameters. Please try again.",
  session_expired: "Your session expired. Please try again.",
  invalid_state: "Invalid OAuth state. Please try again.",
  unauthorized_domain: "Your email domain is not authorized.",
  no_account_access: "You don't have access to any accounts. Contact an administrator.",
  oauth_failed: "Authentication failed. Please try again.",
  access_denied: "Access was denied. Please try again.",
};

export function meta() {
  return [{ title: "Admin Login" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { session } = await getSession(request);
  const url = new URL(request.url);
  const errorCode = url.searchParams.get("error");

  // If user is already logged in with user-based auth, redirect to admin
  if (session.userId) {
    throw redirect("/admin");
  }

  return {
    googleEnabled: isGoogleConfigured(),
    errorMessage: errorCode ? ERROR_MESSAGES[errorCode] || `Authentication error: ${errorCode}` : null,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const email = formData.get("email");
  const password = formData.get("password");

  if (typeof email !== "string" || typeof password !== "string") {
    return { error: "Invalid form data" };
  }

  const user = await authenticateWithPassword(email, password);

  if (!user) {
    return { error: "Invalid email or password" };
  }

  // Check if user has any account access
  if (user.accounts.length === 0) {
    return { error: "You don't have access to any accounts. Contact an administrator." };
  }

  // Use the first account by default (user can switch later)
  const primaryAccount = user.accounts[0];

  // Check if user has admin role (OWNER or ADMIN)
  const hasAdminRole = primaryAccount.role === "OWNER" || primaryAccount.role === "ADMIN";

  return createSessionResponse(
    {
      isAuthenticated: true,
      isAdmin: hasAdminRole, // Legacy flag for backward compatibility
      userId: user.id,
      userEmail: user.email,
      userName: user.name || undefined,
      currentAccountId: primaryAccount.accountId,
      currentAccountSlug: primaryAccount.account.slug,
      currentAccountRole: primaryAccount.role,
    },
    request,
    "/admin"
  );
}

export default function AdminLogin() {
  const { googleEnabled, errorMessage } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  // Show OAuth error or form error
  const displayError = errorMessage || actionData?.error;

  return (
    <div className="min-h-screen flex items-center justify-center bg-theme-primary">
      <div className="w-full max-w-md p-8">
        <div className="bg-theme-secondary rounded-2xl p-8 shadow-2xl border border-theme">
          <div className="text-center mb-8">
            <div
              className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
              style={{ backgroundColor: "var(--color-primary)" }}
            >
              <svg
                className="w-8 h-8"
                style={{ color: "var(--color-primary-text)" }}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-theme-primary">Admin Login</h1>
            <p className="text-theme-muted mt-2">Sign in to manage your account</p>
          </div>

          {/* Error Message */}
          {displayError && (
            <div className="mb-6 text-red-400 text-sm text-center bg-red-500/10 py-3 px-4 rounded-lg">
              {displayError}
            </div>
          )}

          {/* Google Sign-In Button */}
          {googleEnabled && (
            <>
              <a
                href="/auth/google"
                className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-white text-gray-700 font-medium rounded-lg border border-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Continue with Google
              </a>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-theme"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-theme-secondary text-theme-muted">or</span>
                </div>
              </div>
            </>
          )}

          {/* Email/Password Form */}
          <Form method="post" className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-theme-secondary mb-1">
                Email
              </label>
              <input
                type="email"
                id="email"
                name="email"
                placeholder="you@example.com"
                required
                autoFocus={!googleEnabled}
                autoComplete="email"
                className="w-full px-4 py-3 rounded-lg bg-theme-tertiary border border-theme text-theme-primary placeholder:text-theme-muted focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-theme-secondary mb-1">
                Password
              </label>
              <input
                type="password"
                id="password"
                name="password"
                placeholder="Your password"
                required
                autoComplete="current-password"
                className="w-full px-4 py-3 rounded-lg bg-theme-tertiary border border-theme text-theme-primary placeholder:text-theme-muted focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 px-4 btn-primary font-semibold rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-offset-2 focus:ring-offset-[var(--color-bg-primary)] transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Signing in..." : "Sign In"}
            </button>
          </Form>

          <div className="mt-6 text-center">
            <a href="/" className="text-sm text-theme-muted hover:text-theme-primary transition">
              Back to site
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
