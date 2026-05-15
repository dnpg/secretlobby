import { redirect, useLoaderData } from "react-router";
import type { Route } from "./+types/page-builder.$lobbyId";
import { PageBuilderRoot } from "~/components/page-builder/PageBuilderRoot";
import {
  PAGE_LAYOUT_VERSION,
  type Block,
  type PlayerBlockContent,
  type Section,
  type StoredPageLayout,
} from "~/components/page-builder/state/types";

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
      blocks: col.blocks.map((block) => migratePlayerBlock(block, defaultPlaylistId)),
    })),
  }));
  return {
    sections: migratedSections,
    version: typeof obj.version === "number" ? obj.version : PAGE_LAYOUT_VERSION,
  };
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

export async function loader({ request, params }: Route.LoaderArgs) {
  const { getSession, requireUserAuth, getCsrfToken, generatePreviewToken } = await import("@secretlobby/auth");
  const { getLobbyById } = await import("~/models/queries/lobby.server");
  const { getAccountWithBasicInfo } = await import("~/models/queries/account.server");
  const { getLobbySettings } = await import("~/models/mutations/lobby.server");
  const { getLobbyThemeSettings } = await import("~/lib/content.server");
  const { getPlaylistsByLobbyIdWithTracks } = await import(
    "~/models/queries/playlist.server"
  );
  const { ensureDefaultPlaylistExists } = await import(
    "~/models/mutations/playlist.server"
  );
  const { listSwatchesByAccount } = await import(
    "~/models/queries/swatch.server"
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

  const [lobby, account, csrfToken, theme, lobbySettings, swatchesRaw] =
    await Promise.all([
      getLobbyById(lobbyId),
      getAccountWithBasicInfo(accountId),
      getCsrfToken(request),
      getLobbyThemeSettings(lobbyId),
      getLobbySettings(lobbyId),
      listSwatchesByAccount(accountId),
    ]);

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
    })),
  }));

  const storedLayout = parseStoredPageLayout(
    lobbySettings.pageLayout,
    defaultPlaylist.id
  );

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

  return {
    lobby: {
      id: lobby.id,
      name: lobby.name,
      slug: lobby.slug,
      title: lobby.title,
      isDefault: lobby.isDefault,
    },
    lobbyOrigin,
    lobbyPreviewToken,
    pageLayout: storedLayout,
    csrfToken,
    theme,
    playlists: playlistSummaries,
    defaultPlaylistId: defaultPlaylist.id,
    swatches,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { getSession, requireUserAuth } = await import("@secretlobby/auth");
  const { csrfProtect } = await import("@secretlobby/auth/csrf");
  const { getLobbyById } = await import("~/models/queries/lobby.server");
  const { mergeLobbySettings } = await import("~/models/mutations/lobby.server");
  const { updateLobbyThemeSettings } = await import("~/lib/content.server");

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
      await mergeLobbySettings(lobbyId, {
        pageLayout: { sections, version: PAGE_LAYOUT_VERSION },
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
  return <PageBuilderRoot loaderData={data} />;
}
