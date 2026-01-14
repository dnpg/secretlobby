import { Form, redirect, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/admin.login";
import { getSession, createSessionResponse } from "~/lib/session.server";

export function meta() {
  return [{ title: "Admin Login" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { session } = await getSession(request);
  if (session.isAdmin) {
    throw redirect("/admin");
  }
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const password = formData.get("password");

  if (password === process.env.ADMIN_PASSWORD) {
    return createSessionResponse(
      { isAuthenticated: true, isAdmin: true },
      request,
      "/admin"
    );
  }

  return { error: "Invalid admin password" };
}

export default function AdminLogin() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

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
            <h1 className="text-2xl font-bold text-theme-primary">Admin Access</h1>
            <p className="text-theme-muted mt-2">Enter admin password</p>
          </div>

          <Form method="post" className="space-y-6">
            <div>
              <input
                type="password"
                name="password"
                placeholder="Admin password"
                required
                autoFocus
                className="w-full px-4 py-3 rounded-lg bg-theme-tertiary border border-theme text-theme-primary placeholder:text-theme-muted focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition"
              />
            </div>

            {actionData?.error && (
              <div className="text-red-400 text-sm text-center bg-red-500/10 py-2 rounded-lg">
                {actionData.error}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 px-4 btn-primary font-semibold rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-offset-2 focus:ring-offset-[var(--color-bg-primary)] transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Entering..." : "Enter Admin"}
            </button>
          </Form>

          <div className="mt-4 text-center">
            <a href="/" className="text-sm text-theme-muted hover:text-theme-primary transition">
              Back to site
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
