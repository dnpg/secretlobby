import { Outlet, redirect, useLoaderData, NavLink, useParams } from "react-router";
import type { Route } from "./+types/_layout.lobby";

export async function loader({ request, params }: Route.LoaderArgs) {
  const { getSession, requireUserAuth, updateSession } = await import("@secretlobby/auth");
  const { getLobbyById } = await import("~/models/queries/lobby.server");

  const { session } = await getSession(request);
  requireUserAuth(session);

  const accountId = session.currentAccountId;
  if (!accountId) {
    throw redirect("/login");
  }

  const { lobbyId } = params;
  if (!lobbyId) {
    throw redirect("/lobbies");
  }

  // Fetch the lobby and verify it belongs to this account
  const lobby = await getLobbyById(lobbyId);
  if (!lobby || lobby.accountId !== accountId) {
    throw redirect("/lobbies");
  }

  // Update session with current lobby if different
  if (session.currentLobbyId !== lobbyId) {
    await updateSession(request, {
      currentLobbyId: lobby.id,
      currentLobbySlug: lobby.slug,
    });
  }

  return {
    lobby: {
      id: lobby.id,
      name: lobby.name,
      slug: lobby.slug,
      title: lobby.title,
      isDefault: lobby.isDefault,
      isPublished: lobby.isPublished,
    },
  };
}

const lobbyNavItems = [
  { to: "", label: "Content", end: true },
  { to: "playlist", label: "Playlist" },
  { to: "theme", label: "Theme" },
  { to: "login-page", label: "Login Page" },
  { to: "social", label: "Social" },
  { to: "technical-info", label: "Tech Info" },
  { to: "password", label: "Password" },
];

export default function LobbyLayout() {
  const { lobby } = useLoaderData<typeof loader>();
  const { lobbyId } = useParams();

  return (
    <div className="space-y-6">
      {/* Lobby Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{lobby.title || lobby.name}</h1>
            {lobby.isDefault && (
              <span className="px-2 py-1 text-xs font-medium bg-[var(--color-accent)] text-[var(--color-primary-text)] rounded-full">
                Default
              </span>
            )}
            <span
              className={`px-2 py-1 text-xs font-medium rounded-full ${
                lobby.isPublished
                  ? "bg-green-500/20 text-green-400"
                  : "bg-yellow-500/20 text-yellow-400"
              }`}
            >
              {lobby.isPublished ? "Published" : "Draft"}
            </span>
          </div>
          <p className="text-sm text-theme-secondary mt-1">/{lobby.slug}</p>
        </div>
      </div>

      {/* Lobby Navigation */}
      <nav className="border-b border-theme">
        <div className="flex gap-1 overflow-x-auto">
          {lobbyNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to ? `/lobby/${lobbyId}/${item.to}` : `/lobby/${lobbyId}`}
              end={item.end}
              className={({ isActive }) =>
                `px-4 py-3 text-sm font-medium transition border-b-2 whitespace-nowrap ${
                  isActive
                    ? "border-[var(--color-accent)] text-theme-primary"
                    : "border-transparent text-theme-secondary hover:text-theme-primary"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Lobby Content */}
      <Outlet context={{ lobby }} />
    </div>
  );
}

// Export a type-safe hook for child routes to access lobby context
export interface LobbyContext {
  lobby: {
    id: string;
    name: string;
    slug: string;
    title: string | null;
    isDefault: boolean;
    isPublished: boolean;
  };
}
