import { Form, useLoaderData, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/admin.media";
import { getSession } from "~/lib/session.server";
import { getSiteContent, updateSiteContent } from "~/lib/content.server";
import { writeFile, readdir } from "fs/promises";
import { join } from "path";

export function meta() {
  return [{ title: "Media Settings - Admin" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { session } = await getSession(request);
  if (!session.isAdmin) {
    return { content: null, backgrounds: [], banners: [], profiles: [] };
  }

  const content = await getSiteContent();

  let backgrounds: string[] = [];
  let banners: string[] = [];
  let profiles: string[] = [];

  try {
    backgrounds = await readdir(join(process.cwd(), "media", "backgrounds"));
    backgrounds = backgrounds.filter((f) => !f.startsWith("."));
  } catch {}

  try {
    banners = await readdir(join(process.cwd(), "media", "banners"));
    banners = banners.filter((f) => !f.startsWith("."));
  } catch {}

  try {
    profiles = await readdir(join(process.cwd(), "media", "profiles"));
    profiles = profiles.filter((f) => !f.startsWith("."));
  } catch {}

  return { content, backgrounds, banners, profiles };
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

      case "update-background-dark": {
        const file = formData.get("file") as File | null;
        if (file && file.size > 0) {
          const buffer = Buffer.from(await file.arrayBuffer());
          const filename = `bg-dark-${Date.now()}-${file.name}`;
          await writeFile(
            join(process.cwd(), "media", "backgrounds", filename),
            buffer
          );
          await updateSiteContent({ backgroundDark: filename });
        } else {
          const existing = formData.get("existing") as string;
          await updateSiteContent({ backgroundDark: existing || undefined });
        }
        return { success: "Dark mode background updated" };
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

      case "update-banner-dark": {
        const file = formData.get("file") as File | null;
        if (file && file.size > 0) {
          const buffer = Buffer.from(await file.arrayBuffer());
          const filename = `banner-dark-${Date.now()}-${file.name}`;
          await writeFile(
            join(process.cwd(), "media", "banners", filename),
            buffer
          );
          await updateSiteContent({ bannerDark: filename });
        } else {
          const existing = formData.get("existing") as string;
          await updateSiteContent({ bannerDark: existing || undefined });
        }
        return { success: "Dark mode banner updated" };
      }

      case "update-profile-pic": {
        const file = formData.get("file") as File | null;
        if (file && file.size > 0) {
          const buffer = Buffer.from(await file.arrayBuffer());
          const filename = `profile-${Date.now()}-${file.name}`;
          await writeFile(
            join(process.cwd(), "media", "profiles", filename),
            buffer
          );
          await updateSiteContent({ profilePic: filename });
        } else {
          const existing = formData.get("existing") as string;
          if (existing) {
            await updateSiteContent({ profilePic: existing });
          }
        }
        return { success: "Profile picture updated" };
      }

      case "update-profile-pic-dark": {
        const file = formData.get("file") as File | null;
        if (file && file.size > 0) {
          const buffer = Buffer.from(await file.arrayBuffer());
          const filename = `profile-dark-${Date.now()}-${file.name}`;
          await writeFile(
            join(process.cwd(), "media", "profiles", filename),
            buffer
          );
          await updateSiteContent({ profilePicDark: filename });
        } else {
          const existing = formData.get("existing") as string;
          await updateSiteContent({ profilePicDark: existing || undefined });
        }
        return { success: "Dark mode profile picture updated" };
      }
    }
  } catch {
    return { error: "Operation failed" };
  }

  return null;
}

export default function AdminMedia() {
  const { content, backgrounds, banners, profiles } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  if (!content) return null;

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

      {/* Background Section */}
      <section className="bg-theme-secondary rounded-xl p-6 border border-theme">
        <h2 className="text-lg font-semibold mb-4">Background Image</h2>
        <div className="mb-4">
          <p className="text-sm text-theme-secondary mb-2">
            Current: {content.background}
          </p>
          <div
            className="w-full h-32 rounded-lg bg-cover bg-center border border-theme"
            style={{ backgroundImage: `url('/api/media/background')` }}
          />
        </div>
        <Form method="post" encType="multipart/form-data" className="space-y-4">
          <input type="hidden" name="intent" value="update-background" />
          {backgrounds.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-2">Select existing:</label>
              <select
                name="existing"
                className="w-full px-4 py-2 bg-theme-tertiary rounded-lg border border-theme focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              >
                <option value="">-- Select --</option>
                {backgrounds.map((bg) => (
                  <option key={bg} value={bg}>{bg}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-2">Or upload new:</label>
            <input
              type="file"
              name="file"
              accept="image/*"
              className="w-full px-4 py-2 bg-theme-tertiary rounded-lg border border-theme file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-[var(--color-primary)] file:text-[var(--color-primary-text)] file:cursor-pointer"
            />
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2 btn-primary rounded-lg transition disabled:opacity-50"
          >
            Update Background
          </button>
        </Form>

        {/* Dark Mode Background */}
        <details className="mt-6">
          <summary className="cursor-pointer text-sm font-medium text-theme-secondary hover:text-theme-primary transition">
            Dark Mode Background (Optional)
          </summary>
          <div className="mt-4 pl-4 border-l-2 border-theme">
            <p className="text-xs text-theme-muted mb-3">
              Set a different background for dark mode. If not set, the default background will be used.
            </p>
            {content.backgroundDark && (
              <div className="mb-4">
                <p className="text-sm text-theme-secondary mb-2">
                  Current: {content.backgroundDark}
                </p>
                <div
                  className="w-full h-24 rounded-lg bg-cover bg-center border border-theme"
                  style={{ backgroundImage: `url('/api/media/background?theme=dark')` }}
                />
              </div>
            )}
            <Form method="post" encType="multipart/form-data" className="space-y-4">
              <input type="hidden" name="intent" value="update-background-dark" />
              {backgrounds.length > 0 && (
                <div>
                  <label className="block text-sm font-medium mb-2">Select existing:</label>
                  <select
                    name="existing"
                    className="w-full px-4 py-2 bg-theme-tertiary rounded-lg border border-theme focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  >
                    <option value="">-- None (use default) --</option>
                    {backgrounds.map((bg) => (
                      <option key={bg} value={bg}>{bg}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-2">Or upload new:</label>
                <input
                  type="file"
                  name="file"
                  accept="image/*"
                  className="w-full px-4 py-2 bg-theme-tertiary rounded-lg border border-theme file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-[var(--color-primary)] file:text-[var(--color-primary-text)] file:cursor-pointer"
                />
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2 btn-secondary rounded-lg transition disabled:opacity-50"
              >
                Update Dark Mode Background
              </button>
            </Form>
          </div>
        </details>
      </section>

      {/* Banner Section */}
      <section className="bg-theme-secondary rounded-xl p-6 border border-theme">
        <h2 className="text-lg font-semibold mb-4">Banner / Logo</h2>
        <div className="mb-4">
          <p className="text-sm text-theme-secondary mb-2">
            Current: {content.banner}
          </p>
          <img
            src="/api/media/banner"
            alt="Current banner"
            className="max-h-24 object-contain"
          />
        </div>
        <Form method="post" encType="multipart/form-data" className="space-y-4">
          <input type="hidden" name="intent" value="update-banner" />
          {banners.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-2">Select existing:</label>
              <select
                name="existing"
                className="w-full px-4 py-2 bg-theme-tertiary rounded-lg border border-theme focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              >
                <option value="">-- Select --</option>
                {banners.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-2">Or upload new:</label>
            <input
              type="file"
              name="file"
              accept="image/*"
              className="w-full px-4 py-2 bg-theme-tertiary rounded-lg border border-theme file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-[var(--color-primary)] file:text-[var(--color-primary-text)] file:cursor-pointer"
            />
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2 btn-primary rounded-lg transition disabled:opacity-50"
          >
            Update Banner
          </button>
        </Form>

        {/* Dark Mode Banner */}
        <details className="mt-6">
          <summary className="cursor-pointer text-sm font-medium text-theme-secondary hover:text-theme-primary transition">
            Dark Mode Banner (Optional)
          </summary>
          <div className="mt-4 pl-4 border-l-2 border-theme">
            <p className="text-xs text-theme-muted mb-3">
              Set a different banner for dark mode. If not set, the default banner will be used.
            </p>
            {content.bannerDark && (
              <div className="mb-4">
                <p className="text-sm text-theme-secondary mb-2">
                  Current: {content.bannerDark}
                </p>
                <img
                  src="/api/media/banner?theme=dark"
                  alt="Dark mode banner"
                  className="max-h-20 object-contain"
                />
              </div>
            )}
            <Form method="post" encType="multipart/form-data" className="space-y-4">
              <input type="hidden" name="intent" value="update-banner-dark" />
              {banners.length > 0 && (
                <div>
                  <label className="block text-sm font-medium mb-2">Select existing:</label>
                  <select
                    name="existing"
                    className="w-full px-4 py-2 bg-theme-tertiary rounded-lg border border-theme focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  >
                    <option value="">-- None (use default) --</option>
                    {banners.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-2">Or upload new:</label>
                <input
                  type="file"
                  name="file"
                  accept="image/*"
                  className="w-full px-4 py-2 bg-theme-tertiary rounded-lg border border-theme file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-[var(--color-primary)] file:text-[var(--color-primary-text)] file:cursor-pointer"
                />
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2 btn-secondary rounded-lg transition disabled:opacity-50"
              >
                Update Dark Mode Banner
              </button>
            </Form>
          </div>
        </details>
      </section>

      {/* Profile Picture Section */}
      <section className="bg-theme-secondary rounded-xl p-6 border border-theme">
        <h2 className="text-lg font-semibold mb-4">Profile Picture</h2>
        <p className="text-sm text-theme-secondary mb-4">
          This image appears in the sidebar next to the band description.
        </p>
        <div className="mb-4">
          <p className="text-sm text-theme-secondary mb-2">
            Current: {content.profilePic || "None set"}
          </p>
          <img
            src="/api/media/profile"
            alt="Current profile"
            className="w-24 h-24 rounded-full object-cover border-2 border-theme"
          />
        </div>
        <Form method="post" encType="multipart/form-data" className="space-y-4">
          <input type="hidden" name="intent" value="update-profile-pic" />
          {profiles.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-2">Select existing:</label>
              <select
                name="existing"
                className="w-full px-4 py-2 bg-theme-tertiary rounded-lg border border-theme focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              >
                <option value="">-- Select --</option>
                {profiles.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-2">Or upload new:</label>
            <input
              type="file"
              name="file"
              accept="image/*"
              className="w-full px-4 py-2 bg-theme-tertiary rounded-lg border border-theme file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-[var(--color-primary)] file:text-[var(--color-primary-text)] file:cursor-pointer"
            />
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2 btn-primary rounded-lg transition disabled:opacity-50"
          >
            Update Profile Picture
          </button>
        </Form>

        {/* Dark Mode Profile Picture */}
        <details className="mt-6">
          <summary className="cursor-pointer text-sm font-medium text-theme-secondary hover:text-theme-primary transition">
            Dark Mode Profile Picture (Optional)
          </summary>
          <div className="mt-4 pl-4 border-l-2 border-theme">
            <p className="text-xs text-theme-muted mb-3">
              Set a different profile picture for dark mode. If not set, the default will be used.
            </p>
            {content.profilePicDark && (
              <div className="mb-4">
                <p className="text-sm text-theme-secondary mb-2">
                  Current: {content.profilePicDark}
                </p>
                <img
                  src="/api/media/profile?theme=dark"
                  alt="Dark mode profile"
                  className="w-20 h-20 rounded-full object-cover border-2 border-theme"
                />
              </div>
            )}
            <Form method="post" encType="multipart/form-data" className="space-y-4">
              <input type="hidden" name="intent" value="update-profile-pic-dark" />
              {profiles.length > 0 && (
                <div>
                  <label className="block text-sm font-medium mb-2">Select existing:</label>
                  <select
                    name="existing"
                    className="w-full px-4 py-2 bg-theme-tertiary rounded-lg border border-theme focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  >
                    <option value="">-- None (use default) --</option>
                    {profiles.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-2">Or upload new:</label>
                <input
                  type="file"
                  name="file"
                  accept="image/*"
                  className="w-full px-4 py-2 bg-theme-tertiary rounded-lg border border-theme file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-[var(--color-primary)] file:text-[var(--color-primary-text)] file:cursor-pointer"
                />
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2 btn-secondary rounded-lg transition disabled:opacity-50"
              >
                Update Dark Mode Profile Picture
              </button>
            </Form>
          </div>
        </details>
      </section>
    </div>
  );
}
