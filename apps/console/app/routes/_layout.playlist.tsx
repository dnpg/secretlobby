import { Form, useLoaderData, useActionData, useNavigation, useSubmit, redirect } from "react-router";
import { useState, useEffect, useCallback } from "react";
import type { Route } from "./+types/_layout.playlist";
import { getSession, isAdmin } from "@secretlobby/auth";
import { prisma } from "@secretlobby/db";
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

export function meta() {
  return [{ title: "Playlist - Admin" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { session } = await getSession(request);
  if (!isAdmin(session)) {
    return { playlist: [] };
  }

  const accountId = session.currentAccountId;
  if (!accountId) {
    throw redirect("/login");
  }

  const lobby = await prisma.lobby.findFirst({
    where: { accountId, isDefault: true },
    include: {
      tracks: {
        orderBy: { position: "asc" },
        include: { media: true },
      },
    },
  });

  const playlist = (lobby?.tracks || []).map((track) => ({
    id: track.id,
    title: track.title,
    artist: track.artist,
    filename: track.media?.key ?? track.filename,
    duration: track.media?.duration ?? track.duration,
    hlsReady: track.media?.hlsReady ?? track.hlsReady,
    position: track.position,
    mediaId: track.mediaId,
  }));

  return { playlist };
}

export async function action({ request }: Route.ActionArgs) {
  const { session } = await getSession(request);
  if (!isAdmin(session)) {
    return { error: "Unauthorized" };
  }

  const accountId = session.currentAccountId;
  if (!accountId) {
    return { error: "Not authenticated" };
  }

  const lobby = await prisma.lobby.findFirst({
    where: { accountId, isDefault: true },
  });

  if (!lobby) {
    return { error: "No lobby found" };
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  try {
    switch (intent) {
      case "add-tracks": {
        // Receives comma-separated media IDs
        const mediaIds = (formData.get("mediaIds") as string || "").split(",").filter(Boolean);
        if (mediaIds.length === 0) {
          return { error: "No tracks selected" };
        }

        const mediaItems = await prisma.media.findMany({
          where: { id: { in: mediaIds }, accountId },
        });

        if (mediaItems.length === 0) {
          return { error: "No valid media found" };
        }

        const lastTrack = await prisma.track.findFirst({
          where: { lobbyId: lobby.id },
          orderBy: { position: "desc" },
        });
        let nextPosition = (lastTrack?.position ?? -1) + 1;

        let addedCount = 0;
        for (const media of mediaItems) {
          // Strip file extension for track title
          const title = media.filename.replace(/\.[^/.]+$/, "");

          await prisma.track.create({
            data: {
              lobbyId: lobby.id,
              title,
              artist: null,
              filename: media.key,
              mediaId: media.id,
              position: nextPosition++,
            },
          });

          addedCount++;
        }

        return { success: `${addedCount} track${addedCount !== 1 ? "s" : ""} added` };
      }

      case "remove-track": {
        const id = formData.get("id") as string;
        if (id) {
          await prisma.track.delete({ where: { id } });
          return { success: "Track removed" };
        }
        break;
      }

      case "edit-track": {
        const id = formData.get("id") as string;
        const title = formData.get("title") as string;
        const artist = formData.get("artist") as string;
        if (id && title) {
          await prisma.track.update({
            where: { id },
            data: {
              title,
              artist: artist || null,
            },
          });
          return { success: "Track updated" };
        }
        return { error: "Please provide a title" };
      }

      case "reorder-tracks": {
        const orderJson = formData.get("order") as string;
        const order: string[] = JSON.parse(orderJson);
        await prisma.$transaction(
          order.map((id, idx) =>
            prisma.track.update({ where: { id }, data: { position: idx } })
          )
        );
        return { success: "Playlist reordered" };
      }

      case "move-track-up":
      case "move-track-down": {
        const id = formData.get("id") as string;
        const tracks = await prisma.track.findMany({
          where: { lobbyId: lobby.id },
          orderBy: { position: "asc" },
          select: { id: true },
        });
        const idx = tracks.findIndex((t) => t.id === id);
        const swapIdx = intent === "move-track-up" ? idx - 1 : idx + 1;
        if (idx < 0 || swapIdx < 0 || swapIdx >= tracks.length) break;
        await prisma.$transaction([
          prisma.track.update({ where: { id: tracks[idx].id }, data: { position: swapIdx } }),
          prisma.track.update({ where: { id: tracks[swapIdx].id }, data: { position: idx } }),
        ]);
        return { success: "Track moved" };
      }

      case "change-track-file": {
        const id = formData.get("id") as string;
        const mediaId = formData.get("mediaId") as string;
        if (!id || !mediaId) {
          return { error: "Missing track or media" };
        }

        const media = await prisma.media.findFirst({
          where: { id: mediaId, accountId },
        });
        if (!media) {
          return { error: "Media not found" };
        }

        // Just swap the media reference — HLS lives with the Media, not the Track
        await prisma.track.update({
          where: { id },
          data: {
            mediaId: media.id,
            filename: media.key,
          },
        });

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

// ---------------------------------------------------------------------------
// SortableTrackRow — wraps a single track with useSortable
// ---------------------------------------------------------------------------
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
  onStartEditing,
  onCancelEditing,
  onEditTitleChange,
  onEditArtistChange,
  onChangeFile,
  onMoveUp,
  onMoveDown,
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
  onStartEditing: (track: PlaylistTrack) => void;
  onCancelEditing: () => void;
  onEditTitleChange: (v: string) => void;
  onEditArtistChange: (v: string) => void;
  onChangeFile: (trackId: string, media: MediaItem) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: track.id });

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
        <Form
          method="post"
          className="space-y-3"
          onSubmit={() => onCancelEditing()}
        >
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

          {/* Change audio file */}
          <div className="flex items-center gap-3 pl-11">
            <span className="text-xs text-theme-muted truncate flex-1">
              {track.filename.split("/").pop()}
            </span>
            <MediaPicker accept={["audio/*"]} tabs={["library", "upload"]} onSelect={(media) => onChangeFile(track.id, media)}>
              <button
                type="button"
                className="px-3 py-1 text-xs btn-secondary rounded transition cursor-pointer whitespace-nowrap"
              >
                Change File
              </button>
            </MediaPicker>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancelEditing}
              className="px-3 py-1.5 text-sm rounded border border-theme hover:bg-theme-secondary transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-3 py-1.5 text-sm btn-primary rounded transition disabled:opacity-50 cursor-pointer"
            >
              Save
            </button>
          </div>
        </Form>
      ) : (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Drag handle */}
            <button
              type="button"
              className="p-1 text-theme-muted hover:text-theme-primary cursor-grab active:cursor-grabbing touch-none"
              title="Drag to reorder"
              {...attributes}
              {...listeners}
            >
              <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
              </svg>
            </button>
            <span className="w-8 h-8 rounded-full btn-primary flex items-center justify-center text-sm">
              {index + 1}
            </span>
            <div>
              <p className="font-medium text-theme-primary">{track.title}</p>
              <div className="flex items-center gap-2">
                {track.artist && (
                  <span className="text-sm text-theme-secondary">{track.artist}</span>
                )}
                {track.hlsReady && track.duration
                  ? <span className="text-xs text-theme-muted">{formatDuration(track.duration)}</span>
                  : <span className="text-xs text-amber-400">Processing...</span>
                }
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {/* Move up */}
            <button
              type="button"
              disabled={isFirst}
              onClick={() => onMoveUp(track.id)}
              className="p-2 hover:bg-theme-secondary rounded-lg transition text-theme-muted hover:text-theme-primary disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
              title="Move up"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            </button>
            {/* Move down */}
            <button
              type="button"
              disabled={isLast}
              onClick={() => onMoveDown(track.id)}
              className="p-2 hover:bg-theme-secondary rounded-lg transition text-theme-muted hover:text-theme-primary disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
              title="Move down"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {/* Edit */}
            <button
              type="button"
              onClick={() => onStartEditing(track)}
              className="p-2 hover:bg-theme-secondary rounded-lg transition text-theme-secondary hover:text-theme-primary cursor-pointer"
              title="Edit track"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
            </button>
            {/* Delete */}
            <Form method="post">
              <input type="hidden" name="intent" value="remove-track" />
              <input type="hidden" name="id" value={track.id} />
              <button
                type="submit"
                className="p-2 hover:bg-red-600/20 rounded-lg transition text-red-400 cursor-pointer"
                title="Remove track"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            </Form>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function AdminPlaylist() {
  const { playlist } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const submit = useSubmit();

  const [localPlaylist, setLocalPlaylist] = useState<PlaylistTrack[]>(playlist);
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editArtist, setEditArtist] = useState("");
  const [pendingTrackNames, setPendingTrackNames] = useState<string[]>([]);

  // Sync local state when loader data changes (after navigation completes)
  useEffect(() => {
    setLocalPlaylist(playlist);
  }, [playlist]);

  const navIntent = navigation.formData?.get("intent") as string | undefined;
  const isAddingTracks = navigation.state !== "idle" && navIntent === "add-tracks";
  const changingFileTrackId = navigation.state !== "idle" && navIntent === "change-track-file"
    ? (navigation.formData?.get("id") as string | undefined)
    : null;

  useEffect(() => {
    if (navigation.state === "idle") {
      setPendingTrackNames([]);
    }
  }, [navigation.state]);

  useEffect(() => {
    if (actionData?.success) {
      toast.success(actionData.success);
    }
    if (actionData?.error) {
      toast.error(actionData.error);
    }
  }, [actionData]);

  // DnD Kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      setLocalPlaylist((prev) => {
        const oldIndex = prev.findIndex((t) => t.id === active.id);
        const newIndex = prev.findIndex((t) => t.id === over.id);
        if (oldIndex === -1 || newIndex === -1) return prev;
        const reordered = arrayMove(prev, oldIndex, newIndex);

        // Persist new order
        submit(
          { intent: "reorder-tracks", order: JSON.stringify(reordered.map((t) => t.id)) },
          { method: "post" },
        );

        return reordered;
      });
    },
    [submit],
  );

  const handleMoveUp = useCallback(
    (id: string) => {
      setLocalPlaylist((prev) => {
        const idx = prev.findIndex((t) => t.id === id);
        if (idx <= 0) return prev;
        const reordered = arrayMove(prev, idx, idx - 1);
        submit(
          { intent: "move-track-up", id },
          { method: "post" },
        );
        return reordered;
      });
    },
    [submit],
  );

  const handleMoveDown = useCallback(
    (id: string) => {
      setLocalPlaylist((prev) => {
        const idx = prev.findIndex((t) => t.id === id);
        if (idx < 0 || idx >= prev.length - 1) return prev;
        const reordered = arrayMove(prev, idx, idx + 1);
        submit(
          { intent: "move-track-down", id },
          { method: "post" },
        );
        return reordered;
      });
    },
    [submit],
  );

  const handleAddTracks = (mediaItems: MediaItem[]) => {
    const ids = mediaItems.map((m) => m.id);
    if (ids.length === 0) return;
    setPendingTrackNames(mediaItems.map((m) => m.filename.replace(/\.[^/.]+$/, "")));
    submit(
      { intent: "add-tracks", mediaIds: ids.join(",") },
      { method: "post" },
    );
  };

  const handleChangeFile = (trackId: string, media: MediaItem) => {
    submit(
      { intent: "change-track-file", id: trackId, mediaId: media.id },
      { method: "post" },
    );
  };

  const startEditing = (track: PlaylistTrack) => {
    setEditingTrackId(track.id);
    setEditTitle(track.title);
    setEditArtist(track.artist || "");
  };

  const cancelEditing = () => {
    setEditingTrackId(null);
    setEditTitle("");
    setEditArtist("");
  };

  const trackIds = localPlaylist.map((t) => t.id);

  return (
    <div className="space-y-8">
      {/* Playlist Section */}
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
              <button
                type="button"
                className="px-4 py-2 btn-primary rounded-lg transition text-sm cursor-pointer"
              >
                + Add Track
              </button>
            </MediaPicker>
          )}
        </div>

        {/* Track List */}
        <div className="space-y-2">
          {localPlaylist.length === 0 && !isAddingTracks ? (
            <p className="text-theme-secondary text-center py-4">
              No tracks in playlist. Add some!
            </p>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis]}
              onDragEnd={handleDragEnd}
            >
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
                    onStartEditing={startEditing}
                    onCancelEditing={cancelEditing}
                    onEditTitleChange={setEditTitle}
                    onEditArtistChange={setEditArtist}
                    onChangeFile={handleChangeFile}
                    onMoveUp={handleMoveUp}
                    onMoveDown={handleMoveDown}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
          {isAddingTracks && pendingTrackNames.map((name, i) => (
            <div
              key={`pending-${i}`}
              className="p-3 bg-theme-tertiary rounded-lg animate-pulse"
            >
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
