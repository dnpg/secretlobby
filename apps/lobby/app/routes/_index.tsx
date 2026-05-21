import { useRef, useState, useEffect } from "react";
import { useLoaderData, useActionData } from "react-router";
import type { Route } from "./+types/_index";
import { resolveTenant, isLocalhost, getPreviewCookieHeader } from "~/lib/subdomain.server";
import { prisma } from "@secretlobby/db";
import { getSession, createSessionResponse, authenticateForLobby, isAuthenticatedForLobby } from "@secretlobby/auth";
import {
  getSiteContent,
  getSitePassword,
  getSwatchesByAccountId,
  type AccountSwatch,
  type Track as FileTrack,
} from "~/lib/content.server";
import { getPublicUrl } from "@secretlobby/storage";
import {
  backgroundToCSS,
  defaultDarkTheme,
  generateThemeCSSVars,
  normalizeThemeBackground,
  type BackgroundImageTransform,
  type ThemeSettings,
} from "@secretlobby/theme";
import { transformUrl as baseTransformUrl } from "@secretlobby/ui";
import { generatePreloadToken } from "~/lib/token.server";
import {
  BlockView,
  buildCardStyles,
  LoginAutoplayToggle,
  LoginPanel,
  LogoutButton,
  setAnalyticsContext,
  StandalonePlayerBlock,
  PreviewBar,
  SectionView,
  SecretLobbyFooter,
  trackEvent,
  type ImageUrls,
  type LoginPageSettings,
  type PlayerBlockContent,
  type Section,
  type SocialLinksSettings,
  type Track,
} from "@secretlobby/lobby-template";

// PlayerView image-urls payload for the page-builder render path. The
// banner / background / profile images live on the lobby record but in
// section-based layouts they belong in their own Image blocks — letting
// PlayerView paint its own banner here would duplicate whatever the
// designer dropped into the layout as an Image block. Same shape /
// reasoning as `EMPTY_IMAGE_URLS` in the editor's PlayerBlock
// (apps/console/.../PlayerBlock.tsx).
const EMPTY_IMAGE_URLS = {
  background: null,
  backgroundDark: null,
  banner: null,
  bannerDark: null,
  profile: null,
  profileDark: null,
} satisfies ImageUrls;

// Default page-builder layout for lobbies that haven't been edited in the
// page-builder yet (no `lobby.settings.pageLayout` saved). One section, one
// full-width column, one full-variant player block. Drops cleanly into the
// same SectionView + BlockView pipeline as a saved layout, so the lobby's
// render path is uniform — saved layouts and the default both flow through
// PlayerBlockView with the same audio + track wiring.
//
// `playlistId` is intentionally empty: the lobby still loads a single track
// list per page, and PlayerBlockView ignores playlistId for now. Once
// multi-playlist support lands the loader will resolve this against a
// canonical "main" playlist.
const DEFAULT_LOBBY_PAGE_LAYOUT: { sections: Section[]; version: number } = {
  version: 1,
  sections: [
    {
      id: "default-section",
      columns: [
        {
          id: "default-column",
          width: "100%",
          blocks: [
            {
              id: "default-player",
              type: "player",
              content: {
                playlistId: "",
                variant: "full",
                showVisualizer: true,
                showPlaylist: true,
                autoplay: true,
              },
            },
          ],
        },
      ],
      rowGap: "0",
      columnGap: "0",
      mobileLayout: "stack",
    },
  ],
};

// Body background — what the lobby paints behind the `<main>` content so the
// area around shorter pages still picks up the theme. When the card surface
// is a gradient, the body mirrors that gradient (matches the old behaviour);
// otherwise it falls through to the canonical layered-background helper from
// `@secretlobby/theme`. AccountSwatch[] is a structural subset of the
// package's ThemeSwatch[], hence the cast.
function getBodyBgCSS(
  theme: ThemeSettings,
  swatches?: AccountSwatch[],
  transformUrl?: BackgroundImageTransform
): string {
  if (theme.cardBgType === "gradient") {
    return `linear-gradient(${theme.cardBgGradientAngle ?? 135}deg, ${theme.cardBgGradientFrom}, ${theme.cardBgGradientTo})`;
  }
  return backgroundToCSS(
    normalizeThemeBackground(theme),
    swatches as unknown as Parameters<typeof backgroundToCSS>[1],
    undefined,
    transformUrl
  );
}

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


export function meta({ data }: Route.MetaArgs) {
  const title = data?.lobby?.title || data?.account?.name || data?.content?.bandName || "SecretLobby";
  return [
    { title },
    { name: "description", content: data?.lobby?.description || "Private music lobby" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { session } = await getSession(request);
  const { getCsrfToken } = await import("@secretlobby/auth");
  const csrfToken = await getCsrfToken(request);

  // Handle localhost development mode
  if (isLocalhost(request)) {
    const content = await getSiteContent();
    const isAuthenticated = session.isAuthenticated;

    return {
      isLocalhost: true,
      content,
      // Synthetic lobby for localhost dev so the analytics beacon has a
      // stable identifier to ship — matches the "localhost-lobby" sentinel
      // already used by the action handler's rate-limit calls (line ~704).
      lobby: {
        id: "localhost-lobby",
        title: null as string | null,
        description: null as string | null,
        hasPassword: false,
      },
      account: null,
      requiresPassword: !isAuthenticated,
      isAuthenticated,
      isPreview: false,
      imageUrls: {
        background: null,
        backgroundDark: null,
        banner: null,
        bannerDark: null,
        profile: null,
        profileDark: null,
      } satisfies ImageUrls,
      tracks: isAuthenticated ? content.playlist : [],
      autoplayTrackId: null,
      pageWantsAutoplay: true,
      preloadTrackId: null,
      preloadToken: null,
      preloadTrackMeta: null,
      notFound: false,
      loginPageSettings: defaultLoginPageSettings,
      loginLogoImageUrl: null,
      loginLogoImageWidth: null,
      loginLogoImageHeight: null,
      themeVars: generateThemeCSSVars(defaultDarkTheme),
      cardStyles: buildCardStyles(defaultDarkTheme),
      bodyBg: getBodyBgCSS(defaultDarkTheme),
      socialLinksSettings: null as SocialLinksSettings | null,
      technicalInfo: null as { title: string; content: string } | null,
      gaTrackingId: null as string | null,
      gtmContainerId: null as string | null,
      csrfToken,
      pageLayout: null as null,
      themeSettings: defaultDarkTheme,
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
      isPreview: false,
      imageUrls: {
        background: null,
        backgroundDark: null,
        banner: null,
        bannerDark: null,
        profile: null,
        profileDark: null,
      } satisfies ImageUrls,
      tracks: [],
      autoplayTrackId: null,
      pageWantsAutoplay: true,
      preloadTrackId: null,
      preloadToken: null,
      preloadTrackMeta: null,
      notFound: true,
      loginPageSettings: defaultLoginPageSettings,
      loginLogoImageUrl: null,
      loginLogoImageWidth: null,
      loginLogoImageHeight: null,
      themeVars: generateThemeCSSVars(defaultDarkTheme),
      cardStyles: buildCardStyles(defaultDarkTheme),
      bodyBg: getBodyBgCSS(defaultDarkTheme),
      socialLinksSettings: null as SocialLinksSettings | null,
      technicalInfo: null as { title: string; content: string } | null,
      gaTrackingId: null as string | null,
      gtmContainerId: null as string | null,
      csrfToken,
      pageLayout: null as null,
      themeSettings: defaultDarkTheme,
    };
  }

  const { account, lobby } = tenant;

  // Check if lobby requires password and user is authenticated for THIS specific lobby
  const isAuthenticated = isAuthenticatedForLobby(session, lobby.id);

  const needsPassword = !!lobby.password && !isAuthenticated;

  // Extract per-lobby settings from lobby.settings
  let loginPageSettings: LoginPageSettings = defaultLoginPageSettings;
  let loginLogoImageUrl: string | null = null;
  let themeSettings: ThemeSettings = defaultDarkTheme;
  let socialLinksSettings: SocialLinksSettings | null = null;
  let technicalInfo: { title: string; content: string } | null = null;
  let gaTrackingId: string | null = null;
  let gtmContainerId: string | null = null;
  // Page-builder saved layout — `null` when the lobby hasn't been edited in
  // the page-builder yet. The render path constructs a default
  // single-section-with-a-player-block layout in that case so every lobby
  // still paints content.
  let pageLayout: { sections: unknown[]; version: number } | null = null;

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
    // Page-builder layout — the editor writes
    // `{ sections: Section[], version: number }` here on every save. We
    // accept anything with a sections array; the render side coerces it
    // through `@secretlobby/lobby-template`'s Section type at the boundary.
    if (
      lobbySettings.pageLayout &&
      typeof lobbySettings.pageLayout === "object"
    ) {
      const pl = lobbySettings.pageLayout as Record<string, unknown>;
      if (Array.isArray(pl.sections)) {
        pageLayout = {
          sections: pl.sections,
          version: typeof pl.version === "number" ? pl.version : 1,
        };
      }
    }
  }

  // Read global settings from account.settings (Google Analytics, and fallback for legacy settings)
  if (account.settings && typeof account.settings === "object") {
    const accountSettings = account.settings as Record<string, unknown>;
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
    if (accountSettings.googleAnalytics && typeof accountSettings.googleAnalytics === "object") {
      const ga = accountSettings.googleAnalytics as { trackingId?: string; gtmContainerId?: string };
      if (ga.trackingId) {
        gaTrackingId = ga.trackingId;
      }
      // Only expose GTM on custom domains for security
      if (ga.gtmContainerId && tenant.isCustomDomain) {
        gtmContainerId = ga.gtmContainerId;
      }
    }
  }
  let loginLogoImageWidth: number | null = null;
  let loginLogoImageHeight: number | null = null;
  if (loginPageSettings.logoType === "image" && loginPageSettings.logoImage) {
    loginLogoImageUrl = getPublicUrl(loginPageSettings.logoImage);
    // Look up intrinsic dimensions so the rendered <img> carries width/height
    // attrs — the browser reserves the right aspect-ratio box before the
    // bitmap loads, killing layout shift on first paint.
    const logoMedia = await prisma.media.findFirst({
      where: { key: loginPageSettings.logoImage, accountId: account.id },
      select: { width: true, height: true },
    });
    loginLogoImageWidth = logoMedia?.width ?? null;
    loginLogoImageHeight = logoMedia?.height ?? null;
  }

  // Resolve any swatch-ref entries in the persisted theme JSON. Swatches are
  // per-account so we fetch the full list once and thread it into the CSS
  // generators.
  const accountSwatches = await getSwatchesByAccountId(account.id);

  // Bind the URL transform pattern from env so background CSS emits a
  // resolution-aware `image-set(url(@1x) 1x, url(@2x) 2x)` for the lobby's
  // body bg image. Without an env pattern this stays a passthrough and the
  // emitted CSS keeps using a plain `url(...)`.
  const imageTransformPattern =
    process.env.IMAGE_TRANSFORM_PATTERN || "{url}";
  const bgTransformUrl: BackgroundImageTransform = (src, { width }) =>
    baseTransformUrl(src, { width }, imageTransformPattern);

  const themeVars = generateThemeCSSVars(
    themeSettings,
    accountSwatches as unknown as Parameters<typeof generateThemeCSSVars>[1],
    undefined,
    bgTransformUrl
  );
  const cardStyles = buildCardStyles(
    themeSettings,
    accountSwatches as unknown as Parameters<typeof buildCardStyles>[1]
  );
  const bodyBg = getBodyBgCSS(themeSettings, accountSwatches, bgTransformUrl);

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

  // Scope the track query to the playlistIds the saved layout actually
  // references. A lobby can have multiple playlists (Phase 6 made tracks
  // `playlistId`-owned), and each player block stores its own
  // `content.playlistId`; querying by `lobbyId` alone returns the union
  // across every playlist, which visibly duplicates rows when the page has
  // more than one player block — or even just makes a single block render
  // tracks that belong to a different playlist.
  //
  // We walk the saved pageLayout (when present), collect every player
  // block's `playlistId`, and filter the track query to that exact set. The
  // tracks are then tagged with their owning `playlistId` so the component-
  // side `renderPlayer(content)` can slice the right subset per block.
  //
  // Legacy fallback: when no pageLayout is saved (or its player blocks have
  // no playlistId — pre-Phase-6 layout shape), we fall back to the lobby's
  // `isDefault` playlist if one exists, then to the page-wide `lobbyId`
  // query as a last resort so very old lobbies still render their tracks.
  const requiredPlaylistIds = new Set<string>();
  if (pageLayout && Array.isArray(pageLayout.sections)) {
    for (const section of pageLayout.sections) {
      if (!section || typeof section !== "object") continue;
      const cols = (section as { columns?: unknown }).columns;
      if (!Array.isArray(cols)) continue;
      for (const col of cols) {
        if (!col || typeof col !== "object") continue;
        const blocks = (col as { blocks?: unknown }).blocks;
        if (!Array.isArray(blocks)) continue;
        for (const block of blocks) {
          if (
            block &&
            typeof block === "object" &&
            (block as { type?: unknown }).type === "player"
          ) {
            const content = (block as { content?: unknown }).content;
            const pid = (content as { playlistId?: unknown } | null)?.playlistId;
            if (typeof pid === "string" && pid !== "") {
              requiredPlaylistIds.add(pid);
            }
          }
        }
      }
    }
  }
  const fallbackDefaultPlaylist =
    !needsPassword && requiredPlaylistIds.size === 0
      ? await prisma.playlist.findFirst({
          where: { lobbyId: lobby.id, isDefault: true },
          select: { id: true },
        })
      : null;
  const trackWhere = needsPassword
    ? null
    : requiredPlaylistIds.size > 0
      ? { playlistId: { in: Array.from(requiredPlaylistIds) } }
      : fallbackDefaultPlaylist
        ? { playlistId: fallbackDefaultPlaylist.id }
        : { lobbyId: lobby.id };

  const rawTracks = trackWhere
    ? await prisma.track.findMany({
        where: trackWhere,
        orderBy: { position: "asc" },
        select: {
          id: true,
          title: true,
          artist: true,
          duration: true,
          position: true,
          playlistId: true,
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
          // Per-track cover image. Surfaced as a public URL on the wire
          // `Track` shape so the PlayerBlock's `showTrackImage` toggle can
          // render each row's thumbnail. Selected unconditionally because the
          // page can host multiple PlayerBlocks with different toggle values;
          // hiding the field at the server layer would force a re-query when
          // one of them opts in.
          coverMedia: {
            select: { key: true },
          },
        },
      })
    : [];

  // Normalize: prefer media-level values over legacy track-level values
  const tracks = rawTracks.map((t) => ({
    id: t.id,
    title: t.title,
    artist: t.artist,
    duration: t.media?.duration ?? t.duration,
    position: t.position,
    // Tag with owning playlist id so the component-side renderPlayer can
    // slice the page-level track list down to the subset belonging to the
    // block's `content.playlistId`.
    playlistId: t.playlistId,
    filename: t.media?.key ?? t.filename,
    hlsReady: t.media?.hlsReady ?? t.hlsReady,
    waveformPeaks: t.media?.waveformPeaks ?? t.waveformPeaks,
    // Public URL of the cover, or null when the track has no cover assigned.
    // The PlayerView playlist render uses this when the PlayerBlock's
    // `showTrackImage` toggle is on.
    image: t.coverMedia ? getPublicUrl(t.coverMedia.key) : null,
  }));

  // Get autoplay track from lobby settings (or default to first track)
  const lobbySettings = (lobby.settings as Record<string, unknown>) || {};
  const autoplayTrackId = (lobbySettings.autoplayTrackId as string) || null;

  // Per-block autoplay intent — when EVERY player block on the page has
  // `content.autoplay === false`, the lobby must NOT auto-play on load.
  // We default to `true` for legacy / un-migrated layouts (the
  // `DEFAULT_LOBBY_PAGE_LAYOUT` also sets `autoplay: true`) so existing
  // lobbies keep auto-playing. Any single block opting in keeps the page
  // auto-playing — the user's request is "if autoplay is off, no sound",
  // so we only suppress when nothing wants it.
  const pageWantsAutoplay = (() => {
    if (!pageLayout || !Array.isArray(pageLayout.sections)) return true;
    let sawPlayer = false;
    for (const section of pageLayout.sections) {
      if (!section || typeof section !== "object") continue;
      const cols = (section as { columns?: unknown }).columns;
      if (!Array.isArray(cols)) continue;
      for (const col of cols) {
        if (!col || typeof col !== "object") continue;
        const blocks = (col as { blocks?: unknown }).blocks;
        if (!Array.isArray(blocks)) continue;
        for (const block of blocks) {
          if (
            block &&
            typeof block === "object" &&
            (block as { type?: unknown }).type === "player"
          ) {
            sawPlayer = true;
            const c = (block as { content?: unknown }).content;
            const ap = (c as { autoplay?: unknown } | null)?.autoplay;
            if (ap === true) return true;
          }
        }
      }
    }
    return !sawPlayer; // no player blocks → no opinion, leave autoplay on
  })();

  // If password required, find the autoplay track (or first track) for preloading
  let preloadTrackMeta: { hlsReady: boolean; duration: number | null; waveformPeaks: number[] | null } | null = null;
  if (needsPassword) {
    // Try to find the autoplay track, fall back to first track by position
    const targetTrack = autoplayTrackId
      ? await prisma.track.findFirst({
          where: { lobbyId: lobby.id, id: autoplayTrackId },
          select: {
            id: true,
            duration: true,
            hlsReady: true,
            waveformPeaks: true,
            media: {
              select: {
                duration: true,
                hlsReady: true,
                waveformPeaks: true,
              },
            },
          },
        })
      : null;

    const firstTrack = targetTrack || await prisma.track.findFirst({
      where: { lobbyId: lobby.id },
      orderBy: { position: "asc" },
      select: {
        id: true,
        duration: true,
        hlsReady: true,
        waveformPeaks: true,
        media: {
          select: {
            duration: true,
            hlsReady: true,
            waveformPeaks: true,
          },
        },
      },
    });
    if (firstTrack) {
      preloadTrackId = firstTrack.id;
      preloadToken = generatePreloadToken(firstTrack.id, lobby.id);
      preloadTrackMeta = {
        hlsReady: firstTrack.media?.hlsReady ?? firstTrack.hlsReady ?? false,
        duration: firstTrack.media?.duration ?? firstTrack.duration ?? null,
        waveformPeaks: (firstTrack.media?.waveformPeaks ?? firstTrack.waveformPeaks ?? null) as number[] | null,
      };
    }
  }

  const data = {
    isLocalhost: false,
    content: null,
    lobby: {
      id: lobby.id,
      title: lobby.title,
      description: lobby.description,
      // True when the lobby is password-gated. The authenticated render
      // path uses this to decide whether to show the Logout button —
      // distinct from `requiresPassword`, which is only true BEFORE
      // login. We never expose the raw password.
      hasPassword: !!lobby.password,
    },
    account: {
      name: account.name,
      slug: account.slug,
    },
    requiresPassword: needsPassword,
    isAuthenticated: !needsPassword,
    isPreview: tenant.isPreview,
    imageUrls,
    tracks,
    autoplayTrackId,
    pageWantsAutoplay,
    preloadTrackId,
    preloadToken,
    preloadTrackMeta: preloadTrackMeta ?? null,
    notFound: false,
    loginPageSettings,
    loginLogoImageUrl,
    loginLogoImageWidth,
    loginLogoImageHeight,
    themeVars,
    cardStyles,
    bodyBg,
    socialLinksSettings,
    technicalInfo,
    gaTrackingId,
    gtmContainerId,
    csrfToken,
    pageLayout,
    // Surface the structured theme so the component's BlockView can hand it
    // down to per-block views (image border fallbacks, etc.). `themeVars` is
    // the CSS-variable form for the <main> style; this is the same data in
    // its typed-object form.
    themeSettings,
  };

  // Persist preview token in cookie when present in URL so it survives navigation (e.g. after password submit)
  const previewInUrl = new URL(request.url).searchParams.get("preview");
  if (tenant.isPreview && previewInUrl) {
    return new Response(JSON.stringify(data), {
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": getPreviewCookieHeader(previewInUrl),
      },
    });
  }
  return data;
}

export async function action({ request }: Route.ActionArgs) {
  const { checkRateLimit, RATE_LIMIT_CONFIGS, resetRateLimit, getClientIp } = await import("@secretlobby/auth/rate-limit");
  const {
    checkIPBlock,
    recordViolation,
    resetViolations,
  } = await import("@secretlobby/auth/enhanced-rate-limit");
  const { csrfProtect } = await import("@secretlobby/auth/csrf");

  // Verify CSRF token (uses HMAC validation - no session token needed)
  await csrfProtect(request);

  const ip = getClientIp(request);

  // Get lobby ID for localhost or multi-tenant
  let lobbyId: string | undefined;
  if (isLocalhost(request)) {
    // For localhost, we'll use a generic identifier since we don't have tenant yet
    lobbyId = "localhost-lobby";
  } else {
    const tenant = await resolveTenant(request);
    lobbyId = tenant.lobby?.id;
  }

  // Step 1: Check if IP is blocked (database-backed progressive lockout)
  const block = await checkIPBlock(ip, "lobby-password", lobbyId);
  if (block) {
    const isManualBlock = block.metadata?.manualBlock === true;
    const isPermanentBlock = block.violationCount >= 10 || block.status === "BLOCKED";
    const adminReason = block.metadata?.reason;

    // Permanent block (either automatic or manual)
    if (isPermanentBlock) {
      let message = `Your access has been permanently blocked${isManualBlock ? " by an administrator" : " due to repeated violations"}. Please contact us to recover your account.`;

      // Include admin's reason if available
      if (isManualBlock && adminReason) {
        message = `Your access has been permanently blocked by an administrator. Reason: ${adminReason}. Please contact us if you believe this is an error.`;
      }

      return { error: message };
    }

    // Temporary block - show time remaining
    const minutes = Math.ceil((block.lockoutUntil.getTime() - Date.now()) / 60000);
    const timeMessage = minutes === 1 ? "1 minute" : `${minutes} minutes`;

    let message = `Access temporarily blocked due to multiple failed attempts. Please try again in ${timeMessage}.`;

    // For manual temporary blocks, show admin message
    if (isManualBlock) {
      message = `Your access has been temporarily blocked by an administrator. Please try again in ${timeMessage}.`;
      if (adminReason) {
        message = `Your access has been temporarily blocked by an administrator. Reason: ${adminReason}. Please try again in ${timeMessage}.`;
      }
    }

    return { error: message };
  }

  // Step 2: Check Redis rate limit
  const rateLimitResult = await checkRateLimit(request, RATE_LIMIT_CONFIGS.LOBBY_PASSWORD);
  if (!rateLimitResult.allowed) {
    // Record this as a violation in the database for progressive tracking
    await recordViolation(ip, "lobby-password", lobbyId, request.headers.get("user-agent") || undefined);

    const minutes = Math.ceil(rateLimitResult.resetInSeconds / 60);
    const timeMessage = minutes === 1 ? "1 minute" : `${minutes} minutes`;
    return {
      error: `Too many incorrect password attempts. Please try again in ${timeMessage}.`
    };
  }

  // Handle localhost development mode
  if (isLocalhost(request)) {
    const formData = await request.formData();
    const password = formData.get("password") as string;
    const sitePassword = await getSitePassword();

    if (password === sitePassword) {
      // Reset rate limit and violations on successful password entry
      await resetRateLimit(request, RATE_LIMIT_CONFIGS.LOBBY_PASSWORD);
      await resetViolations(ip, "lobby-password", lobbyId);
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

  // Reset rate limit and violations on successful password entry
  await resetRateLimit(request, RATE_LIMIT_CONFIGS.LOBBY_PASSWORD);
  await resetViolations(ip, "lobby-password", tenant.lobby.id);

  // Get the current path to redirect back to (preserves lobby slug)
  const url = new URL(request.url);
  const redirectPath = url.pathname || "/";

  // Authenticate for this specific lobby only (supports multi-lobby sessions)
  return authenticateForLobby(request, tenant.lobby.id, redirectPath);
}

export default function LobbyIndex() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  // The page no longer owns a shared <audio> element — each
  // <StandalonePlayerBlock/> below creates its own so two player blocks
  // can play independently and their visualizers animate only when THEIR
  // audio is playing. The only page-level audio state we keep is the
  // LoginAutoplayToggle's value, which the standalone blocks read as a
  // master "is autoplay allowed at all?" gate.
  const [autoplayEnabled, setAutoplayEnabled] = useState(true);
  // Page-level "which player block is currently playing" registry. Each
  // StandalonePlayerBlock claims this slot on play and pauses itself when
  // a different block takes over — enforces the rule that only one player
  // plays at a time across the entire page.
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const wasAuthenticatedRef = useRef(!data.requiresPassword);

  // Register the first-party analytics context BEFORE any other useEffect
  // fires trackEvent. The login/logout-transition effect below depends on
  // the context being set (otherwise its events would be dropped by the
  // beacon path). The accountId is left null on the client and stamped by
  // the ingest endpoint from a Lobby lookup — keeps the client lighter and
  // prevents per-tenant spoofing once Phase-2 customer dashboards land.
  useEffect(() => {
    const lobbyId = data.lobby?.id ?? null;
    if (!lobbyId) return;
    setAnalyticsContext({ lobbyId, accountId: null });
  }, [data.lobby?.id]);

  // Fire `lobby_password_view` whenever the visitor lands on (or returns to)
  // the password gate. This is the entry-point event for the "how many
  // people reached the gate vs. actually got in?" funnel. Deliberately
  // re-fires on logout → password-page returns since that's a fresh attempt
  // from the visitor's perspective.
  useEffect(() => {
    if (!data.requiresPassword) return;
    trackEvent('lobby_password_view', {
      event_category: 'lobby_entry',
      lobby_id: data.lobby?.id,
    });
  }, [data.requiresPassword, data.lobby?.id]);

  // Apply body background from theme settings
  useEffect(() => {
    const bg = data.bodyBg;
    if (
      bg.startsWith("linear-gradient") ||
      bg.startsWith("radial-gradient") ||
      bg.startsWith("conic-gradient") ||
      bg.startsWith("url(")
    ) {
      document.body.style.background = bg;
    } else {
      document.body.style.backgroundColor = bg;
    }
    return () => {
      document.body.style.background = "";
      document.body.style.backgroundColor = "";
    };
  }, [data.bodyBg]);

  // Inject Google Analytics script
  useEffect(() => {
    const id = data.gaTrackingId;
    if (!id || !/^G[T]?-[A-Z0-9]+$/i.test(id)) return;

    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    document.head.appendChild(script);

    const inlineScript = document.createElement("script");
    inlineScript.textContent = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config',${JSON.stringify(id)});`;
    document.head.appendChild(inlineScript);

    return () => {
      document.head.removeChild(script);
      document.head.removeChild(inlineScript);
    };
  }, [data.gaTrackingId]);

  // Inject Google Tag Manager (custom domains only)
  useEffect(() => {
    const id = data.gtmContainerId;
    if (!id || !/^GTM-[A-Z0-9]+$/i.test(id)) return;

    // Inject GTM script in head
    const script = document.createElement("script");
    script.textContent = `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer',${JSON.stringify(id)});`;
    document.head.appendChild(script);

    // Inject noscript iframe in body
    const noscript = document.createElement("noscript");
    const iframe = document.createElement("iframe");
    iframe.src = `https://www.googletagmanager.com/ns.html?id=${encodeURIComponent(id)}`;
    iframe.height = "0";
    iframe.width = "0";
    iframe.style.display = "none";
    iframe.style.visibility = "hidden";
    noscript.appendChild(iframe);
    document.body.insertBefore(noscript, document.body.firstChild);

    return () => {
      document.head.removeChild(script);
      document.body.removeChild(noscript);
    };
  }, [data.gtmContainerId]);

  // Resolve tracks for both localhost and multi-tenant
  const tracks: Track[] = data.isLocalhost
    ? (data.content?.playlist || []).map((t: FileTrack) => ({
        id: t.id,
        title: t.title,
        artist: t.artist,
        filename: t.filename,
      }))
    : (data.tracks as Track[]);

  // Track login/logout transitions for analytics. Audio cleanup on logout
  // is owned by each StandalonePlayerBlock — it unmounts on the password
  // page so its `<audio>` element, useHlsAudio instance, and playback
  // state are torn down automatically.
  useEffect(() => {
    const wasAuthenticated = wasAuthenticatedRef.current;
    const isAuthenticated = !data.requiresPassword;

    if (isAuthenticated && !wasAuthenticated) {
      trackEvent('login', {
        event_category: 'authentication',
        method: 'password',
      });
    }

    if (data.requiresPassword && wasAuthenticated) {
      trackEvent('logout', {
        event_category: 'authentication',
        method: 'session_expired',
      });
    }

    wasAuthenticatedRef.current = isAuthenticated;
  }, [data.requiresPassword]);

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

  const { requiresPassword, isPreview, loginPageSettings, loginLogoImageUrl, loginLogoImageWidth, loginLogoImageHeight, cardStyles, socialLinksSettings } = data;

  // Login-page title / description are read by LoginPanel directly from
  // `settings`, so we don't recompute them here. The lobby's banner / band
  // name / description / technical info were previously read by PlayerView
  // in its "full lobby chrome" mode; under the section-based render those
  // things are expressed as their own page-builder blocks (Image /
  // Paragraph / etc.), so we don't thread them through the PlayerBlockView
  // call any more — see `renderPlayer` below.
  //
  // `socialLinksSettings` IS still needed: a designer who drops a
  // `socialLinks` block into their layout reads them from the lobby's
  // resolved settings via BlockView's `socialLinks` prop. PlayerBlockView
  // never receives them now.
  const lp = loginPageSettings;

  // Handle skip link click - scroll to and focus the target
  const handleSkipLink = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const targetId = requiresPassword ? "password" : "player-controls";
    const target = document.getElementById(targetId);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.focus({ preventScroll: true });
    }
  };

  // Single return with conditional content - audio element always at the same position
  return (
    <>
      {/* Skip link for keyboard navigation */}
      <a
        href={requiresPassword ? "#password" : "#player-controls"}
        className="skip-link"
        onClick={handleSkipLink}
      >
        {requiresPassword ? "Skip to password field" : "Skip to player controls"}
      </a>

      {isPreview && <PreviewBar />}

      {isPreview && <div aria-hidden className="shrink-0" style={{ minHeight: 44 }} />}

      {requiresPassword ? (
        // Login page content — LoginPanel renders the bg wrapper + the panel
        // card; the audio-autoplay toggle slots in below via `belowPanel`.
        //
        // `style={data.themeVars}` MUST be set here (same as the
        // authenticated branch below) so the LoginPanel's submit button —
        // styled entirely from the global `--btn-*` theme vars — actually
        // paints. Without this, the buttons read undefined vars and render
        // with no background. Mirrors how the editor's <LoginPagePreview>
        // wraps the panel in a themed surface.
        <main
          id="main-content"
          aria-label="Login"
          className="flex flex-col"
          style={{
            ...(data.themeVars as React.CSSProperties),
            // LoginPanel paints its own full-bleed `bgColor` wrapper
            // inside, so we don't need to set `background` on the main —
            // but we DO need `--btn-*` and friends to cascade so the
            // submit button + below-panel toggle pick up the global
            // theme. font-size is set so any text inside the panel
            // (descriptions, errors) reads the global base.
            //
            // `paddingBottom` reserves the slot for the floating
            // SecretLobbyFooter (`position: fixed` on this branch only).
            // Combined with `min-height: 100dvh` + Tailwind preflight's
            // global `box-sizing: border-box`, the main's TOTAL height is
            // exactly the viewport — no scroll when the panel content
            // also fits — and the LoginPanel inside (passed `flex-1`)
            // grows to fill ONLY the remaining `(100dvh - footer)` area
            // so the panel + footer never overlap.
            fontSize: "var(--text-base-size, 16px)",
            minHeight: "100dvh",
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 56px)",
          }}
        >
          <LoginPanel
            settings={lp}
            logoImageUrl={loginLogoImageUrl}
            logoImageWidth={loginLogoImageWidth}
            logoImageHeight={loginLogoImageHeight}
            errorMessage={actionData?.error ?? null}
            csrfToken={data.csrfToken}
            wrapperClassName="flex-1 flex items-center justify-center overflow-hidden"
            belowPanel={
              <LoginAutoplayToggle
                enabled={autoplayEnabled}
                onToggle={() => setAutoplayEnabled(!autoplayEnabled)}
                settings={lp}
              />
            }
          />
          <SecretLobbyFooter floating />
        </main>
      ) : (
        // Authenticated lobby content — renders the page-builder layout
        // through the same `SectionView` + `BlockView` pipeline the editor
        // preview uses, so the published lobby paints exactly what
        // designers see in the canvas. Page chrome (themed surface +
        // centered max-width container + padding) mirrors the editor's
        // desktop preview branch in Canvas.tsx so the two surfaces are
        // byte-for-byte the same layout.
        //
        // The themed surface style applies the theme's background CSS vars
        // (color / image / size / position / repeat / attachment) plus the
        // global font-size and the raw theme CSS vars. Same shape the
        // editor builds in Canvas.tsx — kept in sync intentionally because
        // any divergence shows up as "the lobby looks different from the
        // editor preview".
        //
        // `data.bodyBg` is still applied to `document.body` via the
        // useEffect below — covers the area around the main when content
        // is shorter than the viewport, and the small SSR window before
        // hydration. The main carrying its own background means the
        // page paints correctly the moment the HTML lands, before any JS
        // runs.
        //
        // For lobbies WITHOUT a saved layout, the in-memory
        // DEFAULT_LOBBY_PAGE_LAYOUT (single section, single full-variant
        // player block) flows through the same pipeline — one render
        // path, no special-case branch.
        <main
          id="main-content"
          style={{
            ...(data.themeVars as React.CSSProperties),
            background: "var(--color-bg)",
            backgroundSize: "var(--bg-size, auto)",
            backgroundPosition: "var(--bg-position, center)",
            backgroundRepeat: "var(--bg-repeat, no-repeat)",
            backgroundAttachment: "var(--bg-attachment, scroll)",
            fontSize: "var(--text-base-size, 16px)",
            minHeight: "100vh",
          }}
        >
          <div
            className="mx-auto w-full px-4 transition-[max-width] duration-300"
            style={{ maxWidth: 1152 }}
          >
            <div className="py-4 space-y-4 min-h-[600px]">
              {/* Logout button — part of the lobby PAGE, top-right.
                  Renders only when the lobby is password-gated; styling
                  flows from the theme's button CSS vars so the button
                  matches whatever the designer configured globally. */}
              {data.lobby?.hasPassword && (
                <div className="flex justify-end">
                  <LogoutButton csrfToken={data.csrfToken} />
                </div>
              )}
              {(() => {
            // `renderPlayer(content)` is the host's bridge to PlayerBlockView.
            // Captures every audio + track prop from this component's scope so
            // the hidden `<audio>` element and the autoplay state are shared
            // across every PlayerBlockView instance on the page — which means
            // designers can drop multiple player blocks into a section and
            // they'll all coordinate through the same playback state.
            //
            // We deliberately pass `imageUrls`, `bandName`, `bandDescription`,
            // `socialLinksSettings`, and `technicalInfo` as empty/null — same
            // values the editor canvas's PlayerBlock uses (see
            // apps/console/.../PlayerBlock.tsx `EMPTY_IMAGE_URLS`). PlayerView
            // would otherwise paint the lobby's banner, band info, social
            // links, and technical-info cards INSIDE the player block, and
            // those things are now expressed as their own page-builder
            // blocks (Image / Paragraph / SocialLinks). Letting PlayerView
            // paint them too would duplicate every one of them on the page.
            // The player block is JUST the audio controls now.
            const renderPlayer = (content: PlayerBlockContent, blockId: string) => {
              // Per-block playlist slice — every player block in the saved
              // layout points at a specific `content.playlistId`, so we hand
              // it ONLY the tracks owned by that playlist. Falls back to the
              // full page-level list when the block has no playlistId set
              // (legacy / unmigrated player block).
              const blockTracks =
                content.playlistId
                  ? tracks.filter((t) => t.playlistId === content.playlistId)
                  : tracks;
              // Each <StandalonePlayerBlock /> creates its OWN `<audio>` +
              // `useHlsAudio` + isPlaying state, so two player blocks on
              // the same page play independently and their visualizers
              // animate only when THEIR audio plays. `blockId` +
              // `activeBlockId` enforce single-player-at-a-time across
              // the page: starting block A pauses block B.
              return (
                <StandalonePlayerBlock
                  content={content}
                  tracks={blockTracks}
                  imageUrls={EMPTY_IMAGE_URLS}
                  bandName={null}
                  bandDescription={null}
                  cardStyles={cardStyles}
                  socialLinksSettings={null}
                  technicalInfo={null}
                  initialTrackId={content.autoplayTrackId ?? data.autoplayTrackId}
                  csrfToken={data.csrfToken}
                  pageAutoplayEnabled={autoplayEnabled}
                  blockId={blockId}
                  activeBlockId={activeBlockId}
                  onActivate={setActiveBlockId}
                />
              );
            };

            // Un-migrated lobbies (no saved pageLayout, or a saved layout
            // with zero sections) get the module-level default in-memory:
            // a single section with a single full-variant player block.
            // Every lobby — saved or not — flows through the same
            // SectionView + BlockView pipeline below, so the lobby has
            // exactly one render path for content.
            const savedSections = data.pageLayout?.sections;
            const sections: Section[] =
              savedSections && savedSections.length > 0
                ? (savedSections as unknown as Section[])
                : DEFAULT_LOBBY_PAGE_LAYOUT.sections;
            // The editor's preview canvas wraps the section list in an
            // extra `<div class="space-y-4">` (originally from its DnDContext
            // host). We emit the same wrapper here so the published lobby's
            // DOM matches the preview byte-for-byte — the outer `py-4
            // space-y-4` gives LogoutButton ↔ sections breathing room, the
            // inner gives section ↔ section breathing room.
            return (
              <div className="space-y-4">
                {sections.map((section) => (
                  <SectionView
                    key={section.id}
                section={section}
                renderBlock={(block) => (
                  <BlockView
                    block={block}
                    theme={
                      data.themeSettings
                    }
                    socialLinks={
                      (socialLinksSettings ?? {
                        links: [],
                      }) as SocialLinksSettings
                    }
                    renderFallback={(b) =>
                      b.type === "player"
                        ? renderPlayer(b.content as PlayerBlockContent, b.id)
                        : null
                    }
                  />
                )}
              />
                ))}
              </div>
            );
          })()}
            </div>
          </div>
          <SecretLobbyFooter />
        </main>
      )}
    </>
  );
}
