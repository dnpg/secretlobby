import { Form, useLoaderData, useActionData, redirect } from "react-router";
import type { Route } from "./+types/_index";
import { resolveTenant, isLocalhost } from "~/lib/subdomain.server";
import { prisma } from "@secretlobby/db";
import { getSession, createSessionResponse } from "@secretlobby/auth";
import { getSiteContent, getSitePassword } from "~/lib/content.server";

export function meta({ data }: Route.MetaArgs) {
  const title = data?.lobby?.title || data?.account?.name || data?.content?.bandName || "SecretLobby";
  return [
    { title },
    { name: "description", content: data?.lobby?.description || "Private music lobby" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  // Check if this is localhost development mode
  if (isLocalhost(request)) {
    // Use file-based content for localhost development
    const { session } = await getSession(request);

    if (session.isAuthenticated) {
      throw redirect("/player");
    }

    const content = await getSiteContent();
    return {
      isLocalhost: true,
      content,
      lobby: null,
      account: null,
      requiresPassword: true,
      isAuthenticated: false,
      tracks: [],
      notFound: false,
    };
  }

  // Resolve tenant from subdomain or custom domain
  const tenant = await resolveTenant(request);

  // If no tenant found, show a generic landing
  if (!tenant.account || !tenant.lobby) {
    return {
      isLocalhost: false,
      content: null,
      lobby: null,
      account: null,
      requiresPassword: false,
      isAuthenticated: false,
      tracks: [],
      notFound: true,
    };
  }

  const { account, lobby } = tenant;

  // Get session for authentication state
  const { session } = await getSession(request);

  // Check if lobby requires password and user is authenticated
  const isAuthenticated =
    session.isAuthenticated && session.lobbyId === lobby.id;

  if (lobby.password && !isAuthenticated) {
    // Return lobby metadata for password form (no tracks)
    return {
      isLocalhost: false,
      content: null,
      lobby: {
        id: lobby.id,
        name: lobby.name,
        title: lobby.title,
        description: lobby.description,
        backgroundImage: lobby.backgroundImage,
        bannerImage: lobby.bannerImage,
        profileImage: lobby.profileImage,
        settings: lobby.settings,
      },
      account: {
        id: account.id,
        name: account.name,
        slug: account.slug,
      },
      requiresPassword: true,
      isAuthenticated: false,
      tracks: [],
      notFound: false,
    };
  }

  // Fetch tracks for this lobby (filtered by band_id via lobbyId)
  const tracks = await prisma.track.findMany({
    where: { lobbyId: lobby.id },
    orderBy: { position: "asc" },
    select: {
      id: true,
      title: true,
      artist: true,
      duration: true,
      position: true,
    },
  });

  return {
    isLocalhost: false,
    content: null,
    lobby: {
      id: lobby.id,
      name: lobby.name,
      title: lobby.title,
      description: lobby.description,
      backgroundImage: lobby.backgroundImage,
      bannerImage: lobby.bannerImage,
      profileImage: lobby.profileImage,
      settings: lobby.settings,
    },
    account: {
      id: account.id,
      name: account.name,
      slug: account.slug,
    },
    requiresPassword: false,
    isAuthenticated: true,
    tracks,
    notFound: false,
  };
}

export async function action({ request }: Route.ActionArgs) {
  // Handle localhost development mode
  if (isLocalhost(request)) {
    const formData = await request.formData();
    const password = formData.get("password") as string;
    const sitePassword = await getSitePassword();

    if (password === sitePassword) {
      return createSessionResponse({ isAuthenticated: true }, request, "/player");
    }
    return { error: "Invalid password" };
  }

  const tenant = await resolveTenant(request);

  if (!tenant.lobby) {
    return { error: "Lobby not found" };
  }

  const formData = await request.formData();
  const password = formData.get("password") as string;

  // Verify password
  if (password !== tenant.lobby.password) {
    return { error: "Invalid password" };
  }

  // Create authenticated session for this lobby
  return createSessionResponse(
    {
      isAuthenticated: true,
      lobbyId: tenant.lobby.id,
    },
    request,
    "/player"
  );
}

export default function LobbyIndex() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  // Not found state
  if (data.notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4">Lobby Not Found</h1>
          <p className="text-gray-400">
            This lobby doesn't exist or hasn't been set up yet.
          </p>
        </div>
      </div>
    );
  }

  const { lobby, account, requiresPassword, tracks, isLocalhost, content } = data;

  // Password required state
  if (requiresPassword) {
    // Get title from either localhost content or tenant data
    const title = isLocalhost
      ? (content?.bandName || "Private Access")
      : (lobby?.title || account?.name || "Private Lobby");
    const description = isLocalhost
      ? content?.bandDescription
      : lobby?.description;

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
        <div className="w-full max-w-md p-8">
          <div className="bg-gray-800 rounded-2xl p-8 shadow-2xl border border-gray-700">
            <div className="text-center mb-8">
              <div
                className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-600 flex items-center justify-center"
              >
                <svg
                  className="w-8 h-8 text-white"
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
              <h1 className="text-2xl font-bold">
                {title}
              </h1>
              {description && (
                <p className="text-gray-400 mt-2">{description}</p>
              )}
            </div>

            {actionData?.error && (
              <div className="mb-6 text-red-400 text-sm text-center bg-red-500/10 py-3 px-4 rounded-lg">
                {actionData.error}
              </div>
            )}

            <Form method="post" className="space-y-4">
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  placeholder="Enter the password"
                  required
                  autoFocus
                  className="w-full px-4 py-3 rounded-lg bg-gray-700 border border-gray-600 text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                type="submit"
                className="w-full py-3 px-4 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Enter Lobby
              </button>
            </Form>
          </div>
        </div>
      </div>
    );
  }

  // Authenticated state - show tracks
  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-2xl mx-auto">
        <header className="text-center mb-12">
          <h1 className="text-4xl font-bold">
            {lobby?.title || account?.name || "Lobby"}
          </h1>
          {lobby?.description && (
            <p className="text-gray-400 mt-4">{lobby.description}</p>
          )}
        </header>

        {tracks.length > 0 ? (
          <div className="space-y-2">
            {tracks.map((track, index) => (
              <div
                key={track.id}
                className="bg-gray-800 rounded-lg p-4 flex items-center gap-4 hover:bg-gray-750 transition"
              >
                <span className="text-gray-500 w-8">{index + 1}</span>
                <div className="flex-1">
                  <h3 className="font-medium">{track.title}</h3>
                  {track.artist && (
                    <p className="text-sm text-gray-400">{track.artist}</p>
                  )}
                </div>
                {track.duration && (
                  <span className="text-sm text-gray-500">
                    {Math.floor(track.duration / 60)}:{String(track.duration % 60).padStart(2, "0")}
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center text-gray-400">
            <p>No tracks available yet.</p>
          </div>
        )}

        <div className="mt-8 text-center">
          <a
            href="/player"
            className="inline-block px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700"
          >
            Open Player
          </a>
        </div>
      </div>
    </div>
  );
}
