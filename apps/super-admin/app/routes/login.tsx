import { Form, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import type { Route } from "./+types/login";
import { getSession, createSessionResponse, authenticateWithPassword, isGoogleConfigured, isAdmin } from "@secretlobby/auth";

export function meta() {
  return [{ title: "Super Admin - Login" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { session } = await getSession(request);
  const { getCsrfToken } = await import("@secretlobby/auth");

  if (session.userId && isAdmin(session)) {
    throw redirect("/");
  }

  const csrfToken = await getCsrfToken(request);

  return {
    googleEnabled: isGoogleConfigured(),
    csrfToken,
  };
}

/** Load SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD from .env in cwd or parent dirs (no dotenv dep). */
async function loadSuperAdminEnv() {
  const path = await import("path");
  const fs = await import("fs");
  const cwd = process.cwd();
  for (const dir of [cwd, path.join(cwd, ".."), path.join(cwd, "..", "..")]) {
    const envPath = path.join(dir, ".env");
    try {
      const raw = fs.readFileSync(envPath, "utf8");
      for (const line of raw.split("\n")) {
        const m = line.match(/^SUPER_ADMIN_(EMAIL|PASSWORD)\s*=\s*(.*)$/);
        if (m) {
          const key = `SUPER_ADMIN_${m[1]}`;
          const val = m[2].replace(/^["']|["']$/g, "").trim();
          if (val && !process.env[key]) process.env[key] = val;
        }
      }
    } catch {
      // .env not found or unreadable
    }
  }
}

export async function action({ request }: Route.ActionArgs) {
  const { csrfProtect } = await import("@secretlobby/auth/csrf");

  await loadSuperAdminEnv();

  // Verify CSRF token (uses HMAC validation - no session needed)
  await csrfProtect(request);

  const formData = await request.formData();
  const email = formData.get("email");
  const password = formData.get("password");

  if (typeof email !== "string" || typeof password !== "string") {
    return { error: "Invalid form data" };
  }

  const result = await authenticateWithPassword(email, password);

  if (!result.success) {
    if (result.error === "account_locked") {
      return { error: `Account locked. Try again after ${result.lockedUntil.toLocaleTimeString()}.` };
    }
    return { error: "Invalid email or password" };
  }

  const user = result.user;

  const { prisma } = await import("@secretlobby/db");
  // Look up staff by related user email to avoid any ID mismatches
  let staff = await prisma.staff.findFirst({
    where: {
      user: {
        email: user.email.toLowerCase(),
      },
    },
  });

  // Bootstrap: ensure this user has Staff so login succeeds
  if (!staff) {
    const totalStaff = await prisma.staff.count();
    const configuredEmail = process.env.SUPER_ADMIN_EMAIL?.trim()?.toLowerCase();
    const emailMatches = configuredEmail && user.email.toLowerCase() === configuredEmail;

    // Allow when: (1) no Staff exist yet (first-ever admin), or (2) email matches SUPER_ADMIN_EMAIL
    if (totalStaff === 0 || emailMatches) {
      staff = await prisma.staff.upsert({
        where: { userId: user.id },
        update: { role: "OWNER" },
        create: { userId: user.id, role: "OWNER" },
      });
    }
  }

  if (!staff) {
    return {
      error:
        "This account does not have Super Admin access. Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD in your .env, then run: pnpm db:create-super-admin",
    };
  }

  return createSessionResponse(
    {
      isAuthenticated: true,
      isAdmin: true,
      userId: user.id,
      userEmail: user.email,
      userName: user.name || undefined,
      staffRole: staff.role,
    },
    request,
    "/"
  );
}

export default function SuperAdminLogin() {
  const { googleEnabled, csrfToken } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-md p-8">
        <div className="bg-gray-800 rounded-2xl p-8 shadow-2xl border border-gray-700">
          <div className="text-center mb-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-600 flex items-center justify-center">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold">Super Admin</h1>
            <p className="text-gray-400 mt-2">Restricted access</p>
          </div>

          {actionData?.error && (
            <div className="mb-6 text-red-400 text-sm text-center bg-red-500/10 py-3 px-4 rounded-lg">
              {actionData.error}
            </div>
          )}

          <Form method="post" className="space-y-4">
            <input type="hidden" name="_csrf" value={csrfToken} />
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1">
                Email
              </label>
              <input
                type="email"
                id="email"
                name="email"
                placeholder="admin@example.com"
                required
                autoComplete="email"
                className="w-full px-4 py-3 rounded-lg bg-gray-700 border border-gray-600 text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1">
                Password
              </label>
              <input
                type="password"
                id="password"
                name="password"
                placeholder="Your password"
                required
                autoComplete="current-password"
                className="w-full px-4 py-3 rounded-lg bg-gray-700 border border-gray-600 text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 px-4 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
            >
              {isSubmitting ? "Signing in..." : "Sign In"}
            </button>
          </Form>
        </div>
      </div>
    </div>
  );
}
