import { Form, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/_index";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "SecretLobby - Private Music Sharing for Artists" },
    { name: "description", content: "Share your unreleased music privately with fans" },
  ];
}

export async function loader() {
  const consoleUrl = process.env.CONSOLE_URL || "//app.secretlobby.local";
  return { consoleUrl };
}

export async function action({ request }: Route.ActionArgs) {
  const { prisma } = await import("@secretlobby/db");
  const { checkRateLimit, RATE_LIMIT_CONFIGS, getClientIp } = await import("@secretlobby/auth/rate-limit");

  // Rate limiting
  const rateLimitResult = await checkRateLimit(request, RATE_LIMIT_CONFIGS.INTERESTED_SIGNUP);
  if (!rateLimitResult.allowed) {
    return { error: "Too many requests. Please try again later." };
  }

  const formData = await request.formData();
  const email = formData.get("email");
  const source = formData.get("source") || "marketing-hero";

  if (typeof email !== "string" || !email.trim()) {
    return { error: "Email is required" };
  }

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { error: "Please enter a valid email address" };
  }

  try {
    // Check if already exists
    const existing = await prisma.interestedPerson.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existing) {
      return { success: true, message: "You're already on our list! We'll be in touch soon." };
    }

    // Create new interested person
    await prisma.interestedPerson.create({
      data: {
        email: email.toLowerCase(),
        source: typeof source === "string" ? source : "marketing-hero",
        ipAddress: getClientIp(request),
        userAgent: request.headers.get("user-agent") || undefined,
      },
    });

    return { success: true, message: "Thanks for your interest! We'll send you an invite soon." };
  } catch (error) {
    console.error("Error creating interested person:", error);
    return { error: "Something went wrong. Please try again." };
  }
}

export default function MarketingHome({ loaderData }: Route.ComponentProps) {
  const { consoleUrl } = loaderData;
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white">
      <header className="container mx-auto px-4 py-6">
        <nav className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">SecretLobby</h1>
          <div className="space-x-4">
            <a href={consoleUrl} className="hover:text-gray-300">
              Sign In
            </a>
          </div>
        </nav>
      </header>

      <main className="container mx-auto px-4 py-20">
        <div className="text-center max-w-3xl mx-auto">
          <h2 className="text-5xl font-bold mb-6">
            Share Your Music Privately
          </h2>
          <p className="text-xl text-gray-400 mb-10">
            Create password-protected lobbies for your fans. Share unreleased
            tracks, demos, and exclusive content with the people who matter most.
          </p>

          {actionData?.success ? (
            <div className="bg-green-900/30 border border-green-700 text-green-400 px-6 py-4 rounded-lg inline-block">
              {actionData.message}
            </div>
          ) : (
            <Form method="post" className="max-w-md mx-auto">
              <input type="hidden" name="source" value="marketing-hero" />
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="email"
                  name="email"
                  placeholder="Enter your email"
                  required
                  className="flex-1 px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-white text-black px-6 py-3 rounded-lg font-semibold hover:bg-gray-200 transition disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {isSubmitting ? "Submitting..." : "Get Early Access"}
                </button>
              </div>
              {actionData?.error && (
                <p className="text-red-400 text-sm mt-2">{actionData.error}</p>
              )}
              <p className="text-gray-500 text-sm mt-3">
                We're in private beta. Enter your email to get an invite.
              </p>
            </Form>
          )}
        </div>
      </main>
    </div>
  );
}
