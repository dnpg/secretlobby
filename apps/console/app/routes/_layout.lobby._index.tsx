import { useState, useEffect } from "react";
import { Form, useLoaderData, useActionData, useNavigation, useSubmit, redirect, useOutletContext } from "react-router";
import type { Route } from "./+types/_layout.lobby._index";
import { cn, RichTextEditor, MediaPicker, type MediaItem, useImageTransform } from "@secretlobby/ui";
import { toast } from "sonner";
import type { LobbyContext } from "./_layout.lobby";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `${data?.lobby?.name || "Lobby"} Content - Admin` }];
}

interface MediaRef {
  id: string;
  filename: string;
  url: string;
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { getSession, requireUserAuth } = await import("@secretlobby/auth");
  const { getPublicUrl } = await import("@secretlobby/storage");
  const { getLobbyByIdWithMedia } = await import("~/models/queries/lobby.server");

  const { session } = await getSession(request);
  requireUserAuth(session);

  const accountId = session.currentAccountId;
  if (!accountId) {
    throw redirect("/login");
  }

  const { lobbyId } = params;
  if (!lobbyId) {
    throw redirect("/lobbies");
  }

  const lobby = await getLobbyByIdWithMedia(lobbyId);

  if (!lobby || lobby.accountId !== accountId) {
    throw redirect("/lobbies");
  }

  function mediaRef(media: { id: string; filename: string; key: string; type: string; embedUrl: string | null } | null): MediaRef | null {
    if (!media) return null;
    return {
      id: media.id,
      filename: media.filename,
      url: media.type === "EMBED" ? (media.embedUrl || "") : getPublicUrl(media.key),
    };
  }

  return {
    lobby: {
      id: lobby.id,
      name: lobby.name,
      title: lobby.title,
      description: lobby.description,
      backgroundMedia: mediaRef(lobby.backgroundMedia),
      backgroundMediaDark: mediaRef(lobby.backgroundMediaDark),
      bannerMedia: mediaRef(lobby.bannerMedia),
      bannerMediaDark: mediaRef(lobby.bannerMediaDark),
      profileMedia: mediaRef(lobby.profileMedia),
      profileMediaDark: mediaRef(lobby.profileMediaDark),
    },
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { getSession, requireUserAuth } = await import("@secretlobby/auth");
  const { getLobbyById } = await import("~/models/queries/lobby.server");
  const { updateLobbyContent, updateLobbyMedia } = await import("~/models/mutations/lobby.server");
  const { createLogger, formatError } = await import("@secretlobby/logger/server");

  const logger = createLogger({ service: "console:lobby-content" });

  const { session } = await getSession(request);
  requireUserAuth(session);

  const accountId = session.currentAccountId;
  if (!accountId) {
    return { error: "Not authenticated" };
  }

  const { lobbyId } = params;
  if (!lobbyId) {
    return { error: "Lobby ID required" };
  }

  // Verify lobby belongs to account
  const lobby = await getLobbyById(lobbyId);
  if (!lobby || lobby.accountId !== accountId) {
    return { error: "Lobby not found" };
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  try {
    switch (intent) {
      case "update-band-info": {
        const title = formData.get("bandName") as string;
        const description = formData.get("bandDescription") as string;

        await updateLobbyContent(lobbyId, {
          title: title || null,
          description: description || null,
        });

        return { success: "Lobby info updated successfully" };
      }

      case "update-background": {
        const mediaId = formData.get("mediaId") as string | null;
        await updateLobbyMedia(lobbyId, "backgroundMediaId", mediaId || null);
        return { success: "Background updated" };
      }

      case "update-background-dark": {
        const mediaId = formData.get("mediaId") as string | null;
        await updateLobbyMedia(lobbyId, "backgroundMediaDarkId", mediaId || null);
        return { success: "Dark mode background updated" };
      }

      case "update-banner": {
        const mediaId = formData.get("mediaId") as string | null;
        await updateLobbyMedia(lobbyId, "bannerMediaId", mediaId || null);
        return { success: "Banner updated" };
      }

      case "update-banner-dark": {
        const mediaId = formData.get("mediaId") as string | null;
        await updateLobbyMedia(lobbyId, "bannerMediaDarkId", mediaId || null);
        return { success: "Dark mode banner updated" };
      }

      case "update-profile": {
        const mediaId = formData.get("mediaId") as string | null;
        await updateLobbyMedia(lobbyId, "profileMediaId", mediaId || null);
        return { success: "Profile picture updated" };
      }

      case "update-profile-dark": {
        const mediaId = formData.get("mediaId") as string | null;
        await updateLobbyMedia(lobbyId, "profileMediaDarkId", mediaId || null);
        return { success: "Dark mode profile picture updated" };
      }
    }
  } catch (error) {
    logger.error({ error: formatError(error) }, "Lobby content update error");
    return { error: "Operation failed" };
  }

  return null;
}

function ImageSlot({
  label,
  intent,
  current,
  onClear,
}: {
  label: string;
  intent: string;
  current: MediaRef | null;
  onClear: () => void;
}) {
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const submit = useSubmit();
  const { transformUrl, generateSrcSet } = useImageTransform();

  const handleSelect = (media: MediaItem) => {
    submit(
      { intent, mediaId: media.id },
      { method: "post" },
    );
  };

  const slotSize = 96;
  const slotWidths = [96, 192];

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium">{label}</label>
      {current ? (
        <div className="flex items-center gap-4">
          <div className="w-24 h-24 rounded-lg border border-theme overflow-hidden bg-theme-tertiary flex-shrink-0">
            <img
              src={transformUrl(current.url, { width: slotSize })}
              srcSet={generateSrcSet(current.url, slotWidths)}
              sizes="96px"
              width={slotSize}
              height={slotSize}
              loading="lazy"
              alt={current.filename}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-theme-primary truncate">{current.filename}</p>
            <div className="flex gap-2 mt-2">
              <MediaPicker accept={["image/*"]} onSelect={handleSelect}>
                <button
                  type="button"
                  className="px-3 py-1.5 text-xs btn-secondary rounded-lg transition cursor-pointer"
                >
                  Change
                </button>
              </MediaPicker>
              <button
                type="button"
                onClick={onClear}
                disabled={isSubmitting}
                className="px-3 py-1.5 text-xs text-red-400 hover:text-red-300 border border-red-500/30 hover:border-red-500/50 rounded-lg transition cursor-pointer disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : (
        <MediaPicker accept={["image/*"]} onSelect={handleSelect}>
          <button
            type="button"
            className="w-full px-4 py-6 border-2 border-dashed border-theme rounded-xl text-sm text-theme-muted hover:text-theme-primary hover:border-[var(--color-accent)] transition cursor-pointer"
          >
            Choose from Media Library...
          </button>
        </MediaPicker>
      )}
    </div>
  );
}

export default function LobbyContentPage() {
  const loaderData = useLoaderData<typeof loader>();
  const { lobby } = loaderData;
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const submit = useSubmit();

  // Local state to allow optimistic clear
  const [cleared, setCleared] = useState<Set<string>>(new Set());

  useEffect(() => {
    setCleared(new Set());
  }, [loaderData]);

  useEffect(() => {
    if (actionData?.success) {
      toast.success(actionData.success);
    }
    if (actionData?.error) {
      toast.error(actionData.error);
    }
  }, [actionData]);

  function submitClear(intent: string) {
    setCleared((prev) => new Set(prev).add(intent));
    submit(
      { intent },
      { method: "post" },
    );
  }

  function getCurrent(intent: string, media: MediaRef | null): MediaRef | null {
    if (cleared.has(intent)) return null;
    return media;
  }

  return (
    <div className="space-y-8">
      {/* Lobby Info Section */}
      <section className="bg-theme-secondary rounded-xl p-6 border border-theme">
        <h2 className="text-lg font-semibold mb-4">Lobby Information</h2>
        <p className="text-sm text-theme-secondary mb-4">
          Set your lobby title and description that will appear to visitors.
        </p>
        <Form method="post" className="space-y-4">
          <input type="hidden" name="intent" value="update-band-info" />
          <div>
            <label className="block text-sm font-medium mb-2">Lobby Title</label>
            <input
              type="text"
              name="bandName"
              defaultValue={lobby.title || ""}
              className="w-full px-4 py-2 bg-theme-tertiary rounded-lg border border-theme focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              placeholder="Enter lobby title"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Description</label>
            <RichTextEditor
              name="bandDescription"
              defaultValue={lobby.description || ""}
              placeholder="Enter lobby description..."
              features={["bold", "italic", "underline", "textAlign", "heading", "bulletList", "orderedList", "link", "blockquote", "htmlSource"]}
            />
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className={cn("px-6 py-2 btn-primary rounded-lg transition disabled:opacity-50", {"cursor-pointer": !isSubmitting, "cursor-not-allowed": isSubmitting})}
          >
            Save Lobby Info
          </button>
        </Form>
      </section>

      {/* Background Image Section */}
      <section className="bg-theme-secondary rounded-xl p-6 border border-theme">
        <h2 className="text-lg font-semibold mb-4">Background Image</h2>
        <div className="space-y-6">
          <ImageSlot
            label="Default Background"
            intent="update-background"
            current={getCurrent("update-background", lobby.backgroundMedia)}
            onClear={() => submitClear("update-background")}
          />
          <details>
            <summary className="cursor-pointer text-sm font-medium text-theme-secondary hover:text-theme-primary transition">
              Dark Mode Background (Optional)
            </summary>
            <div className="mt-4 pl-4 border-l-2 border-theme">
              <p className="text-xs text-theme-muted mb-3">
                Set a different background for dark mode. If not set, the default background will be used.
              </p>
              <ImageSlot
                label="Dark Mode Background"
                intent="update-background-dark"
                current={getCurrent("update-background-dark", lobby.backgroundMediaDark)}
                onClear={() => submitClear("update-background-dark")}
              />
            </div>
          </details>
        </div>
      </section>

      {/* Banner / Logo Section */}
      <section className="bg-theme-secondary rounded-xl p-6 border border-theme">
        <h2 className="text-lg font-semibold mb-4">Banner / Logo</h2>
        <div className="space-y-6">
          <ImageSlot
            label="Default Banner"
            intent="update-banner"
            current={getCurrent("update-banner", lobby.bannerMedia)}
            onClear={() => submitClear("update-banner")}
          />
          <details>
            <summary className="cursor-pointer text-sm font-medium text-theme-secondary hover:text-theme-primary transition">
              Dark Mode Banner (Optional)
            </summary>
            <div className="mt-4 pl-4 border-l-2 border-theme">
              <p className="text-xs text-theme-muted mb-3">
                Set a different banner for dark mode. If not set, the default banner will be used.
              </p>
              <ImageSlot
                label="Dark Mode Banner"
                intent="update-banner-dark"
                current={getCurrent("update-banner-dark", lobby.bannerMediaDark)}
                onClear={() => submitClear("update-banner-dark")}
              />
            </div>
          </details>
        </div>
      </section>

      {/* Profile Picture Section */}
      <section className="bg-theme-secondary rounded-xl p-6 border border-theme">
        <h2 className="text-lg font-semibold mb-4">Profile Picture</h2>
        <p className="text-sm text-theme-secondary mb-4">
          This image appears in the sidebar next to the band description.
        </p>
        <div className="space-y-6">
          <ImageSlot
            label="Default Profile Picture"
            intent="update-profile"
            current={getCurrent("update-profile", lobby.profileMedia)}
            onClear={() => submitClear("update-profile")}
          />
          <details>
            <summary className="cursor-pointer text-sm font-medium text-theme-secondary hover:text-theme-primary transition">
              Dark Mode Profile Picture (Optional)
            </summary>
            <div className="mt-4 pl-4 border-l-2 border-theme">
              <p className="text-xs text-theme-muted mb-3">
                Set a different profile picture for dark mode. If not set, the default will be used.
              </p>
              <ImageSlot
                label="Dark Mode Profile Picture"
                intent="update-profile-dark"
                current={getCurrent("update-profile-dark", lobby.profileMediaDark)}
                onClear={() => submitClear("update-profile-dark")}
              />
            </div>
          </details>
        </div>
      </section>
    </div>
  );
}
