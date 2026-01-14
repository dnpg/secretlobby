import { Form, redirect, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/home";
import { getSession, createSessionResponse } from "~/lib/session.server";
import { getSitePassword } from "~/lib/content.server";
import { ColorModeToggle } from "~/components/ColorModeToggle";

export function meta() {
  return [
    { title: "Private Access" },
    { name: "description", content: "Enter password to access" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { session } = await getSession(request);
  if (session.isAuthenticated) {
    throw redirect("/player");
  }
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const password = formData.get("password");
  const sitePassword = await getSitePassword();

  if (password === sitePassword) {
    return createSessionResponse({ isAuthenticated: true }, request, "/player");
  }

  return { error: "Invalid password" };
}

export default function Home() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <div className="min-h-screen flex flex-col bg-theme-primary">
      {/* Header with Color Mode Toggle */}
      <header className="p-4 flex justify-end">
        <ColorModeToggle />
      </header>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center">
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
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-theme-primary">Private Access</h1>
            <p className="text-theme-muted mt-2">Enter password to continue</p>
          </div>

          <Form method="post" className="space-y-6">
            <div>
              <input
                type="password"
                name="password"
                placeholder="Enter password"
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
              {isSubmitting ? "Entering..." : "Enter"}
            </button>
          </Form>
        </div>
        </div>
      </div>
    </div>
  );
}
