import { Form, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import type { Route } from "./+types/login";
import { cn } from "@secretlobby/ui";
import { defaultLoginPageSettings, type LoginPageSettings } from "~/lib/content.server";

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
  return [{ title: "Login - Console" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  // Server-only imports
  const { getSession, getCsrfToken, isGoogleConfigured } = await import("@secretlobby/auth");
  const { getPublicUrl } = await import("@secretlobby/storage");
  const { getFirstAccountSettings } = await import("~/models/queries/account.server");
  const { getSystemSettings } = await import("~/models/queries/invitation.server");

  const { session } = await getSession(request);
  const url = new URL(request.url);
  const errorCode = url.searchParams.get("error");

  if (session.userId) {
    throw redirect("/");
  }

  // Check system settings for prelaunch mode
  const systemSettings = await getSystemSettings();
  const prelaunchMode = systemSettings?.prelaunchMode ?? false;
  const marketingUrl = process.env.MARKETING_URL || "https://secretlobby.io";

  // Load login page customization from the first account
  let loginSettings: LoginPageSettings = defaultLoginPageSettings;
  let logoImageUrl: string | null = null;

  const account = await getFirstAccountSettings();

  if (account?.settings && typeof account.settings === "object") {
    const settings = account.settings as Record<string, unknown>;
    if (settings.loginPage && typeof settings.loginPage === "object") {
      loginSettings = { ...defaultLoginPageSettings, ...(settings.loginPage as Partial<LoginPageSettings>) };
    }
  }

  if (loginSettings.logoType === "image" && loginSettings.logoImage) {
    logoImageUrl = getPublicUrl(loginSettings.logoImage);
  }

  const csrfToken = await getCsrfToken(request);

  return {
    googleEnabled: isGoogleConfigured(),
    errorMessage: errorCode ? ERROR_MESSAGES[errorCode] || `Authentication error: ${errorCode}` : null,
    loginSettings,
    logoImageUrl,
    csrfToken,
    prelaunchMode,
    marketingUrl,
  };
}

export async function action({ request }: Route.ActionArgs) {
  // Server-only imports
  const { authenticateWithPassword, createSessionResponse } = await import("@secretlobby/auth");
  const { csrfProtect } = await import("@secretlobby/auth/csrf");
  const { checkRateLimit, createRateLimitResponse, RATE_LIMIT_CONFIGS, resetRateLimit } = await import("@secretlobby/auth/rate-limit");

  // Verify CSRF token (uses HMAC validation - no session needed)
  await csrfProtect(request);

  // Check rate limit before processing
  const rateLimitResult = await checkRateLimit(request, RATE_LIMIT_CONFIGS.LOGIN);
  if (!rateLimitResult.allowed) {
    return createRateLimitResponse(rateLimitResult);
  }

  const formData = await request.formData();
  const email = formData.get("email");
  const password = formData.get("password");

  if (typeof email !== "string" || typeof password !== "string") {
    return { error: "Invalid form data" };
  }

  const result = await authenticateWithPassword(email, password);

  if (!result.success) {
    if (result.error === "account_locked") {
      const minutes = Math.ceil((result.lockedUntil.getTime() - Date.now()) / 60000);
      return {
        error: `Account locked. Try again in ${minutes} minute${minutes !== 1 ? "s" : ""}.`,
        locked: true,
      };
    }

    // invalid_credentials
    if (result.remainingAttempts === 1) {
      return {
        error: "Invalid email or password. You have 1 attempt remaining before your account is locked.",
        warning: true,
      };
    }

    return { error: "Invalid email or password" };
  }

  const user = result.user;

  if (user.accounts.length === 0) {
    return { error: "You don't have access to any accounts. Contact an administrator." };
  }

  const primaryAccount = user.accounts[0];
  const hasAdminRole = primaryAccount.role === "OWNER" || primaryAccount.role === "ADMIN";

  // Reset rate limit on successful login
  await resetRateLimit(request, RATE_LIMIT_CONFIGS.LOGIN);

  return createSessionResponse(
    {
      isAuthenticated: true,
      isAdmin: hasAdminRole,
      userId: user.id,
      userEmail: user.email,
      userName: user.name || undefined,
      currentAccountId: primaryAccount.accountId,
      currentAccountSlug: primaryAccount.account.slug,
      currentAccountRole: primaryAccount.role,
    },
    request,
    "/"
  );
}

export default function Login() {
  const { googleEnabled, errorMessage, loginSettings, logoImageUrl, csrfToken, prelaunchMode, marketingUrl } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const displayError = errorMessage || actionData?.error;
  const isWarning = actionData?.warning;
  const isLocked = actionData?.locked;

  const { bgColor, panelBgColor, panelBorderColor, textColor, title, description, logoType } = loginSettings;

  return (
    <main
      className="min-h-screen flex items-center justify-center"
      style={{ backgroundColor: bgColor }}
      aria-label="Login"
    >
      <div className="w-full max-w-md p-8">
        <div
          className="rounded-2xl p-8 shadow-2xl border"
          style={{
            backgroundColor: panelBgColor,
            borderColor: panelBorderColor,
          }}
        >
          <div className="text-center mb-8">
            {logoType === "image" && logoImageUrl && (
              <div className="flex justify-center mb-4">
                <img src={logoImageUrl} alt={title || "Logo"} className="max-w-[180px] max-h-[60px] object-contain" />
              </div>
            )}
            <h1 className="text-2xl font-bold" style={{ color: textColor }}>
              {title || "Console Login"}
            </h1>
            {description && (
              <p className="mt-2" style={{ color: textColor, opacity: 0.7 }}>
                {description}
              </p>
            )}
          </div>

          {displayError && (
            <div
              role="alert"
              aria-live="polite"
              className={`mb-6 text-sm text-center py-3 px-4 rounded-lg ${
                isWarning
                  ? "text-yellow-400 bg-yellow-500/10"
                  : "text-red-400 bg-red-500/10"
              }`}
            >
              <p>{displayError}</p>
              {isLocked && (
                <a href="/forgot-password" className="block mt-2 text-blue-400 hover:text-blue-300 font-medium text-xs">
                  Reset your password to unlock immediately
                </a>
              )}
            </div>
          )}

          {googleEnabled && (
            <>
              <a
                href="/auth/google"
                className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-white text-gray-700 font-medium rounded-lg border border-gray-300 hover:bg-gray-50 transition"
                aria-label="Sign in with Google"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Continue with Google
              </a>
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t" style={{ borderColor: panelBorderColor }}></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2" style={{ backgroundColor: panelBgColor, color: textColor, opacity: 0.7 }}>or</span>
                </div>
              </div>
            </>
          )}

          <Form method="post" className="space-y-4">
            <input type="hidden" name="_csrf" value={csrfToken} />
            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-1" style={{ color: textColor, opacity: 0.85 }}>
                Email
              </label>
              <input
                type="email"
                id="email"
                name="email"
                placeholder="you@example.com"
                required
                autoComplete="email"
                className="w-full px-4 py-3 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500"
                style={{ backgroundColor: `${bgColor}`, borderColor: panelBorderColor, color: textColor }}
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="password" className="block text-sm font-medium" style={{ color: textColor, opacity: 0.85 }}>
                  Password
                </label>
                <a href="/forgot-password" className="text-xs text-blue-400 hover:text-blue-300">
                  Forgot password?
                </a>
              </div>
              <input
                type="password"
                id="password"
                name="password"
                placeholder="Your password"
                required
                autoComplete="current-password"
                className="w-full px-4 py-3 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500"
                style={{ backgroundColor: `${bgColor}`, borderColor: panelBorderColor, color: textColor }}
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className={cn("w-full py-3 px-4 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50", {"cursor-pointer": !isSubmitting, "cursor-not-allowed": isSubmitting})}
            >
              {isSubmitting ? "Signing in..." : "Sign In"}
            </button>
          </Form>

          {prelaunchMode ? (
            <div className="mt-6 text-center text-sm" style={{ color: textColor, opacity: 0.7 }}>
              <p className="mb-2">We're currently in private beta.</p>
              <div className="space-y-1">
                <a
                  href={marketingUrl}
                  className="block text-blue-400 hover:text-blue-300 font-medium"
                >
                  Register your interest
                </a>
                <span className="text-gray-500">or</span>
                <a
                  href="/signup"
                  className="block text-blue-400 hover:text-blue-300 font-medium"
                >
                  Have an invite code? Sign up here
                </a>
              </div>
            </div>
          ) : (
            <div className="mt-6 text-center text-sm" style={{ color: textColor, opacity: 0.7 }}>
              Don't have an account?{" "}
              <a href="/signup" className="text-blue-400 hover:text-blue-300 font-medium">
                Sign up
              </a>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
