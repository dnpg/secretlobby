import { Form, useLoaderData, useActionData, useNavigation, useSubmit, redirect } from "react-router";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { Route } from "./+types/_layout.lobby.playlist";
import { MediaPicker, type MediaItem } from "@secretlobby/ui";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `Playlist - ${data?.lobbyName || "Lobby"} - Admin` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { getSession, isAdmin } = await import("@secretlobby/auth");
  const { getLobbyByIdWithTracks } = await import("~/models/queries/lobby.server");

  const { session } = await getSession(request);
  if (!isAdmin(session)) {
    return { playlist: [], autoplayTrackId: null, lobbyName: "" };
  }

  const accountId = session.currentAccountId;
  if (!accountId) {
    throw redirect("/login");
  }

  const { lobbyId } = params;
  if (!lobbyId) {
    throw redirect("/lobbies");
  }

  const lobby = await getLobbyByIdWithTracks(lobbyId);

  if (!lobby || lobby.accountId !== accountId) {
    throw redirect("/lobbies");
  }

  const playlist = (lobby?.tracks || []).map((track) => ({
    id: track.id,
    title: track.title,
    artist: track.artist,
    filename: track.media?.key ?? "",
    duration: track.media?.duration ?? null,
    hlsReady: track.media?.hlsReady ?? false,
    position: track.position,
    mediaId: track.mediaId,
  }));

  const lobbySettings = (lobby?.settings as Record<string, unknown>) || {};
  const autoplayTrackId = (lobbySettings.autoplayTrackId as string) || null;

  return { playlist, autoplayTrackId, lobbyName: lobby.name };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { getSession, isAdmin } = await import("@secretlobby/auth");
  const { getLobbyById } = await import("~/models/queries/lobby.server");
  const { getMediaByIds, getMediaByIdAndAccountId } = await import("~/models/queries/media.server");
  const { getLastTrackByLobbyId, getTrackIdsByLobbyId } = await import("~/models/queries/track.server");
  const { createTrack, updateTrack, deleteTrack, reorderTracks, swapTrackPositions } = await import("~/models/mutations/track.server");
  const { mergeLobbySettings } = await import("~/models/mutations/lobby.server");

  const { session } = await getSession(request);
  if (!isAdmin(session)) {
    return { error: "Unauthorized" };
  }

  const accountId = session.currentAccountId;
  if (!accountId) {
    return { error: "Not authenticated" };
  }

  const { lobbyId } = params;
  if (!lobbyId) {
    return { error: "Lobby ID required" };
  }

  const lobby = await getLobbyById(lobbyId);
  if (!lobby || lobby.accountId !== accountId) {
    return { error: "Lobby not found" };
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  try {
    switch (intent) {
      case "add-tracks": {
        const mediaIds = (formData.get("mediaIds") as string || "").split(",").filter(Boolean);
        if (mediaIds.length === 0) {
          return { error: "No tracks selected" };
        }

        const mediaItems = await getMediaByIds(mediaIds, accountId);
        if (mediaItems.length === 0) {
          return { error: "No valid media found" };
        }

        const lastTrack = await getLastTrackByLobbyId(lobbyId);
        let nextPosition = (lastTrack?.position ?? -1) + 1;

        let addedCount = 0;
        for (const media of mediaItems) {
          const title = media.filename.replace(/\.[^/.]+$/, "");
          await createTrack({
            lobbyId,
            title,
            artist: null,
            filename: media.key,
            mediaId: media.id,
            position: nextPosition++,
          });
          addedCount++;
        }

        return { success: `${addedCount} track${addedCount !== 1 ? "s" : ""} added` };
      }

      case "remove-track": {
        const id = formData.get("id") as string;
        if (id) {
          await deleteTrack(id);
          return { success: "Track removed" };
        }
        break;
      }

      case "edit-track": {
        const id = formData.get("id") as string;
        const title = formData.get("title") as string;
        const artist = formData.get("artist") as string;
        if (id && title) {
          await updateTrack(id, { title, artist: artist || null });
          return { success: "Track updated" };
        }
        return { error: "Please provide a title" };
      }

      case "reorder-tracks": {
        const orderJson = formData.get("order") as string;
        const order: string[] = JSON.parse(orderJson);
        await reorderTracks(order);
        return { success: "Playlist reordered" };
      }

      case "set-autoplay-track": {
        const trackId = formData.get("trackId") as string;
        await mergeLobbySettings(lobbyId, { autoplayTrackId: trackId || null });
        return { success: "Autoplay track updated" };
      }

      case "move-track-up":
      case "move-track-down": {
        const id = formData.get("id") as string;
        const tracks = await getTrackIdsByLobbyId(lobbyId);
        const idx = tracks.findIndex((t) => t.id === id);
        const swapIdx = intent === "move-track-up" ? idx - 1 : idx + 1;
        if (idx < 0 || swapIdx < 0 || swapIdx >= tracks.length) break;
        await swapTrackPositions(tracks[idx].id, swapIdx, tracks[swapIdx].id, idx);
        return { success: "Track moved" };
      }

      case "change-track-file": {
        const id = formData.get("id") as string;
        const mediaId = formData.get("mediaId") as string;
        if (!id || !mediaId) {
          return { error: "Missing track or media" };
        }

        const media = await getMediaByIdAndAccountId(mediaId, accountId);
        if (!media) {
          return { error: "Media not found" };
        }

        await updateTrack(id, { mediaId: media.id, filename: media.key });
        return { success: "Track file updated" };
      }
    }
  } catch {
    return { error: "Operation failed" };
  }

  return null;
}

type PlaylistTrack = {
  id: string;
  title: string;
  artist: string | null;
  filename: string;
  duration: number | null;
  hlsReady: boolean;
  position: number;
  mediaId: string | null;
};

function formatDuration(seconds: number | null): string {
  if (!seconds) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function SortableTrackRow({
  track,
  index,
  isFirst,
  isLast,
  editingTrackId,
  editTitle,
  editArtist,
  isSubmitting,
  changingFileTrackId,
  isAutoplay,
  onStartEditing,
  onCancelEditing,
  onEditTitleChange,
  onEditArtistChange,
  onChangeFile,
  onMoveUp,
  onMoveDown,
  onSetAutoplay,
}: {
  track: PlaylistTrack;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  editingTrackId: string | null;
  editTitle: string;
  editArtist: string;
  isSubmitting: boolean;
  changingFileTrackId: string | null;
  isAutoplay: boolean;
  onStartEditing: (track: PlaylistTrack) => void;
  onCancelEditing: () => void;
  onEditTitleChange: (v: string) => void;
  onEditArtistChange: (v: string) => void;
  onChangeFile: (trackId: string, media: MediaItem) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onSetAutoplay: (id: string | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: track.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    position: "relative" as const,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`p-3 bg-theme-tertiary rounded-lg ${isDragging ? "shadow-lg opacity-90 scale-[1.02]" : ""}`}
    >
      {changingFileTrackId === track.id ? (
        <div className="flex items-center gap-3">
          <span className="w-8 h-8 rounded-full btn-primary flex items-center justify-center text-sm shrink-0">
            {index + 1}
          </span>
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 animate-spin text-theme-muted" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <div>
              <p className="font-medium text-theme-primary">{track.title}</p>
              <span className="text-xs text-theme-muted">Updating audio file...</span>
            </div>
          </div>
        </div>
      ) : editingTrackId === track.id ? (
        <Form method="post" className="space-y-3" onSubmit={() => onCancelEditing()}>
          <input type="hidden" name="intent" value="edit-track" />
          <input type="hidden" name="id" value={track.id} />
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-full btn-primary flex items-center justify-center text-sm shrink-0">
              {index + 1}
            </span>
            <div className="flex-1 grid grid-cols-2 gap-2">
              <input
                type="text"
                name="title"
                value={editTitle}
                onChange={(e) => onEditTitleChange(e.target.value)}
                required
                placeholder="Title"
                className="px-3 py-1.5 bg-theme-secondary rounded border border-theme focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] text-sm"
              />
              <input
                type="text"
                name="artist"
                value={editArtist}
                onChange={(e) => onEditArtistChange(e.target.value)}
                placeholder="Artist"
                className="px-3 py-1.5 bg-theme-secondary rounded border border-theme focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] text-sm"
              />
            </div>
          </div>
          <div className="flex items-center gap-3 pl-11">
            <span className="text-xs text-theme-muted truncate flex-1">
              {track.filename.split("/").pop()}
            </span>
            <MediaPicker accept={["audio/*"]} tabs={["library", "upload"]} onSelect={(media) => onChangeFile(track.id, media)}>
              <button type="button" className="px-3 py-1 text-xs btn-secondary rounded transition cursor-pointer whitespace-nowrap">
                Change File
              </button>
            </MediaPicker>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onCancelEditing} className="px-3 py-1.5 text-sm rounded border border-theme hover:bg-theme-secondary transition cursor-pointer">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting} className="px-3 py-1.5 text-sm btn-primary rounded transition disabled:opacity-50 cursor-pointer">
              Save
            </button>
          </div>
        </Form>
      ) : (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button type="button" className="p-1 text-theme-muted hover:text-theme-primary cursor-grab active:cursor-grabbing touch-none" title="Drag to reorder" {...attributes} {...listeners}>
              <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
              </svg>
            </button>
            <span className="w-8 h-8 rounded-full btn-primary flex items-center justify-center text-sm">{index + 1}</span>
            <div>
              <p className="font-medium text-theme-primary">{track.title}</p>
              <div className="flex items-center gap-2">
                {track.artist && <span className="text-sm text-theme-secondary">{track.artist}</span>}
                {track.hlsReady && track.duration
                  ? <span className="text-xs text-theme-muted">{formatDuration(track.duration)}</span>
                  : <span className="text-xs text-amber-400">Processing...</span>
                }
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => onSetAutoplay(isAutoplay ? null : track.id)} className={`p-2 rounded-lg transition cursor-pointer ${isAutoplay ? "bg-amber-500/20 text-amber-400" : "hover:bg-theme-secondary text-theme-muted hover:text-amber-400"}`} title={isAutoplay ? "Remove autoplay" : "Set as autoplay track"}>
              <svg className="w-4 h-4" fill={isAutoplay ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
            </button>
            <button type="button" disabled={isFirst} onClick={() => onMoveUp(track.id)} className="p-2 hover:bg-theme-secondary rounded-lg transition text-theme-muted hover:text-theme-primary disabled:opacity-30 disabled:pointer-events-none cursor-pointer" title="Move up">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
            </button>
            <button type="button" disabled={isLast} onClick={() => onMoveDown(track.id)} className="p-2 hover:bg-theme-secondary rounded-lg transition text-theme-muted hover:text-theme-primary disabled:opacity-30 disabled:pointer-events-none cursor-pointer" title="Move down">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            <button type="button" onClick={() => onStartEditing(track)} className="p-2 hover:bg-theme-secondary rounded-lg transition text-theme-secondary hover:text-theme-primary cursor-pointer" title="Edit track">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
            </button>
            <Form method="post">
              <input type="hidden" name="intent" value="remove-track" />
              <input type="hidden" name="id" value={track.id} />
              <button type="submit" className="p-2 hover:bg-red-600/20 rounded-lg transition text-red-400 cursor-pointer" title="Remove track">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
            </Form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LobbyPlaylistPage() {
  const { playlist, autoplayTrackId } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const submit = useSubmit();

  const [localPlaylist, setLocalPlaylist] = useState<PlaylistTrack[]>(playlist);
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editArtist, setEditArtist] = useState("");
  const [pendingTrackNames, setPendingTrackNames] = useState<string[]>([]);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => { setIsMounted(true); }, []);
  useEffect(() => { setLocalPlaylist(playlist); }, [playlist]);

  const navIntent = navigation.formData?.get("intent") as string | undefined;
  const isAddingTracks = navigation.state !== "idle" && navIntent === "add-tracks";
  const changingFileTrackId = navigation.state !== "idle" && navIntent === "change-track-file"
    ? (navigation.formData?.get("id") as string | undefined)
    : null;

  useEffect(() => {
    if (navigation.state === "idle") setPendingTrackNames([]);
  }, [navigation.state]);

  const lastActionRef = useRef<{ success?: string; error?: string } | null>(null);

  useEffect(() => {
    if (!actionData) {
      lastActionRef.current = null;
      return;
    }
    const isNewResult = actionData.success !== lastActionRef.current?.success || actionData.error !== lastActionRef.current?.error;
    if (isNewResult) {
      if (actionData.success) toast.success(actionData.success);
      if (actionData.error) toast.error(actionData.error);
      lastActionRef.current = { success: actionData.success, error: actionData.error };
    }
  }, [actionData]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = localPlaylist.findIndex((t) => t.id === active.id);
    const newIndex = localPlaylist.findIndex((t) => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(localPlaylist, oldIndex, newIndex);
    setLocalPlaylist(reordered);
    submit({ intent: "reorder-tracks", order: JSON.stringify(reordered.map((t) => t.id)) }, { method: "post" });
  }, [submit, localPlaylist]);

  const handleMoveUp = useCallback((id: string) => {
    const idx = localPlaylist.findIndex((t) => t.id === id);
    if (idx <= 0) return;
    const reordered = arrayMove(localPlaylist, idx, idx - 1);
    setLocalPlaylist(reordered);
    submit({ intent: "move-track-up", id }, { method: "post" });
  }, [submit, localPlaylist]);

  const handleMoveDown = useCallback((id: string) => {
    const idx = localPlaylist.findIndex((t) => t.id === id);
    if (idx < 0 || idx >= localPlaylist.length - 1) return;
    const reordered = arrayMove(localPlaylist, idx, idx + 1);
    setLocalPlaylist(reordered);
    submit({ intent: "move-track-down", id }, { method: "post" });
  }, [submit, localPlaylist]);

  const handleAddTracks = useCallback((mediaItems: MediaItem[]) => {
    const ids = mediaItems.map((m) => m.id);
    if (ids.length === 0) return;
    setPendingTrackNames(mediaItems.map((m) => m.filename.replace(/\.[^/.]+$/, "")));
    submit({ intent: "add-tracks", mediaIds: ids.join(",") }, { method: "post" });
  }, [submit]);

  const handleChangeFile = useCallback((trackId: string, media: MediaItem) => {
    submit({ intent: "change-track-file", id: trackId, mediaId: media.id }, { method: "post" });
  }, [submit]);

  const handleSetAutoplay = useCallback((trackId: string | null) => {
    submit({ intent: "set-autoplay-track", trackId: trackId || "" }, { method: "post" });
  }, [submit]);

  const startEditing = useCallback((track: PlaylistTrack) => {
    setEditingTrackId(track.id);
    setEditTitle(track.title);
    setEditArtist(track.artist || "");
  }, []);

  const cancelEditing = useCallback(() => {
    setEditingTrackId(null);
    setEditTitle("");
    setEditArtist("");
  }, []);

  const trackIds = useMemo(() => localPlaylist.map((t) => t.id), [localPlaylist]);

  return (
    <div className="space-y-8">
      <section className="bg-theme-secondary rounded-xl p-6 border border-theme">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Playlist</h2>
          {isAddingTracks ? (
            <span className="px-4 py-2 btn-primary rounded-lg text-sm opacity-70 inline-flex items-center gap-2">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Adding...
            </span>
          ) : (
            <MediaPicker accept={["audio/*"]} tabs={["library", "upload"]} multiSelect onSelect={() => {}} onSelectMultiple={handleAddTracks}>
              <button type="button" className="px-4 py-2 btn-primary rounded-lg transition text-sm cursor-pointer">+ Add Track</button>
            </MediaPicker>
          )}
        </div>

        <div className="space-y-2">
          {localPlaylist.length === 0 && !isAddingTracks ? (
            <p className="text-theme-secondary text-center py-4">No tracks in playlist. Add some!</p>
          ) : isMounted ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={handleDragEnd}>
              <SortableContext items={trackIds} strategy={verticalListSortingStrategy}>
                {localPlaylist.map((track, index) => (
                  <SortableTrackRow
                    key={track.id}
                    track={track}
                    index={index}
                    isFirst={index === 0}
                    isLast={index === localPlaylist.length - 1}
                    editingTrackId={editingTrackId}
                    editTitle={editTitle}
                    editArtist={editArtist}
                    isSubmitting={isSubmitting}
                    changingFileTrackId={changingFileTrackId ?? null}
                    isAutoplay={track.id === autoplayTrackId}
                    onStartEditing={startEditing}
                    onCancelEditing={cancelEditing}
                    onEditTitleChange={setEditTitle}
                    onEditArtistChange={setEditArtist}
                    onChangeFile={handleChangeFile}
                    onMoveUp={handleMoveUp}
                    onMoveDown={handleMoveDown}
                    onSetAutoplay={handleSetAutoplay}
                  />
                ))}
              </SortableContext>
            </DndContext>
          ) : (
            localPlaylist.map((track, index) => (
              <div key={track.id} className="p-3 bg-theme-tertiary rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="p-1 text-theme-muted">
                    <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
                    </svg>
                  </div>
                  <span className="w-8 h-8 rounded-full btn-primary flex items-center justify-center text-sm">{index + 1}</span>
                  <div>
                    <p className="font-medium text-theme-primary">{track.title}</p>
                    <div className="flex items-center gap-2">
                      {track.artist && <span className="text-sm text-theme-secondary">{track.artist}</span>}
                      {track.hlsReady && track.duration
                        ? <span className="text-xs text-theme-muted">{formatDuration(track.duration)}</span>
                        : <span className="text-xs text-amber-400">Processing...</span>
                      }
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
          {isAddingTracks && pendingTrackNames.map((name, i) => (
            <div key={`pending-${i}`} className="p-3 bg-theme-tertiary rounded-lg animate-pulse">
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-full bg-theme-secondary flex items-center justify-center text-sm shrink-0">
                  <svg className="w-4 h-4 animate-spin text-theme-muted" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                </span>
                <div>
                  <p className="font-medium text-theme-primary">{name}</p>
                  <span className="text-xs text-theme-muted">Processing audio...</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
