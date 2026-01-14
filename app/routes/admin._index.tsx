import {
  Form,
  redirect,
  useLoaderData,
  useActionData,
  useNavigation,
  Link,
} from "react-router";
import { useState } from "react";
import type { Route } from "./+types/admin._index";
import { getSession } from "~/lib/session.server";
import {
  getSiteContent,
  updateSiteContent,
  addTrack,
  removeTrack,
  updateSitePassword,
} from "~/lib/content.server";
import { writeFile, unlink, readdir } from "fs/promises";
import { join } from "path";

export function meta() {
  return [{ title: "Admin Panel" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { session } = await getSession(request);
  if (!session.isAdmin) {
    throw redirect("/admin/login");
  }

  const content = await getSiteContent();

  // Get available files in media folders
  let backgrounds: string[] = [];
  let banners: string[] = [];
  let audioFiles: string[] = [];

  try {
    backgrounds = await readdir(join(process.cwd(), "media", "backgrounds"));
    backgrounds = backgrounds.filter((f) => !f.startsWith("."));
  } catch {}

  try {
    banners = await readdir(join(process.cwd(), "media", "banners"));
    banners = banners.filter((f) => !f.startsWith("."));
  } catch {}

  try {
    audioFiles = await readdir(join(process.cwd(), "media", "audio"));
    audioFiles = audioFiles.filter((f) => !f.startsWith("."));
  } catch {}

  return { content, backgrounds, banners, audioFiles };
}

export async function action({ request }: Route.ActionArgs) {
  const { session } = await getSession(request);
  if (!session.isAdmin) {
    return { error: "Unauthorized" };
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  try {
    switch (intent) {
      case "update-background": {
        const file = formData.get("file") as File | null;
        if (file && file.size > 0) {
          const buffer = Buffer.from(await file.arrayBuffer());
          const filename = `bg-${Date.now()}-${file.name}`;
          await writeFile(
            join(process.cwd(), "media", "backgrounds", filename),
            buffer
          );
          await updateSiteContent({ background: filename });
        } else {
          const existing = formData.get("existing") as string;
          if (existing) {
            await updateSiteContent({ background: existing });
          }
        }
        return { success: "Background updated" };
      }

      case "update-banner": {
        const file = formData.get("file") as File | null;
        if (file && file.size > 0) {
          const buffer = Buffer.from(await file.arrayBuffer());
          const filename = `banner-${Date.now()}-${file.name}`;
          await writeFile(
            join(process.cwd(), "media", "banners", filename),
            buffer
          );
          await updateSiteContent({ banner: filename });
        } else {
          const existing = formData.get("existing") as string;
          if (existing) {
            await updateSiteContent({ banner: existing });
          }
        }
        return { success: "Banner updated" };
      }

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
          // Optionally delete the file
          try {
            await unlink(join(process.cwd(), "media", "audio", filename));
          } catch {}
          return { success: "Track removed" };
        }
        break;
      }

      case "update-password": {
        const newPassword = formData.get("newPassword") as string;
        const confirmPassword = formData.get("confirmPassword") as string;

        if (!newPassword || newPassword.length < 4) {
          return { error: "Password must be at least 4 characters" };
        }
        if (newPassword !== confirmPassword) {
          return { error: "Passwords do not match" };
        }

        await updateSitePassword(newPassword);
        return { success: "Site password updated successfully" };
      }
    }
  } catch (error) {
    return { error: "Operation failed" };
  }

  return null;
}

export default function AdminPanel() {
  const { content, backgrounds, banners, audioFiles } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [showAddTrack, setShowAddTrack] = useState(false);

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="bg-gray-800 border-b border-gray-700">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold">Admin Panel</h1>
          <div className="flex gap-4">
            <Link
              to="/player"
              className="px-4 py-2 text-sm bg-purple-600 hover:bg-purple-700 rounded-lg transition"
            >
              View Player
            </Link>
            <Form method="post" action="/logout">
              <button
                type="submit"
                className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 rounded-lg transition"
              >
                Logout
              </button>
            </Form>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Status Messages */}
        {actionData?.success && (
          <div className="mb-6 p-4 bg-green-500/20 border border-green-500/50 rounded-lg text-green-400">
            {actionData.success}
          </div>
        )}
        {actionData?.error && (
          <div className="mb-6 p-4 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400">
            {actionData.error}
          </div>
        )}

        <div className="grid gap-8">
          {/* Site Password Section */}
          <section className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4">Site Password</h2>
            <p className="text-sm text-gray-400 mb-4">
              Change the password that users need to enter to access the player.
            </p>
            <Form method="post" className="space-y-4">
              <input type="hidden" name="intent" value="update-password" />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    New Password
                  </label>
                  <input
                    type="password"
                    name="newPassword"
                    required
                    minLength={4}
                    className="w-full px-4 py-2 bg-gray-700 rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="Enter new password"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    name="confirmPassword"
                    required
                    minLength={4}
                    className="w-full px-4 py-2 bg-gray-700 rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="Confirm new password"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2 bg-orange-600 hover:bg-orange-700 rounded-lg transition disabled:opacity-50"
              >
                Update Password
              </button>
            </Form>
          </section>

          {/* Background Section */}
          <section className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4">Background Image</h2>
            <div className="mb-4">
              <p className="text-sm text-gray-400 mb-2">
                Current: {content.background}
              </p>
              <div
                className="w-full h-32 rounded-lg bg-cover bg-center border border-gray-700"
                style={{
                  backgroundImage: `url('/api/media/background')`,
                }}
              />
            </div>
            <Form method="post" encType="multipart/form-data" className="space-y-4">
              <input type="hidden" name="intent" value="update-background" />
              {backgrounds.length > 0 && (
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Select existing:
                  </label>
                  <select
                    name="existing"
                    className="w-full px-4 py-2 bg-gray-700 rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="">-- Select --</option>
                    {backgrounds.map((bg) => (
                      <option key={bg} value={bg}>
                        {bg}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Or upload new:
                </label>
                <input
                  type="file"
                  name="file"
                  accept="image/*"
                  className="w-full px-4 py-2 bg-gray-700 rounded-lg border border-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-purple-600 file:text-white file:cursor-pointer"
                />
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition disabled:opacity-50"
              >
                Update Background
              </button>
            </Form>
          </section>

          {/* Banner Section */}
          <section className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4">Banner / Logo</h2>
            <div className="mb-4">
              <p className="text-sm text-gray-400 mb-2">
                Current: {content.banner}
              </p>
              <img
                src="/api/media/banner"
                alt="Current banner"
                className="h-12 object-contain"
              />
            </div>
            <Form method="post" encType="multipart/form-data" className="space-y-4">
              <input type="hidden" name="intent" value="update-banner" />
              {banners.length > 0 && (
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Select existing:
                  </label>
                  <select
                    name="existing"
                    className="w-full px-4 py-2 bg-gray-700 rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="">-- Select --</option>
                    {banners.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Or upload new:
                </label>
                <input
                  type="file"
                  name="file"
                  accept="image/*"
                  className="w-full px-4 py-2 bg-gray-700 rounded-lg border border-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-purple-600 file:text-white file:cursor-pointer"
                />
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition disabled:opacity-50"
              >
                Update Banner
              </button>
            </Form>
          </section>

          {/* Playlist Section */}
          <section className="bg-gray-800 rounded-xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Playlist</h2>
              <button
                onClick={() => setShowAddTrack(!showAddTrack)}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition text-sm"
              >
                {showAddTrack ? "Cancel" : "+ Add Track"}
              </button>
            </div>

            {/* Add Track Form */}
            {showAddTrack && (
              <Form
                method="post"
                encType="multipart/form-data"
                className="mb-6 p-4 bg-gray-700/50 rounded-lg space-y-4"
              >
                <input type="hidden" name="intent" value="add-track" />
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Title *
                    </label>
                    <input
                      type="text"
                      name="title"
                      required
                      className="w-full px-4 py-2 bg-gray-700 rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Artist
                    </label>
                    <input
                      type="text"
                      name="artist"
                      className="w-full px-4 py-2 bg-gray-700 rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    MP3 File *
                  </label>
                  <input
                    type="file"
                    name="file"
                    accept="audio/mpeg,audio/mp3"
                    required
                    className="w-full px-4 py-2 bg-gray-700 rounded-lg border border-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-green-600 file:text-white file:cursor-pointer"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition disabled:opacity-50"
                >
                  Add Track
                </button>
              </Form>
            )}

            {/* Track List */}
            <div className="space-y-2">
              {content.playlist.length === 0 ? (
                <p className="text-gray-400 text-center py-4">
                  No tracks in playlist. Add some!
                </p>
              ) : (
                content.playlist.map((track, index) => (
                  <div
                    key={track.id}
                    className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-sm">
                        {index + 1}
                      </span>
                      <div>
                        <p className="font-medium">{track.title}</p>
                        <p className="text-sm text-gray-400">{track.artist}</p>
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
      </main>
    </div>
  );
}
