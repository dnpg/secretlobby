import { useState, useEffect } from "react";
import { Form, useLoaderData, useActionData, useNavigation, useSubmit, redirect } from "react-router";
import type { Route } from "./+types/_layout.lobby.login";
import { cn, MediaPicker, type MediaItem, useImageTransform } from "@secretlobby/ui";
import { toast } from "sonner";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `Login Page - ${data?.lobbyName || "Lobby"} - Admin` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { getSession, isAdmin, getCsrfToken } = await import("@secretlobby/auth");
  const { getLobbyLoginPageSettings } = await import("~/lib/content.server");
  const { getLobbyById } = await import("~/models/queries/lobby.server");
  const { getPublicUrl } = await import("@secretlobby/storage");

  const { session } = await getSession(request);
  if (!isAdmin(session) || !session.currentAccountId) {
    throw redirect("/login");
  }

  const { lobbyId } = params;
  if (!lobbyId) {
    throw redirect("/lobbies");
  }

  const lobby = await getLobbyById(lobbyId);
  if (!lobby || lobby.accountId !== session.currentAccountId) {
    throw redirect("/lobbies");
  }

  const loginPage = await getLobbyLoginPageSettings(lobbyId);
  const csrfToken = await getCsrfToken(request);

  return {
    loginPage,
    lobbyName: lobby.name,
    logoImageUrl: loginPage.logoImage ? getPublicUrl(loginPage.logoImage) : null,
    csrfToken,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { getSession, isAdmin } = await import("@secretlobby/auth");
  const { csrfProtect } = await import("@secretlobby/auth/csrf");
  const { updateLobbyLoginPageSettings } = await import("~/lib/content.server");
  const { getLobbyById } = await import("~/models/queries/lobby.server");
  const { getMediaByIdAndAccountId } = await import("~/models/queries/media.server");
  const { createLogger, formatError } = await import("@secretlobby/logger/server");

  const logger = createLogger({ service: "console:lobby-login" });

  const { session } = await getSession(request);
  if (!isAdmin(session) || !session.currentAccountId) {
    return { error: "Unauthorized" };
  }

  await csrfProtect(request);

  const { lobbyId } = params;
  if (!lobbyId) {
    return { error: "Lobby ID required" };
  }

  const lobby = await getLobbyById(lobbyId);
  if (!lobby || lobby.accountId !== session.currentAccountId) {
    return { error: "Lobby not found" };
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  try {
    switch (intent) {
      case "update-appearance": {
        const logoMaxWidthStr = formData.get("logoMaxWidth") as string;
        const logoMaxWidth = logoMaxWidthStr ? parseInt(logoMaxWidthStr, 10) : undefined;

        const updates = {
          title: formData.get("title") as string,
          description: formData.get("description") as string,
          buttonLabel: formData.get("buttonLabel") as string,
          logoMaxWidth: logoMaxWidth && logoMaxWidth >= 10 && logoMaxWidth <= 100 ? logoMaxWidth : undefined,
          bgColor: formData.get("bgColor") as string,
          panelBgColor: formData.get("panelBgColor") as string,
          panelBorderColor: formData.get("panelBorderColor") as string,
          textColor: formData.get("textColor") as string,
        };

        await updateLobbyLoginPageSettings(lobbyId, updates);
        return { success: "Login page updated" };
      }

      case "update-logo": {
        const mediaId = formData.get("mediaId") as string;
        if (!mediaId) {
          return { error: "No media selected" };
        }

        const media = await getMediaByIdAndAccountId(mediaId, session.currentAccountId);
        if (!media) {
          return { error: "Media not found" };
        }

        await updateLobbyLoginPageSettings(lobbyId, {
          logoType: "image",
          logoImage: media.key,
          logoSvg: "",
        });
        return { success: "Logo updated" };
      }

      case "remove-logo": {
        await updateLobbyLoginPageSettings(lobbyId, {
          logoType: null,
          logoSvg: "",
          logoImage: "",
        });
        return { success: "Logo removed" };
      }

      default:
        return { error: "Unknown action" };
    }
  } catch (error) {
    logger.error({ error: formatError(error) }, "Login page update error");
    return { error: "Failed to update login page" };
  }
}

export default function LobbyLoginPage() {
  const { loginPage, logoImageUrl, csrfToken } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const submit = useSubmit();
  const { transformUrl, generateSrcSet } = useImageTransform();
  const [logoMaxWidth, setLogoMaxWidth] = useState(loginPage.logoMaxWidth || 50);

  const handleLogoSelect = (media: MediaItem) => {
    submit(
      { intent: "update-logo", mediaId: media.id, _csrf: csrfToken },
      { method: "post" },
    );
  };

  useEffect(() => {
    if (actionData?.success) toast.success(actionData.success);
    if (actionData?.error) toast.error(actionData.error);
  }, [actionData]);

  return (
    <div className="space-y-8">
      {/* Logo Section */}
      <section className="bg-theme-secondary rounded-xl p-6 border border-theme">
        <h2 className="text-lg font-semibold mb-4">Login Page Logo</h2>
        <p className="text-sm text-theme-secondary mb-4">
          Add a logo that appears above the login form title.
        </p>

        {loginPage.logoType === "image" && logoImageUrl ? (
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
                  <input type="hidden" name="intent" value="remove-logo" />
                  <input type="hidden" name="_csrf" value={csrfToken} />
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className={cn(
                      "px-3 py-1.5 text-xs text-red-400 hover:text-red-300 border border-red-500/30 hover:border-red-500/50 rounded-lg transition disabled:opacity-50",
                      { "cursor-pointer": !isSubmitting, "cursor-not-allowed": isSubmitting }
                    )}
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

        {/* Logo Max Width - only show if logo is set */}
        {loginPage.logoType === "image" && logoImageUrl && (
          <div className="mt-6 pt-6 border-t border-theme">
            <label className="block text-sm font-medium mb-2">
              Logo Max Width: {logoMaxWidth}%
            </label>
            <input
              type="range"
              min="10"
              max="100"
              step="5"
              value={logoMaxWidth}
              onChange={(e) => setLogoMaxWidth(parseInt(e.target.value, 10))}
              className="w-full cursor-pointer"
            />
            <p className="text-xs text-theme-muted mt-1">
              Controls the maximum width of the logo relative to the login panel.
            </p>
          </div>
        )}
      </section>

      {/* Appearance Section */}
      <section className="bg-theme-secondary rounded-xl p-6 border border-theme">
        <h2 className="text-lg font-semibold mb-4">Appearance</h2>
        <p className="text-sm text-theme-secondary mb-6">
          Customize the password entry page for this lobby.
        </p>

        <Form method="post" className="space-y-6">
          <input type="hidden" name="intent" value="update-appearance" />
          <input type="hidden" name="_csrf" value={csrfToken} />
          <input type="hidden" name="logoMaxWidth" value={logoMaxWidth} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium mb-2">Page Title</label>
              <input
                type="text"
                name="title"
                defaultValue={loginPage.title}
                className="w-full px-4 py-2 bg-theme-tertiary rounded-lg border border-theme focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Button Label</label>
              <input
                type="text"
                name="buttonLabel"
                defaultValue={loginPage.buttonLabel}
                className="w-full px-4 py-2 bg-theme-tertiary rounded-lg border border-theme focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Description</label>
            <textarea
              name="description"
              defaultValue={loginPage.description}
              rows={3}
              className="w-full px-4 py-2 bg-theme-tertiary rounded-lg border border-theme focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs text-theme-secondary mb-1">Background</label>
              <input
                type="color"
                name="bgColor"
                defaultValue={loginPage.bgColor}
                className="w-full h-10 rounded border border-theme cursor-pointer"
              />
            </div>
            <div>
              <label className="block text-xs text-theme-secondary mb-1">Panel Background</label>
              <input
                type="color"
                name="panelBgColor"
                defaultValue={loginPage.panelBgColor}
                className="w-full h-10 rounded border border-theme cursor-pointer"
              />
            </div>
            <div>
              <label className="block text-xs text-theme-secondary mb-1">Panel Border</label>
              <input
                type="color"
                name="panelBorderColor"
                defaultValue={loginPage.panelBorderColor}
                className="w-full h-10 rounded border border-theme cursor-pointer"
              />
            </div>
            <div>
              <label className="block text-xs text-theme-secondary mb-1">Text Color</label>
              <input
                type="color"
                name="textColor"
                defaultValue={loginPage.textColor}
                className="w-full h-10 rounded border border-theme cursor-pointer"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className={cn(
              "px-6 py-2 btn-primary rounded-lg transition disabled:opacity-50",
              { "cursor-pointer": !isSubmitting, "cursor-not-allowed": isSubmitting }
            )}
          >
            {isSubmitting ? "Saving..." : "Save Login Page"}
          </button>
        </Form>
      </section>
    </div>
  );
}
