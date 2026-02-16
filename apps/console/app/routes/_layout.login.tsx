import { useEffect } from "react";
import { Form, useLoaderData, useActionData, useNavigation, useSubmit, redirect } from "react-router";
import type { Route } from "./+types/_layout.login";
import { cn, MediaPicker, type MediaItem, useImageTransform } from "@secretlobby/ui";
import type { LoginPageSettings } from "~/lib/content.server";
import { toast } from "sonner";

export function meta() {
  return [{ title: "Login Page Settings - Admin" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  // Server-only imports
  const { getSession, requireUserAuth, getCsrfToken } = await import("@secretlobby/auth");
  const { getPublicUrl } = await import("@secretlobby/storage");
  const { getLoginPageSettings } = await import("~/lib/content.server");
  const { getDefaultLobbyPassword } = await import("~/models/queries/lobby.server");

  const { session } = await getSession(request);
  requireUserAuth(session);

  const accountId = session.currentAccountId;
  if (!accountId) {
    throw redirect("/login");
  }

  const loginSettings = await getLoginPageSettings(accountId);

  // Get lobby password
  const lobby = await getDefaultLobbyPassword(accountId);

  const csrfToken = await getCsrfToken(request);

  return {
    loginSettings,
    logoImageUrl: loginSettings.logoImage ? getPublicUrl(loginSettings.logoImage) : null,
    lobbyPassword: lobby?.password || null,
    csrfToken,
  };
}

export async function action({ request }: Route.ActionArgs) {
  // Server-only imports
  const { getSession, requireUserAuth } = await import("@secretlobby/auth");
  const { csrfProtect } = await import("@secretlobby/auth/csrf");
  const { updateLoginPageSettings } = await import("~/lib/content.server");
  const { getMediaByIdAndAccountId } = await import("~/models/queries/media.server");
  const { getDefaultLobbyByAccountId } = await import("~/models/queries/lobby.server");
  const { updateLobbyPassword } = await import("~/models/mutations/lobby.server");
  const { createLogger, formatError } = await import("@secretlobby/logger/server");

  const logger = createLogger({ service: "console:login-settings" });

  const { session } = await getSession(request);
  requireUserAuth(session);

  // Verify CSRF token (uses HMAC validation)
  await csrfProtect(request);

  const accountId = session.currentAccountId;
  if (!accountId) {
    return { error: "Not authenticated" };
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  try {
    switch (intent) {
      case "update-login-appearance": {
        const title = (formData.get("title") as string) || "";
        const description = (formData.get("description") as string) || "";
        const bgColor = (formData.get("bgColor") as string) || "#111827";
        const panelBgColor = (formData.get("panelBgColor") as string) || "#1f2937";
        const panelBorderColor = (formData.get("panelBorderColor") as string) || "#374151";
        const textColor = (formData.get("textColor") as string) || "#ffffff";
        const buttonLabel = (formData.get("buttonLabel") as string) || "Enter Lobby";

        await updateLoginPageSettings(accountId, {
          title,
          description,
          bgColor,
          panelBgColor,
          panelBorderColor,
          textColor,
          buttonLabel,
        });

        return { success: "Login page appearance updated" };
      }

      case "update-login-logo": {
        const mediaId = formData.get("mediaId") as string;
        if (!mediaId) {
          return { error: "No media selected" };
        }

        const media = await getMediaByIdAndAccountId(mediaId, accountId);
        if (!media) {
          return { error: "Media not found" };
        }

        await updateLoginPageSettings(accountId, {
          logoType: "image",
          logoImage: media.key,
          logoSvg: "",
        });
        return { success: "Logo updated" };
      }

      case "remove-login-logo": {
        await updateLoginPageSettings(accountId, {
          logoType: null,
          logoSvg: "",
          logoImage: "",
        });
        return { success: "Logo removed" };
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

        const lobby = await getDefaultLobbyByAccountId(accountId);

        if (!lobby) {
          return { error: "No default lobby found" };
        }

        await updateLobbyPassword(lobby.id, newPassword);

        return { success: "Lobby password updated successfully" };
      }
    }
  } catch (error) {
    logger.error({ error: formatError(error) }, "Login page settings error");
    return { error: "Operation failed" };
  }

  return null;
}

interface ColorInputProps {
  label: string;
  name: string;
  value: string;
  description?: string;
}

function ColorInput({ label, name, value, description }: ColorInputProps) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1 text-theme-primary">
        {label}
      </label>
      {description && (
        <p className="text-xs text-theme-muted mb-2">{description}</p>
      )}
      <div className="flex gap-2">
        <input
          type="color"
          name={name}
          defaultValue={value}
          className="w-12 h-10 rounded cursor-pointer bg-transparent border border-theme"
        />
        <input
          type="text"
          defaultValue={value}
          onChange={(e) => {
            const colorInput = e.target.previousElementSibling as HTMLInputElement;
            if (colorInput && /^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
              colorInput.value = e.target.value;
            }
          }}
          className="flex-1 px-3 py-2 bg-theme-tertiary rounded-lg border border-theme text-theme-primary text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          placeholder="#000000"
        />
      </div>
    </div>
  );
}

export default function AdminLogin() {
  const { loginSettings, logoImageUrl, lobbyPassword, csrfToken } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const submit = useSubmit();
  const { transformUrl, generateSrcSet } = useImageTransform();

  const handleLogoSelect = (media: MediaItem) => {
    submit(
      { intent: "update-login-logo", mediaId: media.id },
      { method: "post" },
    );
  };

  useEffect(() => {
    if (actionData?.success) {
      toast.success(actionData.success);
    }
    if (actionData?.error) {
      toast.error(actionData.error);
    }
  }, [actionData]);

  return (
    <div className="space-y-8">
      {/* Logo Section */}
      <section className="bg-theme-secondary rounded-xl p-6 border border-theme">
        <h2 className="text-lg font-semibold mb-4">Login Page Logo</h2>
        <p className="text-sm text-theme-secondary mb-4">
          Add a logo that appears above the login form title.
        </p>

        {loginSettings.logoType === "image" && logoImageUrl ? (
          <div className="flex items-center gap-4">
            <div className="w-24 h-24 rounded-lg border border-theme overflow-hidden bg-theme-tertiary flex-shrink-0 flex items-center justify-center">
              <img
                src={transformUrl(logoImageUrl, { width: 96 })}
                srcSet={generateSrcSet(logoImageUrl, [96, 192])}
                sizes="96px"
                width={96}
                height={96}
                loading="lazy"
                alt="Login logo"
                className="max-w-full max-h-full object-contain"
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-theme-primary mb-2">Current logo</p>
              <div className="flex gap-2">
                <MediaPicker accept={["image/*"]} onSelect={handleLogoSelect}>
                  <button
                    type="button"
                    className="px-3 py-1.5 text-xs btn-secondary rounded-lg transition cursor-pointer"
                  >
                    Change
                  </button>
                </MediaPicker>
                <Form method="post">
                  <input type="hidden" name="intent" value="remove-login-logo" />
                  <input type="hidden" name="_csrf" value={csrfToken} />
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className={cn("px-3 py-1.5 text-xs text-red-400 hover:text-red-300 border border-red-500/30 hover:border-red-500/50 rounded-lg transition disabled:opacity-50", {"cursor-pointer": !isSubmitting, "cursor-not-allowed": isSubmitting})}
                  >
                    Remove
                  </button>
                </Form>
              </div>
            </div>
          </div>
        ) : (
          <MediaPicker accept={["image/*"]} onSelect={handleLogoSelect}>
            <button
              type="button"
              className="w-full px-4 py-6 border-2 border-dashed border-theme rounded-xl text-sm text-theme-muted hover:text-theme-primary hover:border-[var(--color-accent)] transition cursor-pointer"
            >
              Choose from Media Library...
            </button>
          </MediaPicker>
        )}
      </section>

      {/* Title, Description & Colors Section */}
      <section className="bg-theme-secondary rounded-xl p-6 border border-theme">
        <h2 className="text-lg font-semibold mb-4">Appearance</h2>
        <p className="text-sm text-theme-secondary mb-6">
          Customize the title, description, and colors of the login page.
        </p>

        <Form method="post" className="space-y-6">
          <input type="hidden" name="intent" value="update-login-appearance" />
          <input type="hidden" name="_csrf" value={csrfToken} />

          {/* Title & Description */}
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Title</label>
              <input
                type="text"
                name="title"
                defaultValue={loginSettings.title}
                className="w-full px-4 py-2 bg-theme-tertiary rounded-lg border border-theme focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                placeholder="Console Login"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Description</label>
              <input
                type="text"
                name="description"
                defaultValue={loginSettings.description}
                className="w-full px-4 py-2 bg-theme-tertiary rounded-lg border border-theme focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                placeholder="Sign in to manage your account"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Button Label</label>
              <input
                type="text"
                name="buttonLabel"
                defaultValue={loginSettings.buttonLabel}
                className="w-full px-4 py-2 bg-theme-tertiary rounded-lg border border-theme focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                placeholder="Enter Lobby"
              />
            </div>
          </div>

          {/* Colors */}
          <div>
            <h3 className="text-sm font-semibold mb-3 text-theme-secondary uppercase tracking-wide">
              Colors
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ColorInput
                label="Page Background"
                name="bgColor"
                value={loginSettings.bgColor}
                description="Main page background color"
              />
              <ColorInput
                label="Panel Background"
                name="panelBgColor"
                value={loginSettings.panelBgColor}
                description="Login card background"
              />
              <ColorInput
                label="Panel Border"
                name="panelBorderColor"
                value={loginSettings.panelBorderColor}
                description="Login card border color"
              />
              <ColorInput
                label="Text Color"
                name="textColor"
                value={loginSettings.textColor}
                description="Heading and label text"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className={cn("px-6 py-2 btn-primary rounded-lg transition disabled:opacity-50", {"cursor-pointer": !isSubmitting, "cursor-not-allowed": isSubmitting})}
          >
            Save Appearance
          </button>
        </Form>
      </section>

      {/* Lobby Password Section */}
      <section className="bg-theme-secondary rounded-xl p-6 border border-theme">
        <h2 className="text-lg font-semibold mb-4">Lobby Password</h2>
        <p className="text-sm text-theme-secondary mb-4">
          {lobbyPassword
            ? "Change or remove the password protection for your lobby."
            : "Add password protection to your lobby (optional)."}
        </p>
        <Form method="post" className="space-y-4">
          <input type="hidden" name="intent" value="update-password" />
          <input type="hidden" name="_csrf" value={csrfToken} />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">New Password</label>
              <input
                type="password"
                name="newPassword"
                required
                minLength={4}
                className="w-full px-4 py-2 bg-theme-tertiary rounded-lg border border-theme focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                placeholder="Enter new password"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Confirm Password</label>
              <input
                type="password"
                name="confirmPassword"
                required
                minLength={4}
                className="w-full px-4 py-2 bg-theme-tertiary rounded-lg border border-theme focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                placeholder="Confirm new password"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className={cn("px-6 py-2 btn-primary rounded-lg transition disabled:opacity-50", {"cursor-pointer": !isSubmitting, "cursor-not-allowed": isSubmitting})}
          >
            Update Password
          </button>
        </Form>
      </section>
    </div>
  );
}
