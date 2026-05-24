import { useRef, useState, useEffect } from "react";
import { useLoaderData, useActionData } from "react-router";
import type { Route } from "./+types/_index";
import { resolveTenant, isLocalhost, getPreviewCookieHeader } from "~/lib/subdomain.server";
import { prisma } from "@secretlobby/db";
import { getSession, createSessionResponse, authenticateForLobby, isAuthenticatedForLobby } from "@secretlobby/auth";
import { verifyLobbyPassword } from "@secretlobby/auth/lobby-password";
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
  PAGE_LAYOUT_VERSION,
  parseWidthToPercent,
  percentsToGridTemplate,
  setAnalyticsContext,
  StandalonePlayerBlock,
  PreviewBar,
  SectionView,
  SecretLobbyFooter,
  trackEvent,
  type ImageUrls,
  type LoginAccessMode,
  type LoginPageSettings,
  type Block,
  type CardBlockContent,
  type Column,
  type HeadingBlockContent,
  type ImageBlockContent,
  type ParagraphBlockContent,
  type PlayerBlockContent,
  type Section,
  type SocialLinksBlockContent,
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
//
// v3: `gridTemplateDesktop` is the single source of column sizing —
// `Column.width` is no longer carried here. The single-column section uses
// `"1fr"` so the grid renders one full-width track.
const DEFAULT_LOBBY_PAGE_LAYOUT: { sections: Section[]; version: number } = {
  version: 3,
  sections: [
    {
      id: "default-section",
      columns: [
        {
          id: "default-column",
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
      gridTemplateDesktop: "1fr",
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

// =============================================================================
// Inline V1 → V2 page-layout migration. Mirrors the console's
// migrateLobbyToV2 so the lobby can build a section layout from legacy fields
// (bannerMedia, profileMedia, title, description, technicalInfo, socialLinks)
// without importing from the console app.
// =============================================================================

// Bump this whenever buildV1Layout or _htmlToBlocks logic changes. The lobby
// loader checks the persisted stamp — if it's older than this value, the
// layout is re-synthesized even though a pageLayout already exists. This
// avoids the user having to manually clear stale migration data.
const V1_MIGRATION_REV = 3;

let _idCounter = 0;
function _genId(prefix = "s") {
  return `${prefix}-${Date.now()}-${(++_idCounter).toString(36)}`;
}
function _block(type: string): Block {
  return { id: _genId("b"), type: type as Block["type"], content: {} as Block["content"] };
}
function _section(cols: number): Section {
  const columns: Column[] = Array.from({ length: cols }, () => ({
    id: _genId("c"),
    blocks: [_block("paragraph")],
  }));
  const tpl =
    cols <= 1 ? "1fr" : cols === 2 ? "1fr 300px" : Array(cols).fill("1fr").join(" ");
  return {
    id: _genId("s"),
    columns,
    rowGap: "16",
    columnGap: "16",
    mobileLayout: "stack",
    gridTemplateDesktop: tpl,
    gridTemplateTablet: cols === 2 ? "1fr 300px" : undefined,
  };
}

// Compact HTML → block converter for legacy description/technicalInfo fields.
// Handles <p>, <br>, <h1-6>, strips inline tags, and preserves text-align
// from both inline styles and tiptap CSS classes.
type BlockAlign = "left" | "center" | "right";

function _extractAlign(tag: string): BlockAlign | undefined {
  // style="text-align: center"
  const styleMatch = tag.match(/text-align:\s*(left|center|right)/i);
  if (styleMatch) return styleMatch[1].toLowerCase() as BlockAlign;
  // tiptap classes: class="... tiptap-text-align-center ..."
  const classMatch = tag.match(/tiptap-text-align-(left|center|right)/i);
  if (classMatch) return classMatch[1].toLowerCase() as BlockAlign;
  // Quill classes: class="ql-align-center"
  const quillMatch = tag.match(/ql-align-(left|center|right)/i);
  if (quillMatch) return quillMatch[1].toLowerCase() as BlockAlign;
  // HTML4 attribute: align="center"
  const attrMatch = tag.match(/\balign=["'](left|center|right)["']/i);
  if (attrMatch) return attrMatch[1].toLowerCase() as BlockAlign;
  return undefined;
}

function _decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function _stripTags(s: string): string {
  return _decodeEntities(s.replace(/<[^>]*>/g, "")).trim();
}

// Tiptap inline node types used in the JSON doc.
type InlineMark = { type: string; attrs?: Record<string, unknown> };
type InlineNode =
  | { type: "text"; text: string; marks?: InlineMark[] }
  | { type: "hardBreak" };

// Map of HTML tags to Tiptap mark types.
const MARK_BY_TAG: Record<string, string> = {
  b: "bold", strong: "bold",
  i: "italic", em: "italic",
  u: "underline",
  s: "strike", del: "strike", strike: "strike",
  code: "code",
};

function _htmlToBlocks(html: string): Block[] {
  if (!html) return [];
  const blocks: Block[] = [];

  const TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^>]*)?)\/?\s*>/g;
  let lastIndex = 0;
  let pendingAlign: BlockAlign | undefined;
  let pendingTag: string | null = null;
  let inlineNodes: InlineNode[] = [];
  const markStack: InlineMark[] = [];

  const pushText = (raw: string) => {
    const text = _decodeEntities(raw);
    if (!text) return;
    const node: InlineNode = { type: "text", text };
    if (markStack.length > 0) {
      node.marks = markStack.map((m) => ({ ...m }));
    }
    inlineNodes.push(node);
  };

  const trimBreaks = (nodes: InlineNode[]): InlineNode[] => {
    let start = 0;
    let end = nodes.length;
    while (start < end && nodes[start].type === "hardBreak") start++;
    while (end > start && nodes[end - 1].type === "hardBreak") end--;
    return nodes.slice(start, end);
  };

  const flush = () => {
    const trimmed = trimBreaks(inlineNodes);
    inlineNodes = [];
    if (trimmed.length === 0) { pendingTag = null; pendingAlign = undefined; return; }

    const isHeading = pendingTag && /^h[1-6]$/i.test(pendingTag);

    if (isHeading) {
      const h = _block("heading");
      (h.content as HeadingBlockContent) = {
        level: 5,
        inline: {
          type: "doc",
          content: [{ type: "heading", attrs: { level: 5 }, content: trimmed }],
        },
        ...(pendingAlign ? { align: pendingAlign } : {}),
      };
      blocks.push(h);
    } else {
      const p = _block("paragraph");
      (p.content as ParagraphBlockContent) = {
        inline: {
          type: "doc",
          content: [{ type: "paragraph", content: trimmed }],
        },
        fontSize: "14px",
        ...(pendingAlign ? { align: pendingAlign } : {}),
      };
      blocks.push(p);
    }
    pendingTag = null;
    pendingAlign = undefined;
  };

  const BLOCK_TAGS = new Set(["p", "div", "li", "blockquote", "h1", "h2", "h3", "h4", "h5", "h6"]);

  let m: RegExpExecArray | null;
  while ((m = TAG_RE.exec(html)) !== null) {
    const before = html.slice(lastIndex, m.index);
    lastIndex = m.index + m[0].length;
    const isClosing = m[1] === "/";
    const tagName = m[2].toLowerCase();

    if (tagName === "br") {
      pushText(before);
      inlineNodes.push({ type: "hardBreak" });
      continue;
    }

    if (!BLOCK_TAGS.has(tagName)) {
      pushText(before);

      // Inline mark tags (bold, italic, underline, etc.)
      const markType = MARK_BY_TAG[tagName];
      if (markType) {
        if (isClosing) {
          for (let i = markStack.length - 1; i >= 0; i--) {
            if (markStack[i].type === markType) { markStack.splice(i, 1); break; }
          }
        } else {
          markStack.push({ type: markType });
        }
        continue;
      }

      // Link tags
      if (tagName === "a") {
        if (isClosing) {
          for (let i = markStack.length - 1; i >= 0; i--) {
            if (markStack[i].type === "link") { markStack.splice(i, 1); break; }
          }
        } else {
          const hrefMatch = m[0].match(/href=["']([^"']*)["']/i);
          if (hrefMatch) {
            markStack.push({ type: "link", attrs: { href: hrefMatch[1], target: "_blank", rel: "noopener noreferrer nofollow" } });
          }
        }
        continue;
      }

      // Any other inline tag (span, font, etc.) — drop the tag, keep the text
      continue;
    }

    if (!isClosing) {
      pushText(before);
      // Preserve the current alignment before flushing — if the new tag
      // has no alignment of its own (e.g. a bare `<p>` inside a
      // `<div style="text-align:center">`), inherit from the parent.
      const inheritAlign = pendingAlign;
      flush();
      const tagAlign = _extractAlign(m[0]);
      pendingAlign = tagAlign ?? inheritAlign;
      pendingTag = tagName;
    } else {
      pushText(before);
      flush();
    }
  }

  // Remaining text after last tag
  pushText(html.slice(lastIndex));
  flush();

  return blocks;
}

interface MigMedia {
  id: string;
  key: string;
  type: string;
  embedUrl?: string | null;
  width?: number | null;
  height?: number | null;
}

function buildV1Layout(
  lobby: {
    title: string | null;
    description: string | null;
    bannerMedia?: MigMedia | null;
    profileMedia?: MigMedia | null;
  },
  legacySettings: {
    technicalInfo?: { title?: string; content?: string } | null;
    socialLinks?: Partial<SocialLinksSettings> | null;
  },
  defaultPlaylistId: string
): { sections: Section[]; version: number } {
  const sections: Section[] = [];

  if (lobby.bannerMedia) {
    const sec = _section(1);
    sec.name = "Header";
    const img = _block("image");
    const url = lobby.bannerMedia.type === "EMBED"
      ? (lobby.bannerMedia.embedUrl || "")
      : getPublicUrl(lobby.bannerMedia.key);
    (img.content as ImageBlockContent) = {
      mediaId: lobby.bannerMedia.id,
      mediaUrl: url,
      mediaWidth: lobby.bannerMedia.width ?? undefined,
      mediaHeight: lobby.bannerMedia.height ?? undefined,
    };
    sec.columns[0].blocks = [img];
    sections.push(sec);
  }

  const player = _block("player");
  (player.content as PlayerBlockContent) = {
    playlistId: defaultPlaylistId,
    variant: "full",
    showVisualizer: true,
    showPlaylist: true,
    autoplay: false,
    showTrackImage: false,
  };
  const leftBlocks: Block[] = [player];

  const ti = legacySettings.technicalInfo;
  if (ti && ((ti.title && ti.title.trim()) || (ti.content && ti.content.trim()))) {
    const card = _block("card");
    const inner: Block[] = [];
    if (ti.title?.trim()) {
      const h = _block("heading");
      (h.content as HeadingBlockContent) = {
        level: 5,
        inline: { type: "doc", content: [{ type: "heading", attrs: { level: 5 }, content: [{ type: "text", text: ti.title.trim() }] }] },
      };
      inner.push(h);
    }
    if (ti.content?.trim()) {
      inner.push(..._htmlToBlocks(ti.content));
    }
    (card.content as CardBlockContent) = { blocks: inner };
    leftBlocks.push(card);
  }

  const rightBlocks: Block[] = [];
  if (lobby.profileMedia) {
    const img = _block("image");
    const url = lobby.profileMedia.type === "EMBED"
      ? (lobby.profileMedia.embedUrl || "")
      : getPublicUrl(lobby.profileMedia.key);
    (img.content as ImageBlockContent) = {
      mediaId: lobby.profileMedia.id,
      mediaUrl: url,
      mediaWidth: lobby.profileMedia.width ?? undefined,
      mediaHeight: lobby.profileMedia.height ?? undefined,
    };
    rightBlocks.push(img);
  }

  const sl = legacySettings.socialLinks;
  if (sl?.links && Array.isArray(sl.links) && sl.links.length > 0) {
    const card = _block("card");
    const inner: Block[] = [];
    if (sl.title?.trim()) {
      const h = _block("heading");
      (h.content as HeadingBlockContent) = {
        level: 5,
        inline: { type: "doc", content: [{ type: "heading", attrs: { level: 5 }, content: [{ type: "text", text: sl.title.trim() }] }] },
      };
      inner.push(h);
    }
    const linksBlock = _block("socialLinks");
    (linksBlock.content as SocialLinksBlockContent) = {
      alignment: "center",
      iconStyle: ((sl as { iconStyle?: string }).iconStyle === "brand" ? "brand" : "mono") as "brand" | "mono",
    };
    inner.push(linksBlock);
    (card.content as CardBlockContent) = { blocks: inner };
    rightBlocks.push(card);
  }

  if (lobby.title?.trim() || lobby.description?.trim()) {
    const card = _block("card");
    const inner: Block[] = [];
    if (lobby.title?.trim()) {
      const h = _block("heading");
      (h.content as HeadingBlockContent) = {
        level: 4,
        inline: { type: "doc", content: [{ type: "heading", attrs: { level: 4 }, content: [{ type: "text", text: lobby.title.trim() }] }] },
      };
      inner.push(h);
    }
    if (lobby.description?.trim()) {
      inner.push(..._htmlToBlocks(lobby.description));
    }
    (card.content as CardBlockContent) = { blocks: inner };
    rightBlocks.push(card);
  }

  if (rightBlocks.length > 0) {
    const sec = _section(2);
    sec.name = "Content";
    sec.columns[0].name = "Player";
    sec.columns[0].blocks = leftBlocks;
    sec.columns[1].name = "Sidebar";
    sec.columns[1].blocks = rightBlocks;
    sections.push(sec);
  } else {
    const sec = _section(1);
    sec.name = "Content";
    sec.columns[0].blocks = leftBlocks;
    sections.push(sec);
  }

  return { sections, version: PAGE_LAYOUT_VERSION, _migRev: V1_MIGRATION_REV } as { sections: Section[]; version: number };
}

// Inline v2→v3 layout migration. Mirrors the console's migrateLobbyToV3 but
// lives here so the lobby can run it on read without importing from the
// console app. Pure function — safe on every load; idempotent on v3 layouts.
function migratePageLayoutToV3(
  layout: { sections: unknown[]; version: number }
): { sections: Section[]; version: number } {
  if (layout.version >= PAGE_LAYOUT_VERSION) {
    const allHaveTemplate = (layout.sections as Section[]).every(
      (s) =>
        typeof s.gridTemplateDesktop === "string" &&
        s.gridTemplateDesktop.trim().length > 0
    );
    if (allHaveTemplate) {
      return layout as { sections: Section[]; version: number };
    }
  }
  const migrated = (layout.sections as Section[]).map((section) => {
    if (
      typeof section.gridTemplateDesktop === "string" &&
      section.gridTemplateDesktop.trim().length > 0
    ) {
      return section;
    }
    const columnCount = section.columns?.length ?? 1;
    if (columnCount === 2) {
      return { ...section, gridTemplateDesktop: "1fr 300px", gridTemplateTablet: "1fr 300px" };
    }
    const desktopPercents = (section.columns ?? []).map((col) =>
      parseWidthToPercent(col.width ?? "", columnCount)
    );
    const gridTemplateDesktop = percentsToGridTemplate(desktopPercents);
    let gridTemplateTablet: string | undefined;
    if ((section.columns ?? []).some((col) => typeof col.tabletWidth === "string" && col.tabletWidth.length > 0)) {
      const tabletPercents = (section.columns ?? []).map((col) =>
        parseWidthToPercent(col.tabletWidth || col.width || "", columnCount)
      );
      gridTemplateTablet = percentsToGridTemplate(tabletPercents);
    }
    return { ...section, gridTemplateDesktop, ...(gridTemplateTablet ? { gridTemplateTablet } : {}) };
  });
  return { sections: migrated, version: PAGE_LAYOUT_VERSION };
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
      // Login-data slots kept on the localhost dev branch too so the
      // render path sees a consistent shape — values are all null /
      // defaults because localhost dev only uses the legacy
      // password-only gate.
      accessMode: null as LoginAccessMode | null,
      loginReasonMessage: null as string | null,
      magicLinkExpiresInDays: 7,
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
      accessMode: null as LoginAccessMode | null,
      loginReasonMessage: null as string | null,
      magicLinkExpiresInDays: 7,
    };
  }

  const { account } = tenant;
  let { lobby } = tenant;

  // Backfill access controls for imported data. The Prisma migration
  // `20260522120000_add_lobby_access_controls` ran `UPDATE "Lobby" SET
  // "passwordRequired" = true WHERE "password" IS NOT NULL AND
  // "password" <> ''` once. After a database import the column defaults
  // may disagree with the actual password state — a lobby with a password
  // would appear open. Fix it lazily on read and persist so it only fires
  // once.
  if (lobby.password && !lobby.passwordRequired) {
    lobby = { ...lobby, passwordRequired: true };
    void prisma.$executeRawUnsafe(
      `UPDATE "Lobby" SET "passwordRequired" = true WHERE "id" = $1 AND "password" IS NOT NULL AND "password" <> ''`,
      lobby.id
    ).catch(() => {});
  }

  // Check if lobby requires password and user is authenticated for THIS specific lobby
  const isAuthenticated = isAuthenticatedForLobby(session, lobby.id);

  // Unified sign-in gate: any combination of (passwordRequired,
  // identityEmail, identityGoogle) keeps the visitor on this same URL
  // — the URL never changes during sign-in. The LoginPanel below picks
  // up `accessMode` when identity methods are on and falls back to the
  // legacy password-only form otherwise. Failure paths (magic-link
  // consume / Google finish) redirect back to this URL with
  // `?reason=<code>`; we surface the matching banner via
  // `resolveLoginReasonMessage`.
  const needsLogin =
    !isAuthenticated &&
    (lobby.passwordRequired || lobby.identityEmail || lobby.identityGoogle);
  // Backwards-compat name — preserved because downstream loader logic
  // gates on it ("don't fetch tracks when on the login screen").
  const needsPassword = needsLogin;

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
        const rawVersion = typeof pl.version === "number" ? pl.version : 1;

        // Check migration revision stamp. When the V1 migration logic
        // changes (new mark support, alignment, etc.) we bump
        // V1_MIGRATION_REV. If the persisted layout was produced by an
        // older revision (or has no stamp at all), we discard it and
        // force a fresh V1 migration below. Layouts saved by the console
        // editor (user edits) don't carry `_migRev` — those should NOT
        // be re-migrated, so we only trigger when the version matches
        // PAGE_LAYOUT_VERSION (meaning it was auto-migrated, not
        // hand-edited via the page builder).
        const storedMigRev = typeof pl._migRev === "number" ? pl._migRev : 0;
        const wasMigratedByLobby = storedMigRev > 0;
        if (wasMigratedByLobby && storedMigRev < V1_MIGRATION_REV) {
          // Stale lobby migration — discard and re-run below.
          // pageLayout stays null → triggers buildV1Layout.
        } else {
          const raw = { sections: pl.sections, version: rawVersion };

          if (rawVersion < PAGE_LAYOUT_VERSION) {
            const migrated = migratePageLayoutToV3(raw);
            pageLayout = migrated;
            void prisma.$executeRawUnsafe(
              `UPDATE "Lobby" SET "settings" = "settings" || $1::jsonb WHERE "id" = $2`,
              JSON.stringify({ pageLayout: migrated }),
              lobby.id
            ).catch(() => {});
          } else {
            pageLayout = raw as { sections: Section[]; version: number };
          }
        }
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

  // V1 → V2 migration: when no pageLayout is saved (or it's empty), build
  // the full section layout from legacy lobby fields — banner, profile image,
  // title + description about card, social links, technical info. Mirrors
  // the console's migrateLobbyToV2 + V3 chain so the visitor sees the same
  // layout the admin would see after opening the page builder.
  if (!pageLayout) {
    const lobbyMedia = await prisma.lobby.findUnique({
      where: { id: lobby.id },
      include: {
        bannerMedia: { select: { id: true, key: true, type: true, embedUrl: true, width: true, height: true } },
        profileMedia: { select: { id: true, key: true, type: true, embedUrl: true, width: true, height: true } },
      },
    });
    // Ensure a default playlist exists + backfill orphaned tracks (same
    // logic the console runs). We need the playlist ID for the player block.
    let defaultPlaylist = await prisma.playlist.findFirst({
      where: { lobbyId: lobby.id, isDefault: true },
      select: { id: true },
    });
    if (!defaultPlaylist) {
      try {
        defaultPlaylist = await prisma.playlist.create({
          data: { lobbyId: lobby.id, name: "Default", isDefault: true, position: 0 },
          select: { id: true },
        });
      } catch {
        defaultPlaylist = await prisma.playlist.findFirst({
          where: { lobbyId: lobby.id, isDefault: true },
          select: { id: true },
        });
      }
    }
    if (defaultPlaylist) {
      await prisma.track.updateMany({
        where: { lobbyId: lobby.id, playlistId: null },
        data: { playlistId: defaultPlaylist.id },
      });
    }

    const migrated = buildV1Layout(
      {
        title: lobby.title,
        description: lobby.description,
        bannerMedia: lobbyMedia?.bannerMedia as MigMedia | null,
        profileMedia: lobbyMedia?.profileMedia as MigMedia | null,
      },
      { technicalInfo, socialLinks: socialLinksSettings },
      defaultPlaylist?.id ?? ""
    );
    pageLayout = migrated;
    // Persist so subsequent loads skip the migration.
    void prisma.$executeRawUnsafe(
      `UPDATE "Lobby" SET "settings" = "settings" || $1::jsonb WHERE "id" = $2`,
      JSON.stringify({ pageLayout: migrated }),
      lobby.id
    ).catch(() => {});
  }

  // Carry over the lobby-level background image (Lobby.backgroundMediaId)
  // into the theme when the theme doesn't already have an image overlay.
  // Pre-v2 lobbies stored their background via a direct FK on the Lobby row;
  // the new theme format expects it inside `background.image`.
  if (!themeSettings.background?.image) {
    const lobbyBgMedia = await prisma.lobby.findUnique({
      where: { id: lobby.id },
      select: {
        backgroundMedia: { select: { id: true, key: true } },
      },
    });
    if (lobbyBgMedia?.backgroundMedia?.key) {
      const existingBg = normalizeThemeBackground(themeSettings);
      themeSettings = {
        ...themeSettings,
        background: {
          ...existingBg,
          image: {
            type: "image",
            mediaId: lobbyBgMedia.backgroundMedia.id,
            mediaUrl: getPublicUrl(lobbyBgMedia.backgroundMedia.key),
            size: "cover",
            position: "center",
            repeat: "no-repeat",
            attachment: "fixed",
          },
          overlay: existingBg.overlay ?? { color: "#000000", opacity: 30 },
        },
      };
    }
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

  // Inline sign-in support data — computed only when we'll actually
  // render the LoginPanel. Keeping it conditional avoids paying for
  // these reads on every authenticated page view.
  const { getLobbyGoogleSignInUrl, resolveLoginReasonMessage, LOGIN_MAGIC_LINK_EXPIRES_IN_DAYS } =
    needsLogin
      ? await import("~/lib/login-page.server")
      : ({
          getLobbyGoogleSignInUrl: () => null,
          resolveLoginReasonMessage: () => null,
          LOGIN_MAGIC_LINK_EXPIRES_IN_DAYS: 7,
        } as const);

  const googleSignInUrl = needsLogin
    ? getLobbyGoogleSignInUrl(request, {
        id: lobby.id,
        slug: lobby.slug,
        isDefault: lobby.isDefault,
        identityGoogle: lobby.identityGoogle,
      })
    : null;

  const reasonParam = new URL(request.url).searchParams.get("reason");
  const loginReasonMessage = needsLogin
    ? resolveLoginReasonMessage(reasonParam)
    : null;

  // The LoginPanel's `accessMode` prop turns on the multi-method form
  // (email + Google + optional password). When identity methods are
  // off, we omit accessMode so LoginPanel falls back to its legacy
  // password-only render — same behavior as before this refactor.
  const accessMode =
    needsLogin && (lobby.identityEmail || lobby.identityGoogle)
      ? {
          identityEmail: lobby.identityEmail,
          identityGoogle: lobby.identityGoogle,
          passwordRequired: lobby.passwordRequired,
          googleSignInUrl,
          lobbySlug: lobby.slug,
        }
      : null;

  const data = {
    isLocalhost: false,
    content: null,
    lobby: {
      id: lobby.id,
      title: lobby.title,
      description: lobby.description,
      slug: lobby.slug,
      isDefault: lobby.isDefault,
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
    accessMode,
    loginReasonMessage,
    magicLinkExpiresInDays: LOGIN_MAGIC_LINK_EXPIRES_IN_DAYS,
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
  const intent = formData.get("intent");

  // Branch on the form's intent. The LoginPanel stamps `intent` onto
  // the submit button (`google` / `email`) when accessMode is in use;
  // the legacy password-only form posts no intent at all.
  if (intent === "google") {
    // passwordRequired branch — the Google submit button only renders
    // when accessMode.passwordRequired is true. Verify the password
    // on the lobby side before we hand the visitor off to Google;
    // stash a short-lived session marker so /auth/google/finish can
    // confirm the gate actually happened (defends against a malicious
    // direct GET to AUTH_URL/auth/google that would otherwise skip
    // the password check entirely).
    const { updateSession } = await import("@secretlobby/auth");
    const { LOBBY_PASSWORD_VERIFICATION_TTL_MS } = await import(
      "@secretlobby/auth/lobby-access"
    );

    if (!tenant.lobby.passwordRequired) {
      // Bogus form payload — the button shouldn't have shipped intent=
      // google for a lobby without passwordRequired. Treat it as a
      // misuse and reject rather than skipping the check.
      return { error: "Password verification not required for this lobby." };
    }
    if (!tenant.lobby.identityGoogle) {
      return { error: "Google sign-in is not enabled for this lobby." };
    }
    const submittedPassword = (formData.get("password") as string) || "";
    if (!verifyLobbyPassword(submittedPassword, tenant.lobby.password ?? "")) {
      return { error: "Incorrect password." };
    }

    const authBase = process.env.AUTH_URL;
    if (!authBase) {
      return { error: "Google sign-in is not configured." };
    }
    const url = new URL(request.url);
    const params = new URLSearchParams({
      lobby: tenant.lobby.id,
      host: url.host,
      returnPath: tenant.lobby.isDefault ? "/" : `/${tenant.lobby.slug}`,
    });
    const googleStartUrl = `${authBase.replace(/\/$/, "")}/auth/google?${params.toString()}`;

    // Set the marker, then redirect carrying the session's Set-Cookie
    // header so the marker survives the cross-origin hop to the
    // console OAuth start.
    const { response: sessionResponse } = await updateSession(request, {
      lobbyPasswordVerified: {
        lobbyId: tenant.lobby.id,
        expiresAt: Date.now() + LOBBY_PASSWORD_VERIFICATION_TTL_MS,
      },
    });
    const cookieHeader = sessionResponse.headers.get("Set-Cookie");
    return new Response(null, {
      status: 302,
      headers: {
        Location: googleStartUrl,
        ...(cookieHeader ? { "Set-Cookie": cookieHeader } : {}),
      },
    });
  }

  if (intent === "email" || formData.has("email")) {
    const { handleMagicLinkRequest } = await import("~/lib/login-page.server");
    return handleMagicLinkRequest(request, tenant.lobby, formData);
  }

  const password = formData.get("password") as string;

  // Verify password — decrypts the stored value with constant-time-ish
  // compare. Legacy plaintext values still verify until the migration
  // script encrypts them in place.
  if (!verifyLobbyPassword(password, tenant.lobby.password ?? "")) {
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

  // Disable right-click on the lobby page to discourage casual content
  // copying (images, audio, text). Not bulletproof — browser dev-tools
  // bypass it trivially — but it's a speed bump for non-technical visitors.
  useEffect(() => {
    const handler = (e: MouseEvent) => e.preventDefault();
    document.addEventListener("contextmenu", handler);
    return () => document.removeEventListener("contextmenu", handler);
  }, []);

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
            // Show actionData errors when present, fall back to the
            // reason banner (from a failed magic-link click landing
            // back on /?reason=...). Form errors are interactive and
            // therefore take precedence.
            errorMessage={
              actionData && "error" in actionData
                ? actionData.error
                : data.loginReasonMessage
            }
            // `submitted` is set when the magic-link action returned
            // success — LoginPanel swaps the form for the "check your
            // email" message. Only meaningful with accessMode.
            submitted={
              !!(actionData && "magicLink" in actionData && "success" in actionData)
            }
            magicLinkExpiresInDays={data.magicLinkExpiresInDays}
            accessMode={data.accessMode ?? undefined}
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
