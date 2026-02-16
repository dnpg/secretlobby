import { useRef, useState, useEffect } from "react";
import { Form, useLoaderData, useActionData } from "react-router";
import type { Route } from "./+types/api.designer-preview";
import { prisma } from "@secretlobby/db";
import { validateDesignerToken, type DesignerPage } from "@secretlobby/auth";
import { getPublicUrl } from "@secretlobby/storage";
import { PlayerView, type Track, type ImageUrls } from "~/components/PlayerView";
import type { SocialLinksSettings } from "~/components/SocialLinks";
import { useHlsAudio } from "~/hooks/useHlsAudio";
import { useTrackPrefetcher } from "~/hooks/useTrackPrefetcher";

interface LoginPageSettings {
  title: string;
  description: string;
  logoType: "svg" | "image" | null;
  logoSvg: string;
  logoImage: string;
  bgColor: string;
  panelBgColor: string;
  panelBorderColor: string;
  textColor: string;
  buttonLabel: string;
}

const defaultLoginPageSettings: LoginPageSettings = {
  title: "",
  description: "",
  logoType: null,
  logoSvg: "",
  logoImage: "",
  bgColor: "#111827",
  panelBgColor: "#1f2937",
  panelBorderColor: "#374151",
  textColor: "#ffffff",
  buttonLabel: "Enter Lobby",
};

interface ThemeSettings {
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  primary: string;
  primaryHover: string;
  primaryText: string;
  secondary: string;
  secondaryHover: string;
  secondaryText: string;
  accent: string;
  visualizerBg: string;
  visualizerBgOpacity: number;
  visualizerBar: string;
  visualizerBarAlt: string;
  visualizerGlow: string;
  visualizerUseCardBg: boolean;
  visualizerBorderShow: boolean;
  visualizerBorderColor: string;
  visualizerBorderRadius: number;
  visualizerBlendMode: string;
  visualizerType: "equalizer" | "waveform";
  cardHeadingColor: string;
  cardContentColor: string;
  cardMutedColor: string;
  cardBgType: "solid" | "gradient";
  cardBgColor: string;
  cardBgGradientFrom: string;
  cardBgGradientTo: string;
  cardBgGradientAngle: number;
  cardBgOpacity: number;
  cardBorderShow: boolean;
  cardBorderType: "solid" | "gradient";
  cardBorderColor: string;
  cardBorderGradientFrom: string;
  cardBorderGradientTo: string;
  cardBorderGradientAngle: number;
  cardBorderOpacity: number;
  cardBorderWidth: string;
  cardBorderRadius: number;
  buttonBorderRadius: number;
  playButtonBorderRadius: number;
}

const defaultTheme: ThemeSettings = {
  bgPrimary: "#030712",
  bgSecondary: "#111827",
  bgTertiary: "#1f2937",
  textPrimary: "#ffffff",
  textSecondary: "#9ca3af",
  textMuted: "#6b7280",
  border: "#374151",
  primary: "#ffffff",
  primaryHover: "#e5e7eb",
  primaryText: "#111827",
  secondary: "#1f2937",
  secondaryHover: "#374151",
  secondaryText: "#ffffff",
  accent: "#ffffff",
  visualizerBg: "#111827",
  visualizerBgOpacity: 0,
  visualizerBar: "#ffffff",
  visualizerBarAlt: "#9ca3af",
  visualizerGlow: "#ffffff",
  visualizerUseCardBg: false,
  visualizerBorderShow: false,
  visualizerBorderColor: "#374151",
  visualizerBorderRadius: 8,
  visualizerBlendMode: "normal",
  visualizerType: "equalizer",
  cardHeadingColor: "#ffffff",
  cardContentColor: "#9ca3af",
  cardMutedColor: "#6b7280",
  cardBgType: "solid",
  cardBgColor: "#111827",
  cardBgGradientFrom: "#1f2937",
  cardBgGradientTo: "#111827",
  cardBgGradientAngle: 135,
  cardBgOpacity: 50,
  cardBorderShow: true,
  cardBorderType: "solid",
  cardBorderColor: "#374151",
  cardBorderGradientFrom: "#374151",
  cardBorderGradientTo: "#1f2937",
  cardBorderGradientAngle: 135,
  cardBorderOpacity: 100,
  cardBorderWidth: "1px",
  cardBorderRadius: 12,
  buttonBorderRadius: 24,
  playButtonBorderRadius: 50,
};

function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    return `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, ${alpha})`;
  }
  return `rgba(0, 0, 0, ${alpha})`;
}

function getCardBgCSS(theme: ThemeSettings): string {
  const opacity = (theme.cardBgOpacity ?? 50) / 100;
  if (theme.cardBgType === "gradient") {
    const from = hexToRgba(theme.cardBgGradientFrom, opacity);
    const to = hexToRgba(theme.cardBgGradientTo, opacity);
    return `linear-gradient(${theme.cardBgGradientAngle ?? 135}deg, ${from}, ${to})`;
  }
  return hexToRgba(theme.cardBgColor || theme.bgSecondary, opacity);
}

function getBodyBgCSS(theme: ThemeSettings): string {
  if (theme.cardBgType === "gradient") {
    return `linear-gradient(${theme.cardBgGradientAngle ?? 135}deg, ${theme.cardBgGradientFrom}, ${theme.cardBgGradientTo})`;
  }
  return theme.bgPrimary;
}

interface CardStyles {
  bg: string;
  bgIsGradient: boolean;
  borderType: "none" | "solid" | "gradient";
  borderSolid: string;
  borderGradient: string;
  borderWidth: string;
  headingColor: string;
  contentColor: string;
  mutedColor: string;
  visualizerUseCardBg: boolean;
  visualizerBorderShow: boolean;
  visualizerBorderColor: string;
  visualizerBorderRadius: number;
  visualizerBlendMode: string;
  visualizerType: "equalizer" | "waveform";
  cardBorderRadius: number;
  buttonBorderRadius: number;
  playButtonBorderRadius: number;
}

function normalizeCSSValue(value: string | undefined, fallback: string): string {
  if (value === undefined || value === null || value === "") return fallback;
  const str = String(value).trim();
  if (!str) return fallback;
  if (/^[\d.]+$/.test(str)) return `${str}px`;
  return str;
}

function computeCardStyles(theme: ThemeSettings): CardStyles {
  const bg = getCardBgCSS(theme);
  const borderWidth = normalizeCSSValue(theme.cardBorderWidth, "1px");
  const opacity = (theme.cardBorderOpacity ?? 100) / 100;

  let borderType: "none" | "solid" | "gradient" = "none";
  let borderSolid = "";
  let borderGradient = "";

  if (theme.cardBorderShow) {
    if (theme.cardBorderType === "gradient") {
      borderType = "gradient";
      const from = hexToRgba(theme.cardBorderGradientFrom, opacity);
      const to = hexToRgba(theme.cardBorderGradientTo, opacity);
      borderGradient = `linear-gradient(${theme.cardBorderGradientAngle ?? 135}deg, ${from}, ${to})`;
    } else {
      borderType = "solid";
      borderSolid = `${borderWidth} solid ${hexToRgba(theme.cardBorderColor || theme.border, opacity)}`;
    }
  }

  return {
    bg,
    bgIsGradient: theme.cardBgType === "gradient",
    borderType,
    borderSolid,
    borderGradient,
    borderWidth,
    headingColor: theme.cardHeadingColor || theme.textPrimary,
    contentColor: theme.cardContentColor || theme.textSecondary,
    mutedColor: theme.cardMutedColor || theme.textMuted,
    visualizerUseCardBg: theme.visualizerUseCardBg ?? false,
    visualizerBorderShow: theme.visualizerBorderShow ?? false,
    visualizerBorderColor: theme.visualizerBorderColor || theme.border,
    visualizerBorderRadius: theme.visualizerBorderRadius ?? 8,
    visualizerBlendMode: theme.visualizerBlendMode || "normal",
    visualizerType: theme.visualizerType || "equalizer",
    cardBorderRadius: theme.cardBorderRadius ?? 12,
    buttonBorderRadius: theme.buttonBorderRadius ?? 24,
    playButtonBorderRadius: theme.playButtonBorderRadius ?? 50,
  };
}

function generateThemeCSSVars(theme: ThemeSettings): Record<string, string> {
  return {
    "--color-bg-primary": theme.bgPrimary,
    "--color-bg-secondary": theme.bgSecondary,
    "--color-bg-tertiary": theme.bgTertiary,
    "--color-text-primary": theme.textPrimary,
    "--color-text-secondary": theme.textSecondary,
    "--color-text-muted": theme.textMuted,
    "--color-border": theme.border,
    "--color-primary": theme.primary,
    "--color-primary-hover": theme.primaryHover,
    "--color-primary-text": theme.primaryText,
    "--color-secondary": theme.secondary,
    "--color-secondary-hover": theme.secondaryHover,
    "--color-secondary-text": theme.secondaryText,
    "--color-accent": theme.accent,
    "--color-visualizer-bg": theme.visualizerBg,
    "--color-visualizer-bg-opacity": String(theme.visualizerBgOpacity / 100),
    "--color-visualizer-bar": theme.visualizerBar,
    "--color-visualizer-bar-alt": theme.visualizerBarAlt,
    "--color-visualizer-glow": theme.visualizerGlow,
  };
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
  let themeSettings: ThemeSettings = defaultTheme;
  let socialLinksSettings: SocialLinksSettings | null = null;
  let technicalInfo: { title: string; content: string } | null = null;

  if (lobby.settings && typeof lobby.settings === "object") {
    const lobbySettings = lobby.settings as Record<string, unknown>;
    if (lobbySettings.loginPage && typeof lobbySettings.loginPage === "object") {
      loginPageSettings = { ...defaultLoginPageSettings, ...(lobbySettings.loginPage as Partial<LoginPageSettings>) };
    }
    if (lobbySettings.theme && typeof lobbySettings.theme === "object") {
      themeSettings = { ...defaultTheme, ...(lobbySettings.theme as Partial<ThemeSettings>) };
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

  if (loginPageSettings.logoType === "image" && loginPageSettings.logoImage) {
    loginLogoImageUrl = getPublicUrl(loginPageSettings.logoImage);
  }

  const themeVars = generateThemeCSSVars(themeSettings);
  const cardStyles = computeCardStyles(themeSettings);
  const bodyBg = getBodyBgCSS(themeSettings);

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
                <div className="flex justify-center mb-4">
                  <img src={loginLogoImageUrl} alt={lp.title || "Logo"} className="max-w-[180px] max-h-[60px] object-contain" />
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
