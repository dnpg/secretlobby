import { useRef, useState, useEffect } from "react";
import { Form, useLoaderData, useActionData } from "react-router";
import type { Route } from "./+types/api.designer-preview";
import { prisma } from "@secretlobby/db";
import { validateDesignerToken, type DesignerPage } from "@secretlobby/auth";
import { getPublicUrl } from "@secretlobby/storage";
import {
  backgroundToCSS,
  defaultDarkTheme,
  generateThemeCSSVars,
  normalizeThemeBackground,
  type ThemeSettings,
} from "@secretlobby/theme";
import {
  buildCardStyles,
  PlayerView,
  useHlsAudio,
  useTrackPrefetcher,
  type ImageUrls,
  type LoginPageSettings,
  type SocialLinksSettings,
  type Track,
} from "@secretlobby/lobby-template";
import { ResponsiveImage } from "@secretlobby/ui";

const defaultLoginPageSettings: LoginPageSettings = {
  title: "",
  description: "",
  logoType: null,
  logoSvg: "",
  logoImage: "",
  logoMaxWidth: 50,
  bgColor: "#111827",
  panelBgColor: "#1f2937",
  panelBorderColor: "#374151",
  textColor: "#ffffff",
  buttonLabel: "Enter Lobby",
};

// Structural shape for swatches passed into the shared background helper.
// The lobby's `Account.swatches` Prisma model stores `{ id, value }` rows
// where `value` is a solid or linear-gradient color part — a structural
// subset of `@secretlobby/theme#ThemeSwatch[]`.
interface AccountSwatch {
  id: string;
  value:
    | { type: "solid"; color: string; opacity: number }
    | {
        type: "gradient";
        gradient: { kind: "linear"; angle: number; stops: unknown[] };
      };
}

// Body background — paints behind the `<main>` content. When the card
// surface is a gradient we mirror that gradient (preserves the legacy
// behaviour the designer-preview iframe expects); otherwise we fall through
// to the canonical layered-background helper.
function getBodyBgCSS(
  theme: ThemeSettings,
  swatches?: AccountSwatch[]
): string {
  if (theme.cardBgType === "gradient") {
    return `linear-gradient(${theme.cardBgGradientAngle ?? 135}deg, ${theme.cardBgGradientFrom}, ${theme.cardBgGradientTo})`;
  }
  return backgroundToCSS(
    normalizeThemeBackground(theme),
    swatches as unknown as Parameters<typeof backgroundToCSS>[1]
  );
}

export function headers() {
  // Allow framing from console domain
  // Include local development domains and production
  const frameAncestors = "'self' http://*.secretlobby.local http://localhost:* http://127.0.0.1:* https://*.secretlobby.co";

  return {
    "Content-Security-Policy": `frame-ancestors ${frameAncestors}`,
    // X-Frame-Options is ignored when CSP frame-ancestors is present in modern browsers
  };
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const page = url.searchParams.get("page") as DesignerPage | null;

  // Validate required parameters
  if (!token || !page) {
    throw new Response("Missing token or page parameter", { status: 400 });
  }

  if (page !== "lobby" && page !== "login") {
    throw new Response("Invalid page parameter", { status: 400 });
  }

  // Extract lobbyId from the URL path (tenant resolution)
  // The URL will be like: https://account.domain.com/api/designer-preview?token=...&page=...
  // Or: https://account.domain.com/lobby-slug/api/designer-preview?token=...&page=...

  // First, we need to determine the lobbyId from the token itself
  // We'll do a preliminary parse to extract the lobbyId, then validate fully

  // Parse token payload to get lobbyId (before full validation)
  let expectedLobbyId: string;
  try {
    const [payloadBase64] = token.split(".");
    const payloadStr = Buffer.from(payloadBase64, "base64url").toString("utf-8");
    const payload = JSON.parse(payloadStr);
    expectedLobbyId = payload.lobbyId;
  } catch {
    throw new Response("Invalid token format", { status: 403 });
  }

  // Now validate the token fully
  const validation = validateDesignerToken(token, expectedLobbyId, page);
  if (!validation.valid) {
    throw new Response(validation.error || "Invalid token", { status: 403 });
  }

  const { lobbyId, accountId } = validation;

  // Fetch the lobby with all required data
  const lobby = await prisma.lobby.findUnique({
    where: { id: lobbyId },
    include: {
      account: true,
      backgroundMedia: true,
      backgroundMediaDark: true,
      bannerMedia: true,
      bannerMediaDark: true,
      profileMedia: true,
      profileMediaDark: true,
      tracks: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          title: true,
          artist: true,
          duration: true,
          position: true,
          filename: true,
          hlsReady: true,
          waveformPeaks: true,
          media: {
            select: {
              key: true,
              duration: true,
              hlsReady: true,
              waveformPeaks: true,
            },
          },
        },
      },
    },
  });

  if (!lobby) {
    throw new Response("Lobby not found", { status: 404 });
  }

  // Verify the token's accountId matches the lobby's accountId
  if (lobby.accountId !== accountId) {
    throw new Response("Unauthorized", { status: 403 });
  }

  // Extract per-lobby settings
  let loginPageSettings: LoginPageSettings = defaultLoginPageSettings;
  let loginLogoImageUrl: string | null = null;
  let themeSettings: ThemeSettings = defaultDarkTheme;
  let socialLinksSettings: SocialLinksSettings | null = null;
  let technicalInfo: { title: string; content: string } | null = null;

  // Read per-lobby settings from lobby.settings
  if (lobby.settings && typeof lobby.settings === "object") {
    const lobbySettings = lobby.settings as Record<string, unknown>;
    if (lobbySettings.loginPage && typeof lobbySettings.loginPage === "object") {
      loginPageSettings = { ...defaultLoginPageSettings, ...(lobbySettings.loginPage as Partial<LoginPageSettings>) };
    }
    if (lobbySettings.theme && typeof lobbySettings.theme === "object") {
      themeSettings = { ...defaultDarkTheme, ...(lobbySettings.theme as Partial<ThemeSettings>) };
    }
    if (lobbySettings.socialLinks && typeof lobbySettings.socialLinks === "object") {
      socialLinksSettings = lobbySettings.socialLinks as SocialLinksSettings;
    }
    if (lobbySettings.technicalInfo && typeof lobbySettings.technicalInfo === "object") {
      const ti = lobbySettings.technicalInfo as { title?: string; content?: string };
      if (ti.title || ti.content) {
        technicalInfo = { title: ti.title || "", content: ti.content || "" };
      }
    }
  }

  // Fallback: check account-level settings for legacy data
  if (lobby.account.settings && typeof lobby.account.settings === "object") {
    const accountSettings = lobby.account.settings as Record<string, unknown>;
    // Fallback: if lobby doesn't have loginPage, check account-level settings (legacy)
    if (loginPageSettings === defaultLoginPageSettings && accountSettings.loginPage && typeof accountSettings.loginPage === "object") {
      loginPageSettings = { ...defaultLoginPageSettings, ...(accountSettings.loginPage as Partial<LoginPageSettings>) };
    }
    // Fallback: if lobby doesn't have theme, check account-level settings (legacy)
    if (themeSettings === defaultDarkTheme && accountSettings.theme && typeof accountSettings.theme === "object") {
      themeSettings = { ...defaultDarkTheme, ...(accountSettings.theme as Partial<ThemeSettings>) };
    }
    // Fallback: if lobby doesn't have social links, check account-level settings (legacy)
    if (!socialLinksSettings && accountSettings.socialLinks && typeof accountSettings.socialLinks === "object") {
      socialLinksSettings = accountSettings.socialLinks as SocialLinksSettings;
    }
    // Fallback: if lobby doesn't have technicalInfo, check account-level settings (legacy)
    if (!technicalInfo && accountSettings.technicalInfo && typeof accountSettings.technicalInfo === "object") {
      const ti = accountSettings.technicalInfo as { title?: string; content?: string };
      if (ti.title || ti.content) {
        technicalInfo = { title: ti.title || "", content: ti.content || "" };
      }
    }
  }

  if (loginPageSettings.logoType === "image" && loginPageSettings.logoImage) {
    loginLogoImageUrl = getPublicUrl(loginPageSettings.logoImage);
  }

  // Resolve `swatch-ref` entries in the persisted theme JSON against the
  // owning account's swatch library. Same shape and treatment as the public
  // lobby renderer so a designer preview matches what visitors see.
  const accountSwatchRows = await prisma.swatch.findMany({
    where: { accountId: lobby.accountId },
    select: { id: true, value: true },
  });
  const accountSwatches: AccountSwatch[] = accountSwatchRows.map((r) => ({
    id: r.id,
    value: r.value as AccountSwatch["value"],
  }));

  const themeVars = generateThemeCSSVars(
    themeSettings,
    accountSwatches as unknown as Parameters<typeof generateThemeCSSVars>[1]
  );
  const cardStyles = buildCardStyles(
    themeSettings,
    accountSwatches as unknown as Parameters<typeof buildCardStyles>[1]
  );
  const bodyBg = getBodyBgCSS(themeSettings, accountSwatches);

  // Helper: resolve a Media record to its public URL
  function mediaUrl(media: { key: string; type: string; embedUrl: string | null } | null | undefined): string | null {
    if (!media) return null;
    return media.type === "EMBED" ? (media.embedUrl || null) : getPublicUrl(media.key);
  }

  const imageUrls: ImageUrls = {
    background: mediaUrl(lobby.backgroundMedia as any),
    backgroundDark: mediaUrl(lobby.backgroundMediaDark as any),
    banner: mediaUrl(lobby.bannerMedia as any),
    bannerDark: mediaUrl(lobby.bannerMediaDark as any),
    profile: mediaUrl(lobby.profileMedia as any),
    profileDark: mediaUrl(lobby.profileMediaDark as any),
  };

  // Normalize tracks
  const tracks = lobby.tracks.map((t) => ({
    id: t.id,
    title: t.title,
    artist: t.artist,
    duration: t.media?.duration ?? t.duration,
    position: t.position,
    filename: t.media?.key ?? t.filename,
    hlsReady: t.media?.hlsReady ?? t.hlsReady,
    waveformPeaks: t.media?.waveformPeaks ?? t.waveformPeaks,
  }));

  // Get autoplay track from lobby settings
  const lobbySettingsObj = (lobby.settings as Record<string, unknown>) || {};
  const autoplayTrackId = (lobbySettingsObj.autoplayTrackId as string) || null;

  return {
    page,
    lobby: {
      id: lobby.id,
      title: lobby.title,
      description: lobby.description,
    },
    account: {
      name: lobby.account.name,
      slug: lobby.account.slug,
    },
    imageUrls,
    tracks,
    autoplayTrackId,
    loginPageSettings,
    loginLogoImageUrl,
    themeVars,
    cardStyles,
    bodyBg,
    socialLinksSettings,
    technicalInfo,
    isDesignerMode: true,
  };
}

export default function DesignerPreview() {
  const data = useLoaderData<typeof loader>();

  // Audio state
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioHook = useHlsAudio(audioRef);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const loadedTrackRef = useRef<string | null>(null);

  // Apply body background from theme settings
  useEffect(() => {
    const bg = data.bodyBg;
    if (bg.startsWith("linear-gradient")) {
      document.body.style.background = bg;
    } else {
      document.body.style.backgroundColor = bg;
    }
    return () => {
      document.body.style.background = "";
      document.body.style.backgroundColor = "";
    };
  }, [data.bodyBg]);

  const tracks: Track[] = data.tracks as Track[];

  // Prefetch the next track
  useTrackPrefetcher({ tracks, currentTrackId: activeTrackId, isPlaying });

  // Load initial track (for lobby page preview)
  const autoplayTrack = data.autoplayTrackId
    ? tracks.find((t) => t.id === data.autoplayTrackId)
    : null;
  const initialTrack = autoplayTrack || tracks[0];
  const initialTrackId = initialTrack?.id;

  useEffect(() => {
    if (!initialTrackId || data.page === "login") return;

    if (loadedTrackRef.current !== initialTrackId) {
      loadedTrackRef.current = initialTrackId;
      const hlsOpts = initialTrack ? {
        hlsReady: (initialTrack as { hlsReady?: boolean }).hlsReady ?? false,
        duration: initialTrack.duration,
        waveformPeaks: (initialTrack as { waveformPeaks?: number[] | null }).waveformPeaks ?? null,
      } : undefined;
      audioHook.loadTrack(initialTrackId, undefined, hlsOpts);
    }
  }, [initialTrackId, data.page]);

  const { lobby, account, imageUrls, loginPageSettings, loginLogoImageUrl, cardStyles, socialLinksSettings, technicalInfo } = data;

  const lp = loginPageSettings;
  const bandName = lobby?.title || account?.name;
  const bandDescription = lobby?.description;

  // Render login page preview
  if (data.page === "login") {
    return (
      <main
        className="min-h-dvh flex items-center justify-center overflow-hidden"
        style={{ backgroundColor: lp.bgColor }}
      >
        <div className="w-full max-w-md p-8">
          <div
            className="rounded-2xl p-8 shadow-2xl border"
            style={{
              backgroundColor: lp.panelBgColor,
              borderColor: lp.panelBorderColor,
            }}
          >
            <div className="text-center mb-8">
              {lp.logoType === "image" && loginLogoImageUrl && (
                <div className="flex justify-center mb-4 w-full">
                  <ResponsiveImage
                    src={loginLogoImageUrl}
                    alt={lp.title || "Logo"}
                    widths={[200, 400, 600, 800]}
                    sizes={`(min-width: 448px) ${Math.round(384 * (lp.logoMaxWidth || 50) / 100)}px, calc((100vw - 64px) * ${(lp.logoMaxWidth || 50) / 100})`}
                    className="object-contain"
                    style={{ maxWidth: `${lp.logoMaxWidth || 50}%` }}
                  />
                </div>
              )}
              {lp.title && (
                <h1 className="text-2xl font-bold" style={{ color: lp.textColor }}>
                  {lp.title}
                </h1>
              )}
              {lp.description && (
                <p className="mt-2" style={{ color: lp.textColor, opacity: 0.7 }}>
                  {lp.description}
                </p>
              )}
            </div>

            {/* Designer mode notice */}
            <div className="mb-6 text-blue-400 text-sm text-center bg-blue-500/10 py-3 px-4 rounded-lg">
              Designer Preview Mode - Login disabled
            </div>

            <div className="space-y-4">
              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium mb-1"
                  style={{ color: lp.textColor, opacity: 0.85 }}
                >
                  Password
                </label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  placeholder="Enter the password"
                  disabled
                  className="w-full px-4 py-3 rounded-lg border focus:outline-none opacity-60 cursor-not-allowed"
                  style={{
                    backgroundColor: "#ffffff",
                    borderColor: lp.panelBorderColor,
                    color: "#111827",
                  }}
                />
              </div>
              <button
                type="button"
                disabled
                className="w-full py-3 px-4 bg-blue-600 text-white font-semibold rounded-lg opacity-60 cursor-not-allowed"
              >
                {lp.buttonLabel || "Enter Lobby"}
              </button>
            </div>
          </div>
        </div>
        <audio ref={audioRef} style={{ display: "none" }} aria-hidden="true" />
      </main>
    );
  }

  // Render lobby page preview
  return (
    <main style={data.themeVars as React.CSSProperties}>
      <PlayerView
        tracks={tracks}
        imageUrls={imageUrls}
        bandName={bandName}
        bandDescription={bandDescription}
        audio={{
          audioRef,
          loadTrack: audioHook.loadTrack,
          isLoading: audioHook.isLoading,
          isSeeking: audioHook.isSeeking,
          loadingProgress: audioHook.loadingProgress,
          isReady: audioHook.isReady,
          seekTo: audioHook.seekTo,
          cancelAutoPlay: audioHook.cancelAutoPlay,
          estimatedDuration: audioHook.estimatedDuration,
          isAllSegmentsCached: audioHook.isAllSegmentsCached,
          blobTimeOffset: audioHook.blobTimeOffset,
          blobHasLastSegment: audioHook.blobHasLastSegment,
          isBlobMode: audioHook.isBlobMode,
          waveformPeaks: audioHook.waveformPeaks,
          isSafari: audioHook.isSafari,
          isExtendingBlobRef: audioHook.isExtendingBlobRef,
          lastSaneTimeRef: audioHook.lastSaneTimeRef,
        }}
        isPlaying={isPlaying}
        onPlayingChange={setIsPlaying}
        onTrackChange={setActiveTrackId}
        cardStyles={cardStyles}
        socialLinksSettings={socialLinksSettings}
        technicalInfo={technicalInfo}
        initialTrackId={data.autoplayTrackId}
        csrfToken=""
        isDesignerMode={true}
      />
      <audio ref={audioRef} style={{ display: "none" }} aria-hidden="true" />
    </main>
  );
}
