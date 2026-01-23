import { Form, useLoaderData, useActionData, useNavigation, redirect } from "react-router";
import type { Route } from "./+types/_layout.media";
import { getSession, isAdmin } from "@secretlobby/auth";
import { prisma } from "@secretlobby/db";
import { uploadFile, getPublicUrl, listFiles } from "@secretlobby/storage";

export function meta() {
  return [{ title: "Media Settings - Admin" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { session } = await getSession(request);
  if (!isAdmin(session)) {
    return { lobby: null, backgrounds: [], banners: [], profiles: [] };
  }

  const accountId = session.currentAccountId;
  if (!accountId) {
    throw redirect("/login");
  }

  const lobby = await prisma.lobby.findFirst({
    where: { accountId, isDefault: true },
  });

  if (!lobby) {
    return { lobby: null, backgrounds: [], banners: [], profiles: [] };
  }

  const settings = (lobby.settings || {}) as Record<string, string>;

  // List existing files from R2 by prefix
  const [backgrounds, banners, profiles] = await Promise.all([
    listFiles(`${lobby.id}/backgrounds/`),
    listFiles(`${lobby.id}/banners/`),
    listFiles(`${lobby.id}/profiles/`),
  ]);

  return {
    lobby: {
      id: lobby.id,
      backgroundImage: lobby.backgroundImage,
      backgroundImageUrl: lobby.backgroundImage ? getPublicUrl(lobby.backgroundImage) : null,
      backgroundImageDark: settings.backgroundImageDark || null,
      backgroundImageDarkUrl: settings.backgroundImageDark ? getPublicUrl(settings.backgroundImageDark) : null,
      bannerImage: lobby.bannerImage,
      bannerImageUrl: lobby.bannerImage ? getPublicUrl(lobby.bannerImage) : null,
      bannerImageDark: settings.bannerImageDark || null,
      bannerImageDarkUrl: settings.bannerImageDark ? getPublicUrl(settings.bannerImageDark) : null,
      profileImage: lobby.profileImage,
      profileImageUrl: lobby.profileImage ? getPublicUrl(lobby.profileImage) : null,
      profileImageDark: settings.profileImageDark || null,
      profileImageDarkUrl: settings.profileImageDark ? getPublicUrl(settings.profileImageDark) : null,
    },
    backgrounds: backgrounds.map((key) => ({ key, url: getPublicUrl(key), name: key.split("/").pop() || key })),
    banners: banners.map((key) => ({ key, url: getPublicUrl(key), name: key.split("/").pop() || key })),
    profiles: profiles.map((key) => ({ key, url: getPublicUrl(key), name: key.split("/").pop() || key })),
  };
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
      case "update-background": {
        const file = formData.get("file") as File | null;
        let key: string | undefined;
        if (file && file.size > 0) {
          const buffer = Buffer.from(await file.arrayBuffer());
          key = `${lobby.id}/backgrounds/bg-${Date.now()}-${file.name}`;
          await uploadFile(key, buffer, file.type || "image/jpeg");
        } else {
          key = (formData.get("existing") as string) || undefined;
        }
        if (key) {
          await prisma.lobby.update({
            where: { id: lobby.id },
            data: { backgroundImage: key },
          });
        }
        return { success: "Background updated" };
      }

      case "update-background-dark": {
        const file = formData.get("file") as File | null;
        let key: string | undefined;
        if (file && file.size > 0) {
          const buffer = Buffer.from(await file.arrayBuffer());
          key = `${lobby.id}/backgrounds/bg-dark-${Date.now()}-${file.name}`;
          await uploadFile(key, buffer, file.type || "image/jpeg");
        } else {
          key = (formData.get("existing") as string) || undefined;
        }
        const settings = (lobby.settings || {}) as Record<string, unknown>;
        await prisma.lobby.update({
          where: { id: lobby.id },
          data: {
            settings: { ...settings, backgroundImageDark: key || null },
          },
        });
        return { success: "Dark mode background updated" };
      }

      case "update-banner": {
        const file = formData.get("file") as File | null;
        let key: string | undefined;
        if (file && file.size > 0) {
          const buffer = Buffer.from(await file.arrayBuffer());
          key = `${lobby.id}/banners/banner-${Date.now()}-${file.name}`;
          await uploadFile(key, buffer, file.type || "image/png");
        } else {
          key = (formData.get("existing") as string) || undefined;
        }
        if (key) {
          await prisma.lobby.update({
            where: { id: lobby.id },
            data: { bannerImage: key },
          });
        }
        return { success: "Banner updated" };
      }

      case "update-banner-dark": {
        const file = formData.get("file") as File | null;
        let key: string | undefined;
        if (file && file.size > 0) {
          const buffer = Buffer.from(await file.arrayBuffer());
          key = `${lobby.id}/banners/banner-dark-${Date.now()}-${file.name}`;
          await uploadFile(key, buffer, file.type || "image/png");
        } else {
          key = (formData.get("existing") as string) || undefined;
        }
        const settings = (lobby.settings || {}) as Record<string, unknown>;
        await prisma.lobby.update({
          where: { id: lobby.id },
          data: {
            settings: { ...settings, bannerImageDark: key || null },
          },
        });
        return { success: "Dark mode banner updated" };
      }

      case "update-profile-pic": {
        const file = formData.get("file") as File | null;
        let key: string | undefined;
        if (file && file.size > 0) {
          const buffer = Buffer.from(await file.arrayBuffer());
          key = `${lobby.id}/profiles/profile-${Date.now()}-${file.name}`;
          await uploadFile(key, buffer, file.type || "image/jpeg");
        } else {
          key = (formData.get("existing") as string) || undefined;
        }
        if (key) {
          await prisma.lobby.update({
            where: { id: lobby.id },
            data: { profileImage: key },
          });
        }
        return { success: "Profile picture updated" };
      }

      case "update-profile-pic-dark": {
        const file = formData.get("file") as File | null;
        let key: string | undefined;
        if (file && file.size > 0) {
          const buffer = Buffer.from(await file.arrayBuffer());
          key = `${lobby.id}/profiles/profile-dark-${Date.now()}-${file.name}`;
          await uploadFile(key, buffer, file.type || "image/jpeg");
        } else {
          key = (formData.get("existing") as string) || undefined;
        }
        const settings = (lobby.settings || {}) as Record<string, unknown>;
        await prisma.lobby.update({
          where: { id: lobby.id },
          data: {
            settings: { ...settings, profileImageDark: key || null },
          },
        });
        return { success: "Dark mode profile picture updated" };
      }
    }
  } catch {
    return { error: "Operation failed" };
  }

  return null;
}

export default function AdminMedia() {
  const { lobby, backgrounds, banners, profiles } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  if (!lobby) return null;

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
            Current: {lobby.backgroundImage ? lobby.backgroundImage.split("/").pop() : "None"}
          </p>
          {lobby.backgroundImageUrl && (
            <div
              className="w-full h-32 rounded-lg bg-cover bg-center border border-theme"
              style={{ backgroundImage: `url('${lobby.backgroundImageUrl}')` }}
            />
          )}
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
                  <option key={bg.key} value={bg.key}>{bg.name}</option>
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
            {lobby.backgroundImageDarkUrl && (
              <div className="mb-4">
                <p className="text-sm text-theme-secondary mb-2">
                  Current: {lobby.backgroundImageDark?.split("/").pop()}
                </p>
                <div
                  className="w-full h-24 rounded-lg bg-cover bg-center border border-theme"
                  style={{ backgroundImage: `url('${lobby.backgroundImageDarkUrl}')` }}
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
                      <option key={bg.key} value={bg.key}>{bg.name}</option>
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
            Current: {lobby.bannerImage ? lobby.bannerImage.split("/").pop() : "None"}
          </p>
          {lobby.bannerImageUrl && (
            <img
              src={lobby.bannerImageUrl}
              alt="Current banner"
              className="max-h-24 object-contain"
            />
          )}
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
                  <option key={b.key} value={b.key}>{b.name}</option>
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
            {lobby.bannerImageDarkUrl && (
              <div className="mb-4">
                <p className="text-sm text-theme-secondary mb-2">
                  Current: {lobby.bannerImageDark?.split("/").pop()}
                </p>
                <img
                  src={lobby.bannerImageDarkUrl}
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
                      <option key={b.key} value={b.key}>{b.name}</option>
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
            Current: {lobby.profileImage ? lobby.profileImage.split("/").pop() : "None set"}
          </p>
          {lobby.profileImageUrl && (
            <img
              src={lobby.profileImageUrl}
              alt="Current profile"
              className="w-24 h-24 rounded-full object-cover border-2 border-theme"
            />
          )}
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
                  <option key={p.key} value={p.key}>{p.name}</option>
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
            {lobby.profileImageDarkUrl && (
              <div className="mb-4">
                <p className="text-sm text-theme-secondary mb-2">
                  Current: {lobby.profileImageDark?.split("/").pop()}
                </p>
                <img
                  src={lobby.profileImageDarkUrl}
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
                      <option key={p.key} value={p.key}>{p.name}</option>
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
