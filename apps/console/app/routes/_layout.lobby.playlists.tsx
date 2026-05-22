import { Form, Link, useLoaderData, useActionData, useNavigation, redirect } from "react-router";
import { useEffect, useState } from "react";
import type { Route } from "./+types/_layout.lobby.playlists";
import { toast } from "sonner";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `Playlists - ${data?.lobbyName || "Lobby"} - Admin` }];
}

interface PlaylistRow {
  id: string;
  name: string;
  isDefault: boolean;
  trackCount: number;
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { getSession, isAdmin, getCsrfToken } = await import("@secretlobby/auth");
  const { getLobbyById } = await import("~/models/queries/lobby.server");
  const { getPlaylistsByLobbyIdWithTracks } = await import("~/models/queries/playlist.server");
  const { ensureDefaultPlaylistExists } = await import("~/models/mutations/playlist.server");

  const { session } = await getSession(request);
  if (!isAdmin(session)) {
    return { playlists: [] as PlaylistRow[], lobbyName: "", lobbyId: "", csrfToken: "" };
  }

  const accountId = session.currentAccountId;
  if (!accountId) throw redirect("/login");

  const { lobbyId } = params;
  if (!lobbyId) throw redirect("/lobbies");

  const lobby = await getLobbyById(lobbyId);
  if (!lobby || lobby.accountId !== accountId) throw redirect("/lobbies");

  // Make sure a default playlist exists so the list isn't empty on first visit.
  await ensureDefaultPlaylistExists(lobbyId);

  const [playlists, csrfToken] = await Promise.all([
    getPlaylistsByLobbyIdWithTracks(lobbyId),
    getCsrfToken(request),
  ]);

  return {
    lobbyId,
    lobbyName: lobby.name,
    csrfToken,
    playlists: playlists.map((p) => ({
      id: p.id,
      name: p.name,
      isDefault: p.isDefault,
      trackCount: p.tracks.length,
    })) as PlaylistRow[],
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { getSession, isAdmin } = await import("@secretlobby/auth");
  const { csrfProtect } = await import("@secretlobby/auth/csrf");
  const { getLobbyById } = await import("~/models/queries/lobby.server");
  const { createPlaylist } = await import("~/models/mutations/playlist.server");

  await csrfProtect(request);

  const { session } = await getSession(request);
  if (!isAdmin(session)) return { error: "Unauthorized" };

  const accountId = session.currentAccountId;
  if (!accountId) return { error: "Not authenticated" };

  const { lobbyId } = params;
  if (!lobbyId) return { error: "Lobby ID required" };

  const lobby = await getLobbyById(lobbyId);
  if (!lobby || lobby.accountId !== accountId) return { error: "Lobby not found" };

  const formData = await request.formData();
  const intent = formData.get("intent");

  try {
    switch (intent) {
      case "create_playlist": {
        const name = (formData.get("name") as string)?.trim();
        if (!name) return { error: "Playlist name is required" };
        const created = await createPlaylist({ lobbyId, name });
        // Send the admin straight into the new playlist's editor.
        throw redirect(`/lobby/${lobbyId}/playlists/${created.id}`);
      }
      default:
        return { error: "Invalid action" };
    }
  } catch (err) {
    if (err instanceof Response) throw err;
    return { error: err instanceof Error ? err.message : "Operation failed" };
  }
}

function formatTrackCount(n: number): string {
  return `${n} ${n === 1 ? "song" : "songs"}`;
}

function ChevronIcon() {
  return (
    <svg
      className="w-4 h-4 text-theme-muted"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

export default function LobbyPlaylistsIndex() {
  const { playlists, lobbyId, csrfToken } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    if (!actionData) return;
    if (actionData.error) toast.error(actionData.error);
  }, [actionData]);

  // Reset the inline creator after a successful submit.
  useEffect(() => {
    if (navigation.state === "idle" && isCreating && !actionData?.error) {
      setIsCreating(false);
      setNewName("");
    }
    // We only want this to reset when navigation transitions to idle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation.state]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Playlists</h1>
          <p className="text-sm text-theme-secondary mt-1">
            Manage this lobby's playlists. Click a playlist to edit its tracks.
          </p>
        </div>
        {!isCreating && (
          <button
            type="button"
            onClick={() => setIsCreating(true)}
            className="px-4 py-2 btn-primary rounded-lg transition cursor-pointer"
          >
            + New Playlist
          </button>
        )}
      </div>

      {isCreating && (
        <Form
          method="post"
          className="flex items-center gap-2 bg-theme-secondary rounded-xl border border-theme p-3"
        >
          <input type="hidden" name="_csrf" value={csrfToken} />
          <input type="hidden" name="intent" value="create_playlist" />
          <input
            type="text"
            name="name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Playlist name"
            autoFocus
            required
            className="flex-1 px-3 py-2 text-sm rounded-lg border border-theme bg-theme-tertiary text-theme-primary focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-red)]"
          />
          <button
            type="submit"
            disabled={isSubmitting || !newName.trim()}
            className="px-4 py-2 text-sm btn-primary rounded-lg disabled:opacity-50 cursor-pointer"
          >
            Create
          </button>
          <button
            type="button"
            onClick={() => {
              setIsCreating(false);
              setNewName("");
            }}
            className="px-4 py-2 text-sm rounded-lg border border-theme text-theme-secondary hover:bg-theme-tertiary cursor-pointer"
          >
            Cancel
          </button>
        </Form>
      )}

      {playlists.length === 0 && !isCreating ? (
        <div className="text-center py-12 bg-theme-secondary rounded-xl border border-theme">
          <p className="text-theme-secondary mb-4">
            No playlists yet. Create one to start adding tracks.
          </p>
          <button
            type="button"
            onClick={() => setIsCreating(true)}
            className="px-4 py-2 btn-primary rounded-lg transition cursor-pointer"
          >
            Create playlist
          </button>
        </div>
      ) : (
        <div
          className="bg-theme-secondary rounded-xl border border-theme overflow-hidden"
          aria-label="Playlists"
        >
          {playlists.map((p, idx) => (
            <Link
              key={p.id}
              to={`/lobby/${lobbyId}/playlists/${p.id}`}
              aria-label={`Open playlist ${p.name}`}
              className={`
                flex items-center justify-between gap-4 px-4 py-3 transition-colors cursor-pointer
                hover:bg-theme-tertiary hover:text-[var(--color-brand-red)]
                ${idx > 0 ? "border-t border-theme" : ""}
              `}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="font-semibold text-theme-primary truncate">
                  {p.name}
                </span>
                {p.isDefault && (
                  <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 shrink-0">
                    Default
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-sm text-theme-secondary">
                  {formatTrackCount(p.trackCount)}
                </span>
                <ChevronIcon />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
