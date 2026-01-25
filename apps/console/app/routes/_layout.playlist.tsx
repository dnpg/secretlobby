import { Form, useLoaderData, useActionData, useNavigation, redirect } from "react-router";
import { useState } from "react";
import type { Route } from "./+types/_layout.playlist";
import { getSession, isAdmin } from "@secretlobby/auth";
import { prisma } from "@secretlobby/db";
import { uploadFile, deleteFile } from "@secretlobby/storage";
import { cn } from "@secretlobby/ui";

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
    include: { tracks: { orderBy: { position: "asc" } } },
  });

  return { playlist: lobby?.tracks || [] };
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
      case "add-track": {
        const file = formData.get("file") as File | null;
        const title = formData.get("title") as string;
        const artist = formData.get("artist") as string;
        const durationStr = formData.get("duration") as string | null;
        const duration = durationStr ? parseInt(durationStr, 10) : null;

        if (file && file.size > 0 && title) {
          const buffer = Buffer.from(await file.arrayBuffer());
          const key = `${lobby.id}/audio/${Date.now()}-${file.name}`;
          await uploadFile(key, buffer, file.type || "audio/mpeg");

          // Get the next position
          const lastTrack = await prisma.track.findFirst({
            where: { lobbyId: lobby.id },
            orderBy: { position: "desc" },
          });

          await prisma.track.create({
            data: {
              lobbyId: lobby.id,
              title,
              artist: artist,
              filename: key,
              duration: duration && duration > 0 ? duration : null,
              position: (lastTrack?.position ?? -1) + 1,
            },
          });

          return { success: "Track added" };
        }
        return { error: "Please provide a file and title" };
      }

      case "remove-track": {
        const id = formData.get("id") as string;
        const filename = formData.get("filename") as string;
        if (id) {
          await prisma.track.delete({ where: { id } });
          try {
            await deleteFile(filename);
          } catch {}
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
    }
  } catch {
    return { error: "Operation failed" };
  }

  return null;
}

export default function AdminPlaylist() {
  const { playlist } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const [showAddTrack, setShowAddTrack] = useState(false);
  const [fileDuration, setFileDuration] = useState<number | null>(null);
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editArtist, setEditArtist] = useState("");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setFileDuration(null);
      return;
    }
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.addEventListener("loadedmetadata", () => {
      if (audio.duration && isFinite(audio.duration)) {
        setFileDuration(Math.round(audio.duration));
      }
      URL.revokeObjectURL(url);
    });
    audio.addEventListener("error", () => {
      setFileDuration(null);
      URL.revokeObjectURL(url);
    });
    audio.src = url;
  };

  const startEditing = (track: { id: string; title: string; artist: string }) => {
    setEditingTrackId(track.id);
    setEditTitle(track.title);
    setEditArtist(track.artist);
  };

  const cancelEditing = () => {
    setEditingTrackId(null);
    setEditTitle("");
    setEditArtist("");
  };

  return (
    <div className="space-y-8">
      {/* Status Messages */}
      {actionData?.success && (
        <div className="p-4 bg-green-500/20 border border-green-500/50 rounded-lg text-green-400">
          {actionData.success}
        </div>
      )}
      {actionData?.error && (
        <div className="p-4 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400">
          {actionData.error}
        </div>
      )}

      {/* Playlist Section */}
      <section className="bg-theme-secondary rounded-xl p-6 border border-theme">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Playlist</h2>
          <button
            onClick={() => setShowAddTrack(!showAddTrack)}
            className="px-4 py-2 btn-primary rounded-lg transition text-sm"
          >
            {showAddTrack ? "Cancel" : "+ Add Track"}
          </button>
        </div>

        {/* Add Track Form */}
        {showAddTrack && (
          <Form
            method="post"
            encType="multipart/form-data"
            className="mb-6 p-4 bg-theme-tertiary rounded-lg space-y-4"
          >
            <input type="hidden" name="intent" value="add-track" />
            {fileDuration && <input type="hidden" name="duration" value={fileDuration} />}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Title *</label>
                <input
                  type="text"
                  name="title"
                  required
                  className="w-full px-4 py-2 bg-theme-secondary rounded-lg border border-theme focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Artist</label>
                <input
                  type="text"
                  name="artist"
                  className="w-full px-4 py-2 bg-theme-secondary rounded-lg border border-theme focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">MP3 File *</label>
              <input
                type="file"
                name="file"
                accept="audio/mpeg,audio/mp3"
                required
                onChange={handleFileChange}
                className="w-full px-4 py-2 bg-theme-secondary rounded-lg border border-theme file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-[var(--color-primary)] file:text-[var(--color-primary-text)] file:cursor-pointer"
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className={cn("px-6 py-2 btn-primary rounded-lg transition disabled:opacity-50", {"cursor-pointer": !isSubmitting, "cursor-not-allowed": isSubmitting})}
            >
              Add Track
            </button>
          </Form>
        )}

        {/* Track List */}
        <div className="space-y-2">
          {playlist.length === 0 ? (
            <p className="text-theme-secondary text-center py-4">
              No tracks in playlist. Add some!
            </p>
          ) : (
            playlist.map((track, index) => (
              <div
                key={track.id}
                className="p-3 bg-theme-tertiary rounded-lg"
              >
                {editingTrackId === track.id ? (
                  <Form
                    method="post"
                    className="space-y-3"
                    onSubmit={() => cancelEditing()}
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
                          onChange={(e) => setEditTitle(e.target.value)}
                          required
                          placeholder="Title"
                          className="px-3 py-1.5 bg-theme-secondary rounded border border-theme focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] text-sm"
                        />
                        <input
                          type="text"
                          name="artist"
                          value={editArtist}
                          onChange={(e) => setEditArtist(e.target.value)}
                          placeholder="Artist"
                          className="px-3 py-1.5 bg-theme-secondary rounded border border-theme focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] text-sm"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={cancelEditing}
                        className="px-3 py-1.5 text-sm rounded border border-theme hover:bg-theme-secondary transition"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="px-3 py-1.5 text-sm btn-primary rounded transition disabled:opacity-50"
                      >
                        Save
                      </button>
                    </div>
                  </Form>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-full btn-primary flex items-center justify-center text-sm">
                        {index + 1}
                      </span>
                      <div>
                        <p className="font-medium text-theme-primary">{track.title}</p>
                        <p className="text-sm text-theme-secondary">{track.artist}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => startEditing(track)}
                        className="p-2 hover:bg-theme-secondary rounded-lg transition text-theme-secondary hover:text-theme-primary"
                        title="Edit track"
                      >
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                          />
                        </svg>
                      </button>
                      <Form method="post">
                        <input type="hidden" name="intent" value="remove-track" />
                        <input type="hidden" name="id" value={track.id} />
                        <input type="hidden" name="filename" value={track.filename} />
                        <button
                          type="submit"
                          className="p-2 hover:bg-red-600/20 rounded-lg transition text-red-400"
                          title="Remove track"
                        >
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
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
            ))
          )}
        </div>
      </section>
    </div>
  );
}
