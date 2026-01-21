import { Form, useLoaderData, useActionData, useNavigation } from "react-router";
import { useState } from "react";
import type { Route } from "./+types/_layout.playlist";
import { getSession, isAdmin } from "@secretlobby/auth";
import { getSiteContent, addTrack, removeTrack } from "~/lib/content.server";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";

export function meta() {
  return [{ title: "Playlist - Admin" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { session } = await getSession(request);
  if (!isAdmin(session)) {
    return { playlist: [] };
  }
  const content = await getSiteContent();
  return { playlist: content.playlist };
}

export async function action({ request }: Route.ActionArgs) {
  const { session } = await getSession(request);
  if (!isAdmin(session)) {
    return { error: "Unauthorized" };
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  try {
    switch (intent) {
      case "add-track": {
        const file = formData.get("file") as File | null;
        const title = formData.get("title") as string;
        const artist = formData.get("artist") as string;

        if (file && file.size > 0 && title) {
          const buffer = Buffer.from(await file.arrayBuffer());
          const filename = `${Date.now()}-${file.name}`;
          await writeFile(
            join(process.cwd(), "media", "audio", filename),
            buffer
          );
          await addTrack({ title, artist: artist || "Unknown", filename });
          return { success: "Track added" };
        }
        return { error: "Please provide a file and title" };
      }

      case "remove-track": {
        const id = formData.get("id") as string;
        const filename = formData.get("filename") as string;
        if (id) {
          await removeTrack(id);
          try {
            await unlink(join(process.cwd(), "media", "audio", filename));
          } catch {}
          return { success: "Track removed" };
        }
        break;
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
                className="w-full px-4 py-2 bg-theme-secondary rounded-lg border border-theme file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-[var(--color-primary)] file:text-[var(--color-primary-text)] file:cursor-pointer"
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2 btn-primary rounded-lg transition disabled:opacity-50"
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
                className="flex items-center justify-between p-3 bg-theme-tertiary rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-full btn-primary flex items-center justify-center text-sm">
                    {index + 1}
                  </span>
                  <div>
                    <p className="font-medium text-theme-primary">{track.title}</p>
                    <p className="text-sm text-theme-secondary">{track.artist}</p>
                  </div>
                </div>
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
            ))
          )}
        </div>
      </section>
    </div>
  );
}
