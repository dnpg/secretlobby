import { Form, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import type { Route } from "./+types/signup";
import { cn } from "@secretlobby/ui";
import { useState, useEffect } from "react";

export function meta() {
  return [{ title: "Sign Up - Console" }];
}

const ERROR_MESSAGES: Record<string, string> = {
  invite_required: "An invitation code is required to sign up during our private beta.",
  invalid_invite: "Your invitation code is invalid or expired. Please check and try again.",
  email_mismatch: "The Google account email doesn't match the invitation. Please use the correct Google account.",
};

export async function loader({ request }: Route.LoaderArgs) {
  // Server-only imports
  const { getSession, getCsrfToken, isGoogleConfigured } = await import("@secretlobby/auth");
  const { getValidInvitationByCode, getSystemSettings } = await import("~/models/queries/invitation.server");

  const { session } = await getSession(request);

  if (session.userId) {
    throw redirect("/");
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const errorCode = url.searchParams.get("error");

  // Check system settings
  const settings = await getSystemSettings();
  const prelaunchMode = settings?.prelaunchMode ?? false;

  // Get error message from URL if present
  const urlErrorMessage = errorCode ? ERROR_MESSAGES[errorCode] || null : null;

  // In prelaunch mode, require valid invite code
  if (prelaunchMode) {
    const marketingUrl = process.env.MARKETING_URL || "https://secretlobby.io";

    if (!code) {
      // No code provided - show code entry form
      const csrfToken = await getCsrfToken(request);
      return {
        googleEnabled: isGoogleConfigured(),
        csrfToken,
        inviteCode: null,
        inviteEmail: null,
        inviteName: null,
        prelaunchMode: true,
        needsCodeValidation: true,
        marketingUrl,
        urlError: urlErrorMessage,
      };
    }

    const invitation = await getValidInvitationByCode(code);
    if (!invitation) {
      // Invalid or expired code - show code entry form with error
      const csrfToken = await getCsrfToken(request);
      return {
        googleEnabled: isGoogleConfigured(),
        csrfToken,
        inviteCode: null,
        inviteEmail: null,
        inviteName: null,
        prelaunchMode: true,
        needsCodeValidation: true,
        codeError: "Invalid or expired invitation code. Please check your code and try again.",
        marketingUrl,
        urlError: urlErrorMessage,
      };
    }

    const csrfToken = await getCsrfToken(request);
    return {
      googleEnabled: isGoogleConfigured(),
      csrfToken,
      inviteCode: code,
      inviteEmail: invitation.email,
      inviteName: invitation.interestedPerson?.name || null,
      prelaunchMode: true,
      needsCodeValidation: false,
      marketingUrl,
      urlError: urlErrorMessage,
    };
  }

  // Not in prelaunch mode - allow normal signup
  const csrfToken = await getCsrfToken(request);
  const marketingUrl = process.env.MARKETING_URL || "https://secretlobby.io";

  // If code provided, validate it optionally
  if (code) {
    const invitation = await getValidInvitationByCode(code);
    if (invitation) {
      return {
        googleEnabled: isGoogleConfigured(),
        csrfToken,
        inviteCode: code,
        inviteEmail: invitation.email,
        inviteName: invitation.interestedPerson?.name || null,
        prelaunchMode: false,
        needsCodeValidation: false,
        marketingUrl,
        urlError: urlErrorMessage,
      };
    }
  }

  return {
    googleEnabled: isGoogleConfigured(),
    csrfToken,
    inviteCode: null,
    inviteEmail: null,
    inviteName: null,
    prelaunchMode: false,
    needsCodeValidation: false,
    marketingUrl,
    urlError: urlErrorMessage,
  };
}

export async function action({ request }: Route.ActionArgs) {
  // Server-only imports
  const { createSessionResponse, createUser, addUserToAccount, getSession } = await import("@secretlobby/auth");
  const { csrfProtect } = await import("@secretlobby/auth/csrf");
  const { checkRateLimit, createRateLimitResponse, RATE_LIMIT_CONFIGS, resetRateLimit } = await import("@secretlobby/auth/rate-limit");
  const { getUserByEmail } = await import("~/models/queries/user.server");
  const { getAccountBySlug } = await import("~/models/queries/account.server");
  const { getValidInvitationByCode, getSystemSettings } = await import("~/models/queries/invitation.server");
  const { createAccount, updateAccountDefaultLobby } = await import("~/models/mutations/account.server");
  const { createLobby } = await import("~/models/mutations/lobby.server");
  const { createLogger, formatError } = await import("@secretlobby/logger/server");
  const { prisma, InvitationStatus } = await import("@secretlobby/db");

  const logger = createLogger({ service: "console:signup" });

  // Verify CSRF token (uses HMAC validation - no session needed)
  await csrfProtect(request);

  const formData = await request.formData();
  const intent = formData.get("intent");

  // Handle code validation intent
  if (intent === "validate-code") {
    const email = formData.get("email");
    const code = formData.get("inviteCode");

    if (typeof email !== "string" || typeof code !== "string" || !email.trim() || !code.trim()) {
      return { intent: "validate-code", error: "Email and invitation code are required" };
    }

    const invitation = await getValidInvitationByCode(code.trim());

    if (!invitation) {
      return { intent: "validate-code", error: "Invalid or expired invitation code" };
    }

    if (invitation.email.toLowerCase() !== email.toLowerCase().trim()) {
      return { intent: "validate-code", error: "This invitation code is not associated with this email" };
    }

    // Return validated data for client-side state
    return {
      intent: "validate-code",
      validated: true,
      validatedEmail: invitation.email,
      validatedCode: code.trim(),
      validatedName: invitation.interestedPerson?.name || null,
    };
  }

  // Check rate limit before processing signup
  const rateLimitResult = await checkRateLimit(request, RATE_LIMIT_CONFIGS.SIGNUP);
  if (!rateLimitResult.allowed) {
    return createRateLimitResponse(rateLimitResult);
  }

  // Helper function to generate a unique slug from account name
  async function generateUniqueSlug(name: string): Promise<string> {
    // Convert to slug format: lowercase, replace spaces with hyphens, remove special chars
    let baseSlug = name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .trim();

    // Ensure it starts with a letter
    if (!/^[a-z]/.test(baseSlug)) {
      baseSlug = `account-${baseSlug}`;
    }

    // Check if slug exists
    let slug = baseSlug;
    let counter = 1;

    while (await getAccountBySlug(slug)) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    return slug;
  }

  const name = formData.get("name");
  const email = formData.get("email");
  const password = formData.get("password");
  const confirmPassword = formData.get("confirmPassword");
  const accountName = formData.get("accountName");
  const inviteCode = formData.get("inviteCode");

  // Validation
  if (
    typeof name !== "string" ||
    typeof email !== "string" ||
    typeof password !== "string" ||
    typeof confirmPassword !== "string" ||
    typeof accountName !== "string"
  ) {
    return { error: "Invalid form data" };
  }

  if (!name.trim() || !email.trim() || !password || !accountName.trim()) {
    return { error: "All fields are required" };
  }

  if (password.length < 8) {
    return { error: "Password must be at least 8 characters long" };
  }

  if (password !== confirmPassword) {
    return { error: "Passwords do not match" };
  }

  // Check system settings for prelaunch mode
  const settings = await getSystemSettings();
  const prelaunchMode = settings?.prelaunchMode ?? false;

  // Validate invite code if in prelaunch mode or if code provided
  let invitation = null;
  if (inviteCode && typeof inviteCode === "string") {
    invitation = await getValidInvitationByCode(inviteCode);

    if (!invitation) {
      return { error: "Invalid or expired invitation code" };
    }

    // Ensure email matches the invitation
    if (invitation.email.toLowerCase() !== email.toLowerCase()) {
      return { error: "Email does not match the invitation" };
    }
  } else if (prelaunchMode) {
    return { error: "An invitation code is required during prelaunch" };
  }

  // Check if email already exists
  const existingUser = await getUserByEmail(email);

  if (existingUser) {
    return { error: "An account with this email already exists" };
  }

  try {
    // Create user
    const user = await createUser(email, password, name);

    // Generate unique slug for account
    const slug = await generateUniqueSlug(accountName);

    // Create account
    const account = await createAccount({
      name: accountName,
      slug,
      subscriptionTier: "FREE",
    });

    // Link user to account as OWNER
    await addUserToAccount(user.id, account.id, "OWNER");

    // Create default lobby for the account
    const defaultLobby = await createLobby({
      accountId: account.id,
      name: "Main Lobby",
      slug: "main",
      title: accountName,
      description: `Welcome to ${accountName}`,
      isDefault: true,
      isPublished: false,
    });

    // Update account with default lobby reference
    await updateAccountDefaultLobby(account.id, defaultLobby.id);

    // Mark invitation as used if present
    if (invitation) {
      await prisma.invitation.update({
        where: { id: invitation.id },
        data: {
          status: InvitationStatus.USED,
          usedAt: new Date(),
        },
      });

      // Update interested person if linked
      if (invitation.interestedPersonId) {
        await prisma.interestedPerson.update({
          where: { id: invitation.interestedPersonId },
          data: { convertedAt: new Date() },
        });
      }

      logger.info({ email, invitationId: invitation.id }, "Invitation used for signup");
    }

    // Reset rate limit on successful signup
    await resetRateLimit(request, RATE_LIMIT_CONFIGS.SIGNUP);

    // Create session and redirect
    return createSessionResponse(
      {
        isAuthenticated: true,
        isAdmin: true,
        userId: user.id,
        userEmail: user.email,
        userName: user.name || undefined,
        currentAccountId: account.id,
        currentAccountSlug: account.slug,
        currentAccountRole: "OWNER",
      },
      request,
      "/"
    );
  } catch (error) {
    logger.error({ error: formatError(error) }, "Signup error");
    return { error: "Failed to create account. Please try again." };
  }
}

export default function Signup() {
  const { googleEnabled, csrfToken, inviteCode, inviteEmail, inviteName, prelaunchMode, needsCodeValidation, codeError, marketingUrl, urlError } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  // Track validated state from code validation action
  const [validatedData, setValidatedData] = useState<{
    email: string;
    code: string;
    name: string | null;
  } | null>(null);

  // Check if code was validated via action
  const wasCodeValidated = actionData?.intent === "validate-code" && actionData?.validated;

  // Update validatedData when action returns validated data
  useEffect(() => {
    if (wasCodeValidated && actionData?.validatedEmail && actionData?.validatedCode) {
      setValidatedData({
        email: actionData.validatedEmail,
        code: actionData.validatedCode,
        name: actionData.validatedName ?? null,
      });
    }
  }, [wasCodeValidated, actionData?.validatedEmail, actionData?.validatedCode, actionData?.validatedName]);

  // Determine the effective invite data
  const effectiveInviteEmail = inviteEmail || validatedData?.email || null;
  const effectiveInviteCode = inviteCode || validatedData?.code || null;
  const effectiveInviteName = inviteName || validatedData?.name || null;

  // Should show code entry form?
  const showCodeEntryForm = prelaunchMode && needsCodeValidation && !validatedData;

  // Has validated invite (either from URL or from validation step)?
  const hasInvite = !!effectiveInviteCode && !!effectiveInviteEmail;

  // Get error message for the current context
  const validationError = actionData?.intent === "validate-code" && !actionData?.validated ? actionData?.error : null;
  const signupError = actionData?.intent !== "validate-code" ? actionData?.error : null;

  // Code entry form for prelaunch mode
  if (showCodeEntryForm) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="w-full max-w-md p-8">
          <div className="bg-gray-800 rounded-2xl p-8 shadow-2xl border border-gray-700">
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-white">Welcome to SecretLobby</h1>
              <p className="text-gray-400 mt-2">Enter your invitation details to get started</p>
            </div>

            <div className="mb-6 bg-blue-900/30 border border-blue-700 text-blue-400 py-3 px-4 rounded-lg text-center">
              <p className="text-sm">We're currently in private beta.</p>
              <p className="text-xs text-blue-300 mt-1">You need an invitation code to create an account.</p>
            </div>

            {(codeError || validationError || urlError) && (
              <div className="mb-6 text-red-400 text-sm text-center bg-red-500/10 py-3 px-4 rounded-lg">
                {codeError || validationError || urlError}
              </div>
            )}

            <Form method="post" className="space-y-4">
              <input type="hidden" name="_csrf" value={csrfToken} />
              <input type="hidden" name="intent" value="validate-code" />

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1">
                  Email Address
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
                <p className="text-xs text-gray-400 mt-1">
                  Enter the email address your invitation was sent to
                </p>
              </div>

              <div>
                <label htmlFor="inviteCode" className="block text-sm font-medium text-gray-300 mb-1">
                  Invitation Code
                </label>
                <input
                  type="text"
                  id="inviteCode"
                  name="inviteCode"
                  placeholder="Paste your invitation code"
                  required
                  className="w-full px-4 py-3 rounded-lg bg-gray-700 border border-gray-600 text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                />
                <p className="text-xs text-gray-400 mt-1">
                  The 64-character code from your invitation email
                </p>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className={cn("w-full py-3 px-4 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 transition", {"cursor-pointer": !isSubmitting, "cursor-not-allowed": isSubmitting})}
              >
                {isSubmitting ? "Validating..." : "Continue"}
              </button>
            </Form>

            <div className="mt-6 text-center text-sm text-gray-400">
              Already have an account?{" "}
              <a href="/login" className="text-blue-400 hover:text-blue-300 font-medium">
                Sign in
              </a>
            </div>

            <div className="mt-4 text-center text-sm text-gray-500">
              Don't have an invitation?{" "}
              <a href={marketingUrl} className="text-blue-400 hover:text-blue-300 font-medium">
                Register your interest
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Full signup form (either no prelaunch, or code already validated)
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="w-full max-w-md p-8">
        <div className="bg-gray-800 rounded-2xl p-8 shadow-2xl border border-gray-700">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-white">Create Your Account</h1>
            <p className="text-gray-400 mt-2">Start building your lobby page</p>
          </div>

          {hasInvite && (
            <div className="mb-6 bg-blue-900/30 border border-blue-700 text-blue-400 py-3 px-4 rounded-lg text-center">
              <p className="text-sm">You've been invited to join SecretLobby!</p>
              <p className="text-xs text-blue-300 mt-1">Your account will be created with: {effectiveInviteEmail}</p>
            </div>
          )}

          {(signupError || urlError) && (
            <div className="mb-6 text-red-400 text-sm text-center bg-red-500/10 py-3 px-4 rounded-lg">
              {signupError || urlError}
            </div>
          )}

          {googleEnabled && (
            <>
              <a
                href={effectiveInviteCode ? `/auth/google?inviteCode=${effectiveInviteCode}` : "/auth/google"}
                className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-white text-gray-700 font-medium rounded-lg border border-gray-300 hover:bg-gray-50 transition"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Sign up with Google
              </a>
              {hasInvite && (
                <p className="text-xs text-gray-400 mt-2 text-center">
                  Use the same email address as your invitation: {effectiveInviteEmail}
                </p>
              )}
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-600"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-gray-800 text-gray-400">or</span>
                </div>
              </div>
            </>
          )}

          <Form method="post" className="space-y-4">
            <input type="hidden" name="_csrf" value={csrfToken} />
            {effectiveInviteCode && <input type="hidden" name="inviteCode" value={effectiveInviteCode} />}

            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-1">
                Your Name
              </label>
              <input
                type="text"
                id="name"
                name="name"
                placeholder="John Doe"
                required
                autoComplete="name"
                defaultValue={effectiveInviteName || ""}
                className="w-full px-4 py-3 rounded-lg bg-gray-700 border border-gray-600 text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

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
                defaultValue={effectiveInviteEmail || ""}
                readOnly={hasInvite}
                className={cn(
                  "w-full px-4 py-3 rounded-lg border text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500",
                  hasInvite
                    ? "bg-gray-600 border-gray-500 cursor-not-allowed"
                    : "bg-gray-700 border-gray-600"
                )}
              />
              {hasInvite && (
                <p className="text-xs text-gray-400 mt-1">
                  Email is locked to your invitation
                </p>
              )}
            </div>

            <div>
              <label htmlFor="accountName" className="block text-sm font-medium text-gray-300 mb-1">
                Band/Organization Name
              </label>
              <input
                type="text"
                id="accountName"
                name="accountName"
                placeholder="My Awesome Band"
                required
                className="w-full px-4 py-3 rounded-lg bg-gray-700 border border-gray-600 text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-400 mt-1">
                This will be used to create your lobby URL (e.g., my-awesome-band.secretlobby.local)
              </p>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1">
                Password
              </label>
              <input
                type="password"
                id="password"
                name="password"
                placeholder="At least 8 characters"
                required
                autoComplete="new-password"
                minLength={8}
                className="w-full px-4 py-3 rounded-lg bg-gray-700 border border-gray-600 text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300 mb-1">
                Confirm Password
              </label>
              <input
                type="password"
                id="confirmPassword"
                name="confirmPassword"
                placeholder="Re-enter your password"
                required
                autoComplete="new-password"
                minLength={8}
                className="w-full px-4 py-3 rounded-lg bg-gray-700 border border-gray-600 text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className={cn("w-full py-3 px-4 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 transition", {"cursor-pointer": !isSubmitting, "cursor-not-allowed": isSubmitting})}
            >
              {isSubmitting ? "Creating Account..." : "Create Account"}
            </button>
          </Form>

          <div className="mt-6 text-center text-sm text-gray-400">
            Already have an account?{" "}
            <a href="/login" className="text-blue-400 hover:text-blue-300 font-medium">
              Sign in
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
