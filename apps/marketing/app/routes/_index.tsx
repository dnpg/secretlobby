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

export default function MarketingHome({ loaderData }: Route.ComponentProps) {
  const { consoleUrl } = loaderData;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white">
      <header className="container mx-auto px-4 py-6">
        <nav className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">SecretLobby</h1>
          <div className="space-x-4">
            <a href={consoleUrl} className="hover:text-gray-300">
              Sign In
            </a>
            <a
              href={`${consoleUrl}/signup`}
              className="bg-white text-black px-4 py-2 rounded-lg hover:bg-gray-200"
            >
              Get Started
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
          <a
            href={`${consoleUrl}/signup`}
            className="bg-white text-black px-8 py-4 rounded-lg text-lg font-semibold hover:bg-gray-200 inline-block"
          >
            Start Your Free Lobby
          </a>
        </div>
      </main>
    </div>
  );
}
