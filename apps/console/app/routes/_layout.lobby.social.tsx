import { useEffect } from "react";
import { Form, useLoaderData, useActionData, useNavigation, redirect } from "react-router";
import type { Route } from "./+types/_layout.lobby.social";
import { cn } from "@secretlobby/ui";
import { toast } from "sonner";

// Define SOCIAL_PLATFORMS inline to avoid importing from .server file
const SOCIAL_PLATFORMS = [
  { id: "spotify", label: "Spotify", placeholder: "https://open.spotify.com/artist/..." },
  { id: "applemusic", label: "Apple Music", placeholder: "https://music.apple.com/artist/..." },
  { id: "youtube", label: "YouTube", placeholder: "https://youtube.com/@..." },
  { id: "youtubemusic", label: "YouTube Music", placeholder: "https://music.youtube.com/channel/..." },
  { id: "soundcloud", label: "SoundCloud", placeholder: "https://soundcloud.com/..." },
  { id: "bandcamp", label: "Bandcamp", placeholder: "https://....bandcamp.com" },
  { id: "instagram", label: "Instagram", placeholder: "https://instagram.com/..." },
  { id: "tiktok", label: "TikTok", placeholder: "https://tiktok.com/@..." },
  { id: "facebook", label: "Facebook", placeholder: "https://facebook.com/..." },
  { id: "x", label: "X (Twitter)", placeholder: "https://x.com/..." },
  { id: "tidal", label: "Tidal", placeholder: "https://tidal.com/artist/..." },
  { id: "deezer", label: "Deezer", placeholder: "https://deezer.com/artist/..." },
  { id: "amazonmusic", label: "Amazon Music", placeholder: "https://music.amazon.com/artists/..." },
  { id: "email", label: "Email", placeholder: "email@example.com" },
] as const;

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `Social Links - ${data?.lobbyName || "Lobby"} - Admin` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { getSession, isAdmin } = await import("@secretlobby/auth");
  const { getLobbySocialLinksSettings } = await import("~/lib/content.server");
  const { getLobbyById } = await import("~/models/queries/lobby.server");

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

  const socialLinks = await getLobbySocialLinksSettings(lobbyId);
  return { socialLinks, lobbyName: lobby.name };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { getSession, isAdmin } = await import("@secretlobby/auth");
  const { updateLobbySocialLinksSettings, SOCIAL_PLATFORMS: platforms } = await import("~/lib/content.server");
  const { getLobbyById } = await import("~/models/queries/lobby.server");
  const { createLogger, formatError } = await import("@secretlobby/logger/server");

  const logger = createLogger({ service: "console:lobby-social" });

  const { session } = await getSession(request);
  if (!isAdmin(session) || !session.currentAccountId) {
    return { error: "Unauthorized" };
  }

  const { lobbyId } = params;
  if (!lobbyId) {
    return { error: "Lobby ID required" };
  }

  const lobby = await getLobbyById(lobbyId);
  if (!lobby || lobby.accountId !== session.currentAccountId) {
    return { error: "Lobby not found" };
  }

  const formData = await request.formData();

  try {
    const links: Array<{ platform: string; url: string; label: string }> = [];

    // Parse the form data for each platform
    for (const platform of platforms) {
      const url = formData.get(`link_${platform.id}`) as string;
      if (url?.trim()) {
        links.push({
          platform: platform.id,
          url: url.trim(),
          label: platform.label,
        });
      }
    }

    await updateLobbySocialLinksSettings(lobbyId, { links });
    return { success: "Social links updated" };
  } catch (error) {
    logger.error({ error: formatError(error) }, "Social links update error");
    return { error: "Failed to update social links" };
  }
}

export default function LobbySocialPage() {
  const { socialLinks } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  useEffect(() => {
    if (actionData?.success) toast.success(actionData.success);
    if (actionData?.error) toast.error(actionData.error);
  }, [actionData]);

  // Create a map of current links for easy lookup
  const linkMap = new Map(socialLinks.links.map((l) => [l.platform, l.url]));

  return (
    <div className="space-y-8">
      <section className="bg-theme-secondary rounded-xl p-6 border border-theme">
        <h2 className="text-lg font-semibold mb-4">Social Links</h2>
        <p className="text-sm text-theme-secondary mb-6">
          Add links to your social media profiles. These will appear on your lobby page.
        </p>

        <Form method="post" className="space-y-4">
          {SOCIAL_PLATFORMS.map((platform) => (
            <div key={platform.id} className="flex items-center gap-4">
              <div className="w-32 text-sm font-medium">{platform.label}</div>
              <input
                type="url"
                name={`link_${platform.id}`}
                defaultValue={linkMap.get(platform.id) || ""}
                placeholder={platform.placeholder || `https://${platform.id}.com/...`}
                className="flex-1 px-4 py-2 bg-theme-tertiary rounded-lg border border-theme focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
            </div>
          ))}

          <button
            type="submit"
            disabled={isSubmitting}
            className={cn("px-6 py-2 btn-primary rounded-lg transition disabled:opacity-50 mt-4", isSubmitting ? "cursor-not-allowed" : "cursor-pointer")}
          >
            {isSubmitting ? "Saving..." : "Save Social Links"}
          </button>
        </Form>
      </section>
    </div>
  );
}
