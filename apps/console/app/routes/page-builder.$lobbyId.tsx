import { redirect, useLoaderData } from "react-router";
import type { Route } from "./+types/page-builder.$lobbyId";
import { PageBuilderRoot } from "~/components/page-builder/PageBuilderRoot";
import {
  PAGE_LAYOUT_VERSION,
  type Block,
  type CardBlockContent,
  type HeadingBlockContent,
  type InlineDoc,
  type ParagraphBlockContent,
  type PlayerBlockContent,
  type Section,
  type StoredPageLayout,
} from "~/components/page-builder/state/types";
import { createBlock } from "~/components/page-builder/state/helpers";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `Page Builder - ${data?.lobby?.name || "Lobby"}` }];
}

// Read pageLayout off Lobby.settings (JSON), with light shape validation. We
// don't try to fix corrupt data; if anything is off, fall back to a default
// single-section layout. The reducer is the source of truth at runtime.
//
// Phase 6 migration: any persisted player block missing `playlistId` (from a
// pre-Phase-6 layout) gets back-filled with the lobby's default playlist id
// here so PlayerView can render immediately. The migration runs on every
// load — saving the layout writes the migrated form back to the DB on the
// next autosave, eventually retiring the legacy shape.
function parseStoredPageLayout(
  raw: unknown,
  defaultPlaylistId: string
): StoredPageLayout | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const sections = obj.sections;
  if (!Array.isArray(sections)) return null;
  const migratedSections = (sections as Section[]).map((section) => ({
    ...section,
    columns: section.columns.map((col) => ({
      ...col,
      blocks: col.blocks.map((block) =>
        migrateBlock(block, defaultPlaylistId)
      ),
    })),
  }));
  return {
    sections: migratedSections,
    version: typeof obj.version === "number" ? obj.version : PAGE_LAYOUT_VERSION,
  };
}

// Per-block migration dispatcher. Centralises the few legacy shapes we
// rewrite at load time so the rest of the runtime can assume the
// post-overhaul schema. Currently:
//   - player → back-fill `playlistId` with the lobby default
//   - card   → WYSIWYG HTML body + optional title row → nested Block[] of
//              Heading + Paragraph sub-blocks
function migrateBlock(block: Block, defaultPlaylistId: string): Block {
  if (block.type === "player") {
    return migratePlayerBlock(block, defaultPlaylistId);
  }
  if (block.type === "card") {
    return migrateCardBlock(block);
  }
  return block;
}

function migratePlayerBlock(block: Block, defaultPlaylistId: string): Block {
  if (block.type !== "player") return block;
  const content = block.content as Partial<PlayerBlockContent>;
  if (typeof content.playlistId === "string" && content.playlistId !== "") {
    return block;
  }
  return {
    ...block,
    content: {
      ...content,
      playlistId: defaultPlaylistId,
    } as PlayerBlockContent,
  };
}

// Pre-overhaul Card persisted as { title?: string; content?: string (HTML) }.
// Post-overhaul Card is a nested container — `{ title?, blocks: Block[] }`.
// We rebuild `blocks` from the old fields on first load; the next autosave
// writes the migrated form back, retiring the legacy keys over time.
//
// HTML → text conversion strips all tags (v1) so we don't accidentally inject
// arbitrary HTML into a Tiptap paragraph node. Re-richening (preserving
// bold/italic/link marks) is a follow-up. Malformed HTML falls back to a
// best-effort regex strip — we never throw here because failing the loader
// would make the whole canvas unusable.
function migrateCardBlock(block: Block): Block {
  if (block.type !== "card") return block;
  const legacy = block.content as Partial<CardBlockContent> & {
    content?: string;
  };
  // Already migrated → return as-is. Detect by presence of a `blocks` array.
  if (Array.isArray(legacy.blocks)) {
    return block;
  }
  const children: Block[] = [];
  const rawTitle = typeof legacy.title === "string" ? legacy.title.trim() : "";
  if (rawTitle.length > 0) {
    const headingBlock = createBlock("heading");
    (headingBlock.content as HeadingBlockContent) = {
      level: 1,
      inline: textToInlineDoc(rawTitle),
    };
    children.push(headingBlock);
  }
  const rawBody = typeof legacy.content === "string" ? legacy.content : "";
  const bodyText = stripHtmlToPlainText(rawBody).trim();
  if (bodyText.length > 0) {
    const paragraphBlock = createBlock("paragraph");
    (paragraphBlock.content as ParagraphBlockContent) = {
      inline: textToInlineDoc(bodyText),
    };
    children.push(paragraphBlock);
  }
  const migratedContent: CardBlockContent = {
    title: rawTitle.length > 0 ? rawTitle : undefined,
    blocks: children,
  };
  return { ...block, content: migratedContent };
}

// Best-effort HTML → plain text. We don't run a real parser here:
//   - server-side this loader avoids DOM dependencies
//   - the legacy bodies were short marketing snippets, not arbitrary docs
// Regex-strip tags + collapse whitespace + decode the few entities the old
// editor produced. Anything fancier (preserving links / bold) belongs in a
// re-richening pass.
function stripHtmlToPlainText(html: string): string {
  if (!html) return "";
  return html
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ");
}

// Wrap a plain string in a minimal Tiptap inline-only doc shape that matches
// the rest of the editor (single paragraph with a text node).
function textToInlineDoc(text: string): InlineDoc {
  if (!text) return { type: "doc", content: [{ type: "paragraph" }] };
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text }],
      },
    ],
  };
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { getSession, requireUserAuth, getCsrfToken, generatePreviewToken } = await import("@secretlobby/auth");
  const { getLobbyByIdWithMedia } = await import("~/models/queries/lobby.server");
  const { getAccountWithBasicInfo } = await import("~/models/queries/account.server");
  const { getLobbySettings } = await import("~/models/mutations/lobby.server");
  const {
    getLobbyThemeSettings,
    getLobbySocialLinksSettings,
    getLobbyLoginPageSettings,
  } = await import("~/lib/content.server");
  const { getPublicUrl } = await import("@secretlobby/storage");
  const { getPlaylistsByLobbyIdWithTracks } = await import(
    "~/models/queries/playlist.server"
  );
  const { ensureDefaultPlaylistExists } = await import(
    "~/models/mutations/playlist.server"
  );
  const { listSwatchesByAccount } = await import(
    "~/models/queries/swatch.server"
  );
  const { needsV1Migration, migrateLobbyToV2 } = await import(
    "~/lib/migrateLobbyToV2.server"
  );

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

  // Which layout the canvas should edit — main lobby page (default) or the
  // separate login page. Both live in `Lobby.settings` JSON.
  const pageKind: "lobby" | "login" =
    new URL(request.url).searchParams.get("page") === "login" ? "login" : "lobby";

  const [
    lobby,
    account,
    csrfToken,
    theme,
    lobbySettings,
    swatchesRaw,
    socialLinks,
    loginPage,
  ] = await Promise.all([
    getLobbyByIdWithMedia(lobbyId),
    getAccountWithBasicInfo(accountId),
    getCsrfToken(request),
    getLobbyThemeSettings(lobbyId),
    getLobbySettings(lobbyId),
    listSwatchesByAccount(accountId),
    // Social-link settings — merged from lobby-level + account-level fallback
    // by the helper, so the page builder sees a single resolved object.
    getLobbySocialLinksSettings(lobbyId),
    // Login-page settings — drives the login-template canvas branch + the
    // LeftRail login-page settings panel. Same lobby/account merge fallback
    // as theme/social-links.
    getLobbyLoginPageSettings(lobbyId),
  ]);

  // Public URL for the login-page logo image (same helper as the dedicated
  // login-page route, kept identical so both contexts see the same path).
  const loginLogoImageUrl = loginPage.logoImage
    ? getPublicUrl(loginPage.logoImage)
    : null;

  // Intrinsic logo dimensions, fetched alongside the URL so the canvas
  // preview can stamp `width` + `height` onto the rendered <img> for
  // aspect-ratio anchoring (same reason the live lobby loader does it).
  let loginLogoImageWidth: number | null = null;
  let loginLogoImageHeight: number | null = null;
  if (loginPage.logoImage) {
    const { prisma } = await import("@secretlobby/db");
    const logoMedia = await prisma.media.findFirst({
      where: { key: loginPage.logoImage, accountId },
      select: { width: true, height: true },
    });
    loginLogoImageWidth = logoMedia?.width ?? null;
    loginLogoImageHeight = logoMedia?.height ?? null;
  }

  if (!lobby || lobby.accountId !== accountId) {
    throw redirect("/lobbies");
  }

  if (!account) {
    throw redirect("/login");
  }

  // Ensure the lobby has a default playlist — Phase 6 introduces this as a
  // hard guarantee for the page builder. Idempotent for existing lobbies that
  // already have one (common after the migration's data backfill).
  const defaultPlaylist = await ensureDefaultPlaylistExists(lobbyId);
  const playlists = await getPlaylistsByLobbyIdWithTracks(lobbyId);

  const playlistSummaries = playlists.map((p) => ({
    id: p.id,
    name: p.name,
    isDefault: p.isDefault,
    position: p.position,
    tracks: p.tracks.map((t) => ({
      id: t.id,
      title: t.title,
      artist: t.artist ?? null,
      duration: t.media?.duration ?? null,
      hlsReady: t.media?.hlsReady ?? false,
      waveformPeaks: (t.media?.waveformPeaks as number[] | null) ?? null,
      // Public URL of the per-track cover image. The PlayerBlock's
      // `showTrackImage` toggle renders this as a thumbnail before each
      // playlist row's title; tracks with no `coverMedia` row come through
      // as `null` and the row renders without a thumbnail.
      image: t.coverMedia ? getPublicUrl(t.coverMedia.key) : null,
    })),
  }));

  // The login page is a template (not a block canvas), so we don't seed any
  // stored layout for it — the canvas will branch into LoginPagePreview
  // instead of mounting the section list. The defensive read of
  // `lobbySettings.loginPageLayout` is kept to satisfy the locked migration
  // contract (legacy data may still exist on disk); we just don't thread it
  // through to the client anymore.
  const rawLayout =
    pageKind === "login" ? null : lobbySettings.pageLayout;
  // Defensive dead-code: still read the legacy field so future migrations
  // can grep for the access site, but never feed it to the runtime.
  void lobbySettings.loginPageLayout;

  // V1 → V2 migration: any lobby whose stored layout predates
  // `PAGE_LAYOUT_VERSION = 2` (no pageLayout at all, or `version < 2`) gets
  // an in-memory layout synthesised from its DB columns (banner / profile
  // media, title, description) + legacy settings keys (technicalInfo,
  // socialLinks). The result is loaded into the reducer as-is; the next
  // user autosave persists it, stamped with the new version. Migration is
  // lazy on read — we never write back on load. Login pages don't have a
  // block layout so we skip the migration entirely for them.
  let storedLayout: StoredPageLayout | null;
  if (pageKind === "login") {
    storedLayout = null;
  } else if (needsV1Migration(rawLayout)) {
    storedLayout = migrateLobbyToV2(
      {
        title: lobby.title ?? null,
        description: lobby.description ?? null,
        bannerMedia: lobby.bannerMedia ?? null,
        profileMedia: lobby.profileMedia ?? null,
      },
      {
        technicalInfo: lobbySettings.technicalInfo as
          | { title?: string; content?: string }
          | null
          | undefined,
        socialLinks: socialLinks,
      },
      defaultPlaylist.id
    );
  } else {
    storedLayout = parseStoredPageLayout(rawLayout, defaultPlaylist.id);
  }

  // Coerce stored swatch rows into the shape the ColorPicker expects.
  // The JSON value column matches the picker's `ColorValue` discriminated
  // union at runtime — we cast through `unknown` so the loader doesn't have
  // to import the picker's TS types directly. The Prisma client picks up the
  // new `name` column after the migration runs
  // (`pnpm --filter @secretlobby/db db:migrate`).
  const swatches = swatchesRaw.map((s) => ({
    id: s.id,
    name: (s as { name?: string }).name ?? "",
    kind: s.kind as "solid" | "gradient",
    value: s.value as unknown as
      | { type: "solid"; color: string; opacity: number }
      | { type: "gradient"; gradient: { kind: string; [key: string]: unknown } },
  }));

  // Build the lobby origin URL the page-builder canvas should use for
  // cross-origin audio API requests. Mirrors the construction in
  // `_layout.lobby.tsx` — same protocol/hostname rules, but we stop at the
  // origin (no path, no preview query) because the consumer attaches paths
  // and the preview token on its own.
  const baseDomain = process.env.CORE_DOMAIN || "secretlobby.co";
  const url = new URL(request.url);
  const hostname = request.headers.get("host") || url.hostname;
  const isLocalDev =
    hostname.includes("localhost") ||
    hostname.includes(".local") ||
    hostname.startsWith("127.0.0.1");
  const protocol = isLocalDev ? "http" : "https";
  // Local dev uses the lobby app port (3002); production uses the standard
  // HTTPS port implied by the protocol. The lobby app must be reachable at
  // `{account}.{coreDomain}` for cross-origin audio to work.
  const lobbyPort = isLocalDev ? ":3002" : "";
  const lobbyOrigin = `${protocol}://${account.slug}.${baseDomain}${lobbyPort}`;

  // Mint a preview token so the page-builder canvas can hit the lobby's HLS
  // endpoints even when the lobby isn't published yet. Always generated —
  // for published lobbies the lobby endpoints ignore it harmlessly.
  const lobbyPreviewToken = generatePreviewToken(lobby.id, accountId);

  // Pull the access-control flags as a tiny separate read so the
  // login-page canvas can preview the exact fields the visitor will see
  // (email input, Google button, shared-password input) without us
  // having to widen getLobbyByIdWithMedia's selection across every caller.
  const { prisma: prismaForAccess } = await import("@secretlobby/db");
  const lobbyAccess = await prismaForAccess.lobby.findUnique({
    where: { id: lobbyId },
    select: {
      identityEmail: true,
      identityGoogle: true,
      passwordRequired: true,
    },
  });

  return {
    lobby: {
      id: lobby.id,
      name: lobby.name,
      slug: lobby.slug,
      title: lobby.title,
      isDefault: lobby.isDefault,
      // Surface whether the lobby has a password gate so the editor's
      // TopHeader can preview the Logout button — never expose the raw
      // password value to the client.
      hasPassword: !!lobby.password,
      // Access-control flags drive what the login-page canvas previews —
      // see LoginPagePreview. The schema enforces booleans (not nullable)
      // so the fallback only kicks in for legacy lobbies that haven't
      // been hit by the migration yet.
      identityEmail: lobbyAccess?.identityEmail ?? false,
      identityGoogle: lobbyAccess?.identityGoogle ?? false,
      passwordRequired: lobbyAccess?.passwordRequired ?? false,
    },
    lobbyOrigin,
    lobbyPreviewToken,
    pageLayout: storedLayout,
    pageKind,
    csrfToken,
    theme,
    playlists: playlistSummaries,
    defaultPlaylistId: defaultPlaylist.id,
    swatches,
    socialLinks,
    // Login-page template settings. Always returned so the autosave fetcher
    // in the editor has a baseline to diff against — independent of pageKind.
    loginPage,
    loginLogoImageUrl,
    loginLogoImageWidth,
    loginLogoImageHeight,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { getSession, requireUserAuth } = await import("@secretlobby/auth");
  const { csrfProtect } = await import("@secretlobby/auth/csrf");
  const { getLobbyById } = await import("~/models/queries/lobby.server");
  const { mergeLobbySettings } = await import("~/models/mutations/lobby.server");
  const { updateLobbyThemeSettings, updateLobbyLoginPageSettings } = await import(
    "~/lib/content.server"
  );

  // CSRF validation first - reject before we touch any state.
  await csrfProtect(request);

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

  // Ownership check - confirm the lobby belongs to the caller's account.
  const lobby = await getLobbyById(lobbyId);
  if (!lobby) {
    return { error: "Lobby not found" };
  }
  if (lobby.accountId !== accountId) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  // Action mirrors the loader: `?page=login` writes to `loginPageLayout`,
  // everything else writes to the main `pageLayout`. Theme/swatch intents are
  // shared across both layouts and stay on their existing global fields.
  const pageKind: "lobby" | "login" =
    new URL(request.url).searchParams.get("page") === "login" ? "login" : "lobby";

  if (intent === "update_page_layout") {
    const sectionsRaw = formData.get("sections");
    if (typeof sectionsRaw !== "string") {
      return { error: "Missing sections payload" };
    }
    let sections: Section[];
    try {
      const parsed = JSON.parse(sectionsRaw);
      if (!Array.isArray(parsed)) {
        return { error: "Invalid sections payload" };
      }
      sections = parsed as Section[];
    } catch {
      return { error: "Invalid sections JSON" };
    }
    try {
      const layoutKey = pageKind === "login" ? "loginPageLayout" : "pageLayout";
      await mergeLobbySettings(lobbyId, {
        [layoutKey]: { sections, version: PAGE_LAYOUT_VERSION },
      });
      return { success: true as const };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Save failed" };
    }
  }

  if (intent === "update_theme") {
    const themeRaw = formData.get("theme");
    if (typeof themeRaw !== "string") {
      return { error: "Missing theme payload" };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(themeRaw);
    } catch {
      return { error: "Invalid theme JSON" };
    }
    if (!parsed || typeof parsed !== "object") {
      return { error: "Invalid theme payload" };
    }
    try {
      // updateLobbyThemeSettings merges + writes; we send the full theme
      // object so the merge collapses to a write of the new state.
      await updateLobbyThemeSettings(lobbyId, parsed as Record<string, unknown>);
      return { success: true as const };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Save failed" };
    }
  }

  if (intent === "update_login_page") {
    const loginPageRaw = formData.get("loginPage");
    if (typeof loginPageRaw !== "string") {
      return { error: "Missing loginPage payload" };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(loginPageRaw);
    } catch {
      return { error: "Invalid loginPage JSON" };
    }
    if (!parsed || typeof parsed !== "object") {
      return { error: "Invalid loginPage payload" };
    }
    // Narrow the parsed payload to `Partial<LoginPageSettings>`. The
    // mutation merges on top of the existing record (see
    // `updateLobbyLoginPageSettings`), so any missing fields keep their
    // current values — safe to pass through directly.
    try {
      await updateLobbyLoginPageSettings(
        lobbyId,
        parsed as Record<string, unknown>
      );
      return { success: true as const };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Save failed" };
    }
  }

  if (intent === "create_swatch") {
    const { createSwatch } = await import("~/models/mutations/swatch.server");
    const valueRaw = formData.get("value");
    const kindRaw = formData.get("kind");
    const nameRaw = formData.get("name");
    if (
      typeof valueRaw !== "string" ||
      typeof kindRaw !== "string" ||
      typeof nameRaw !== "string"
    ) {
      return { error: "Missing swatch payload" };
    }
    const name = nameRaw.trim();
    if (!name) {
      return { error: "Swatch name required" };
    }
    if (kindRaw !== "solid" && kindRaw !== "gradient") {
      return { error: "Invalid swatch kind" };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(valueRaw);
    } catch {
      return { error: "Invalid swatch JSON" };
    }
    if (!parsed || typeof parsed !== "object") {
      return { error: "Invalid swatch payload" };
    }
    try {
      const swatch = await createSwatch({
        accountId,
        name: name.slice(0, 60),
        kind: kindRaw,
        value: parsed,
      });
      return { success: true as const, swatchId: swatch.id };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Save failed" };
    }
  }

  if (intent === "update_swatch") {
    const { updateSwatch } = await import("~/models/mutations/swatch.server");
    const id = formData.get("id");
    const valueRaw = formData.get("value");
    const kindRaw = formData.get("kind");
    const nameRaw = formData.get("name");
    if (
      typeof id !== "string" ||
      !id ||
      typeof valueRaw !== "string" ||
      typeof kindRaw !== "string" ||
      typeof nameRaw !== "string"
    ) {
      return { error: "Missing swatch payload" };
    }
    const name = nameRaw.trim();
    if (!name) {
      return { error: "Swatch name required" };
    }
    if (kindRaw !== "solid" && kindRaw !== "gradient") {
      return { error: "Invalid swatch kind" };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(valueRaw);
    } catch {
      return { error: "Invalid swatch JSON" };
    }
    if (!parsed || typeof parsed !== "object") {
      return { error: "Invalid swatch payload" };
    }
    try {
      await updateSwatch({
        id,
        accountId,
        name: name.slice(0, 60),
        kind: kindRaw,
        value: parsed,
      });
      return { success: true as const, swatchId: id };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Update failed" };
    }
  }

  if (intent === "delete_swatch") {
    const { deleteSwatch } = await import("~/models/mutations/swatch.server");
    const id = formData.get("id");
    if (typeof id !== "string" || !id) {
      return { error: "Missing swatch id" };
    }
    try {
      // Cascade — every `swatch-ref` pointing at this swatch across the
      // account's lobbies is rewritten to an inlined Solid/Gradient before
      // the row is removed. `replacedCount` lets the client toast a count
      // (purely informational — the success flag drives the UI).
      const result = await deleteSwatch(id, accountId);
      if (!result.deleted) {
        return { error: "Swatch not found" };
      }
      return {
        success: true as const,
        replacedCount: result.replacedCount,
      };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Delete failed" };
    }
  }

  return { error: "Unknown intent" };
}

export default function PageBuilderPage() {
  const data = useLoaderData<typeof loader>();
  // Remount the editor whenever the page-kind changes (lobby ↔ login). The
  // reducer seeds itself from `loaderData` exactly once via `useMemo([])`, so
  // a plain prop update wouldn't propagate the new pageKind / sections /
  // loginPage payload into running state — the canvas + left rail would
  // keep showing the previous template. Keying on `pageKind` gives us a
  // clean reset (history, save status, dirty flags all start fresh) which
  // matches the user's mental model of "I switched to a different page".
  return <PageBuilderRoot key={data.pageKind} loaderData={data} />;
}
