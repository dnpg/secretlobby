import { useRef, useState, useEffect } from "react";
import { Form, useLoaderData, useActionData } from "react-router";
import type { Route } from "./+types/_index";
import { resolveTenant, isLocalhost } from "~/lib/subdomain.server";
import { prisma } from "@secretlobby/db";
import { getSession, createSessionResponse } from "@secretlobby/auth";
import { getSiteContent, getSitePassword, type Track as FileTrack } from "~/lib/content.server";
import { getPublicUrl } from "@secretlobby/storage";
import { generatePreloadToken } from "~/lib/token.server";
import { PlayerView, type Track, type ImageUrls } from "~/components/PlayerView";
import type { SocialLinksSettings } from "~/components/SocialLinks";
import { useHlsAudio } from "~/hooks/useHlsAudio";

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

export function meta({ data }: Route.MetaArgs) {
  const title = data?.lobby?.title || data?.account?.name || data?.content?.bandName || "SecretLobby";
  return [
    { title },
    { name: "description", content: data?.lobby?.description || "Private music lobby" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { session } = await getSession(request);

  // Handle localhost development mode
  if (isLocalhost(request)) {
    const content = await getSiteContent();
    const isAuthenticated = session.isAuthenticated;

    return {
      isLocalhost: true,
      content,
      lobby: null,
      account: null,
      requiresPassword: !isAuthenticated,
      isAuthenticated,
      imageUrls: {
        background: null,
        backgroundDark: null,
        banner: null,
        bannerDark: null,
        profile: null,
        profileDark: null,
      } satisfies ImageUrls,
      tracks: isAuthenticated ? content.playlist : [],
      preloadTrackId: null,
      preloadToken: null,
      notFound: false,
      loginPageSettings: defaultLoginPageSettings,
      loginLogoImageUrl: null,
      themeVars: generateThemeCSSVars(defaultTheme),
      cardStyles: computeCardStyles(defaultTheme),
      bodyBg: getBodyBgCSS(defaultTheme),
      socialLinksSettings: null as SocialLinksSettings | null,
      technicalInfo: null as { title: string; content: string } | null,
    };
  }

  // Resolve tenant from subdomain or custom domain
  const tenant = await resolveTenant(request);

  // If no tenant found, show a generic landing
  if (!tenant.account || !tenant.lobby) {
    return {
      isLocalhost: false,
      content: null,
      lobby: null,
      account: null,
      requiresPassword: false,
      isAuthenticated: false,
      imageUrls: {
        background: null,
        backgroundDark: null,
        banner: null,
        bannerDark: null,
        profile: null,
        profileDark: null,
      } satisfies ImageUrls,
      tracks: [],
      preloadTrackId: null,
      preloadToken: null,
      notFound: true,
      loginPageSettings: defaultLoginPageSettings,
      loginLogoImageUrl: null,
      themeVars: generateThemeCSSVars(defaultTheme),
      cardStyles: computeCardStyles(defaultTheme),
      bodyBg: getBodyBgCSS(defaultTheme),
      socialLinksSettings: null as SocialLinksSettings | null,
      technicalInfo: null as { title: string; content: string } | null,
    };
  }

  const { account, lobby } = tenant;

  // Check if lobby requires password and user is authenticated
  const isAuthenticated =
    session.isAuthenticated && session.lobbyId === lobby.id;

  const needsPassword = !!lobby.password && !isAuthenticated;

  // Extract login page, theme, and social links settings from account
  let loginPageSettings: LoginPageSettings = defaultLoginPageSettings;
  let loginLogoImageUrl: string | null = null;
  let themeSettings: ThemeSettings = defaultTheme;
  let socialLinksSettings: SocialLinksSettings | null = null;
  let technicalInfo: { title: string; content: string } | null = null;

  if (account.settings && typeof account.settings === "object") {
    const accountSettings = account.settings as Record<string, unknown>;
    if (accountSettings.loginPage && typeof accountSettings.loginPage === "object") {
      loginPageSettings = { ...defaultLoginPageSettings, ...(accountSettings.loginPage as Partial<LoginPageSettings>) };
    }
    if (accountSettings.theme && typeof accountSettings.theme === "object") {
      themeSettings = { ...defaultTheme, ...(accountSettings.theme as Partial<ThemeSettings>) };
    }
    if (accountSettings.socialLinks && typeof accountSettings.socialLinks === "object") {
      socialLinksSettings = accountSettings.socialLinks as SocialLinksSettings;
    }
    if (accountSettings.technicalInfo && typeof accountSettings.technicalInfo === "object") {
      const ti = accountSettings.technicalInfo as { title?: string; content?: string };
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

  // Fetch lobby with media relations for image URL resolution
  const lobbyWithMedia = await prisma.lobby.findUnique({
    where: { id: lobby.id },
    include: {
      backgroundMedia: true,
      backgroundMediaDark: true,
      bannerMedia: true,
      bannerMediaDark: true,
      profileMedia: true,
      profileMediaDark: true,
    },
  });

  // Helper: resolve a Media record to its public URL
  function mediaUrl(media: { key: string; type: string; embedUrl: string | null } | null | undefined): string | null {
    if (!media) return null;
    return media.type === "EMBED" ? (media.embedUrl || null) : getPublicUrl(media.key);
  }

  const imageUrls: ImageUrls = {
    background: mediaUrl(lobbyWithMedia?.backgroundMedia),
    backgroundDark: mediaUrl(lobbyWithMedia?.backgroundMediaDark),
    banner: mediaUrl(lobbyWithMedia?.bannerMedia),
    bannerDark: mediaUrl(lobbyWithMedia?.bannerMediaDark),
    profile: mediaUrl(lobbyWithMedia?.profileMedia),
    profileDark: mediaUrl(lobbyWithMedia?.profileMediaDark),
  };

  // Fetch tracks only if authenticated (but get first track ID for preloading)
  let preloadTrackId: string | null = null;
  let preloadToken: string | null = null;

  const rawTracks = needsPassword
    ? []
    : await prisma.track.findMany({
        where: { lobbyId: lobby.id },
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
      });

  // Normalize: prefer media-level values over legacy track-level values
  const tracks = rawTracks.map((t) => ({
    id: t.id,
    title: t.title,
    artist: t.artist,
    duration: t.media?.duration ?? t.duration,
    position: t.position,
    filename: t.media?.key ?? t.filename,
    hlsReady: t.media?.hlsReady ?? t.hlsReady,
    waveformPeaks: t.media?.waveformPeaks ?? t.waveformPeaks,
  }));

  // If password required, find first track for preloading
  if (needsPassword) {
    const firstTrack = await prisma.track.findFirst({
      where: { lobbyId: lobby.id },
      orderBy: { position: "asc" },
      select: { id: true },
    });
    if (firstTrack) {
      preloadTrackId = firstTrack.id;
      preloadToken = generatePreloadToken(firstTrack.id, lobby.id);
    }
  }

  return {
    isLocalhost: false,
    content: null,
    lobby: {
      id: lobby.id,
      title: lobby.title,
      description: lobby.description,
    },
    account: {
      name: account.name,
      slug: account.slug,
    },
    requiresPassword: needsPassword,
    isAuthenticated: !needsPassword,
    imageUrls,
    tracks,
    preloadTrackId,
    preloadToken,
    notFound: false,
    loginPageSettings,
    loginLogoImageUrl,
    themeVars,
    cardStyles,
    bodyBg,
    socialLinksSettings,
    technicalInfo,
  };
}

export async function action({ request }: Route.ActionArgs) {
  // Handle localhost development mode
  if (isLocalhost(request)) {
    const formData = await request.formData();
    const password = formData.get("password") as string;
    const sitePassword = await getSitePassword();

    if (password === sitePassword) {
      return createSessionResponse({ isAuthenticated: true }, request, "/");
    }
    return { error: "Invalid password" };
  }

  const tenant = await resolveTenant(request);

  if (!tenant.lobby) {
    return { error: "Lobby not found" };
  }

  const formData = await request.formData();
  const password = formData.get("password") as string;

  // Verify password
  if (password !== tenant.lobby.password) {
    return { error: "Invalid password" };
  }

  // Create authenticated session for this lobby
  return createSessionResponse(
    {
      isAuthenticated: true,
      lobbyId: tenant.lobby.id,
    },
    request,
    "/"
  );
}

export default function LobbyIndex() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  // Audio state lives here so it persists across login → player transition
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioHook = useHlsAudio(audioRef);
  const [isPlaying, setIsPlaying] = useState(false);
  const loadedTrackRef = useRef<string | null>(null);
  const wasAuthenticatedRef = useRef(!data.requiresPassword);

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

  // Resolve tracks for both localhost and multi-tenant
  const tracks: Track[] = data.isLocalhost
    ? (data.content?.playlist || []).map((t: FileTrack) => ({
        id: t.id,
        title: t.title,
        artist: t.artist,
        filename: t.filename,
      }))
    : (data.tracks as Track[]);

  // Stop audio on logout (authenticated → unauthenticated transition)
  useEffect(() => {
    if (data.requiresPassword && wasAuthenticatedRef.current) {
      audioRef.current?.pause();
      audioHook.cleanup();
      setIsPlaying(false);
      loadedTrackRef.current = null;
    }
    wasAuthenticatedRef.current = !data.requiresPassword;
  }, [data.requiresPassword]);

  // Preload the first track on the password page (before authentication)
  useEffect(() => {
    if (data.requiresPassword && data.preloadTrackId && data.preloadToken && !loadedTrackRef.current) {
      loadedTrackRef.current = data.preloadTrackId;
      audioHook.loadTrack(data.preloadTrackId, data.preloadToken, { hlsReady: true });
    }
  }, [data.requiresPassword, data.preloadTrackId, data.preloadToken]);

  // After login: continue downloading remaining segments or load from scratch
  const firstTrack = tracks[0];
  const firstTrackId = firstTrack?.id;
  useEffect(() => {
    if (!firstTrackId || data.requiresPassword) return;

    if (loadedTrackRef.current === firstTrackId) {
      // Track was preloaded — resume with session auth
      audioHook.continueDownload();
    } else {
      // No preload — load from scratch
      loadedTrackRef.current = firstTrackId;
      const hlsOpts = firstTrack ? {
        hlsReady: (firstTrack as { hlsReady?: boolean }).hlsReady ?? false,
        duration: firstTrack.duration,
        waveformPeaks: (firstTrack as { waveformPeaks?: number[] | null }).waveformPeaks ?? null,
      } : undefined;
      audioHook.loadTrack(firstTrackId, undefined, hlsOpts);
    }
  }, [firstTrackId, data.requiresPassword]);

  // Auto-play when the first track becomes ready and user is authenticated
  useEffect(() => {
    if (audioHook.isReady && !data.requiresPassword && !isPlaying) {
      audioRef.current?.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  }, [audioHook.isReady, data.requiresPassword]);

  // Not found state
  if (data.notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4">Lobby Not Found</h1>
          <p className="text-gray-400">
            This lobby doesn't exist or hasn't been set up yet.
          </p>
        </div>
      </div>
    );
  }

  const { lobby, account, requiresPassword, isLocalhost, content, imageUrls, loginPageSettings, loginLogoImageUrl, cardStyles, socialLinksSettings, technicalInfo } = data;

  // Compute content based on authentication state
  const lp = loginPageSettings;
  const loginTitle = lp.title || null;
  const loginDescription = lp.description || null;
  const bandName = isLocalhost ? content?.bandName : (lobby?.title || account?.name);
  const bandDescription = isLocalhost ? content?.bandDescription : lobby?.description;

  // Single return with conditional content - audio element always at the same position
  return (
    <>
      {requiresPassword ? (
        // Login page content
        <div
          className="min-h-screen flex items-center justify-center"
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
                    <img src={loginLogoImageUrl} alt="" className="max-w-[180px] max-h-[60px] object-contain" />
                  </div>
                )}
                {loginTitle && (
                  <h1 className="text-2xl font-bold" style={{ color: lp.textColor }}>
                    {loginTitle}
                  </h1>
                )}
                {loginDescription && (
                  <p className="mt-2" style={{ color: lp.textColor, opacity: 0.7 }}>
                    {loginDescription}
                  </p>
                )}
              </div>

              {actionData?.error && (
                <div className="mb-6 text-red-400 text-sm text-center bg-red-500/10 py-3 px-4 rounded-lg">
                  {actionData.error}
                </div>
              )}

              <Form method="post" className="space-y-4">
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
                    required
                    autoFocus
                    className="w-full px-4 py-3 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500"
                    style={{
                      backgroundColor: "#ffffff",
                      borderColor: lp.panelBorderColor,
                      color: "#111827",
                    }}
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-3 px-4 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  {lp.buttonLabel || "Enter Lobby"}
                </button>
              </Form>
            </div>
          </div>
        </div>
      ) : (
        // Authenticated player content
        <div style={data.themeVars as React.CSSProperties}>
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
              isExtendingBlobRef: audioHook.isExtendingBlobRef,
              lastSaneTimeRef: audioHook.lastSaneTimeRef,
            }}
            isPlaying={isPlaying}
            onPlayingChange={setIsPlaying}
            cardStyles={cardStyles}
            socialLinksSettings={socialLinksSettings}
            technicalInfo={technicalInfo}
          />
        </div>
      )}
      {/* Audio element - always rendered in the same position to persist across login */}
      <audio ref={audioRef} style={{ display: "none" }} />
    </>
  );
}
