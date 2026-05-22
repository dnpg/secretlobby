import { arrayMove } from "@dnd-kit/sortable";
import type { SocialLinksSettings } from "@secretlobby/lobby-template";
import { createBlock, createEmptyParagraphBlock } from "./helpers";
import type {
  Block,
  BlockContent,
  BlockType,
  CardBlockContent,
  Column,
  LoginPageSettings,
  PlaylistSummary,
  Section,
  ThemeSettings,
  ViewportSize,
} from "./types";

// =============================================================================
// State machine: reducer + types. The single source of truth for any mutation
// the editor performs at runtime. The provider in `provider.tsx` wires this up
// alongside autosave + URL sync.
// =============================================================================

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export type Selection =
  | { kind: "none" }
  | { kind: "section"; sectionId: string }
  | { kind: "column"; sectionId: string; columnId: string }
  // `cardBlockId` is set when the selected block is nested inside a Card. The
  // outer card lives at `sectionId.columnId.cardBlockId`; the selected nested
  // block lives at `blockId`. When absent, the selection is a normal
  // column-level block. Cards-inside-cards aren't supported; the card slash
  // menu filters out `card` so this stays a single level deep.
  | {
      kind: "block";
      sectionId: string;
      columnId: string;
      blockId: string;
      cardBlockId?: string;
    };

// Right-panel tab key. Lives in reducer state + URL param, NOT in pageLayout.
export type RightPanelTab = "blocks" | "theme";

export interface PageBuilderState {
  // `mode` is wired through state for Phase 4 (preview vs edit). Phase 1
  // hardcodes "edit" — but Action handlers still accept setMode for URL hydration.
  mode: "edit" | "preview";
  selection: Selection;
  viewport: ViewportSize;
  sections: Section[];
  // True if `sections` has un-persisted edits. The autosave effect flips this
  // back to false once the server confirms the write.
  dirty: boolean;
  saveStatus: SaveStatus;
  lastSavedAt: number | null;
  // Phase 4: which right-panel tab is active. In-memory + URL only — not
  // persisted in the layout JSON.
  rightPanelTab: RightPanelTab;
  // Phase 5: theme settings (reactive copy). Saved via a separate fetcher
  // (intent: "update_theme") with its own dirty + saveStatus channel so
  // theme tweaks don't fight layout edits.
  theme: ThemeSettings;
  themeDirty: boolean;
  themeSaveStatus: SaveStatus;
  themeLastSavedAt: number | null;
  // Phase 6: lobby playlists, surfaced read-only to the canvas + sidebar.
  // Updated only when the loader re-runs; mutating playlists happens on the
  // dedicated /lobby/{id}/playlists/{playlistId} route, not from here.
  playlists: PlaylistSummary[];
  // Lobby social-link settings, surfaced read-only. The SocialLinks block
  // reads this for the link list + global default rendering options.
  // Mutating these still happens on the dedicated /lobby/{id}/social route
  // (see _layout.lobby.social.tsx); the page builder never writes back.
  socialLinks: SocialLinksSettings;
  // ID of the lobby's default playlist (always present after Phase 6 — the
  // loader auto-creates a default one if none exist). PlayerBlocks fall back
  // to this when their `content.playlistId` is empty or stale.
  defaultPlaylistId: string;
  // Absolute origin (no path, no query) of the lobby app, e.g.
  // `https://acme.secretlobby.co`. PlayerBlock prepends this to its audio
  // API requests so they reach the lobby host rather than the console host.
  lobbyOrigin: string;
  // Preview token for the lobby — lets the page-builder authenticate audio
  // requests against unpublished lobbies without minting a lobby session.
  // Always supplied (1-hour TTL); ignored harmlessly by published lobbies.
  lobbyPreviewToken: string;
  // Which page-builder layout the canvas is currently editing — main lobby
  // page or the dedicated login page. Sourced from the `?page=` query param;
  // routes the autosave action to the correct settings field.
  pageKind: "lobby" | "login";
  // Login-page template settings. The login page is a fixed template — the
  // canvas renders a single LoginPanel preview against this data and the
  // LeftRail exposes a form for editing every field. Persisted under
  // `Lobby.settings.loginPage` via the dedicated `update_login_page` action
  // intent, with its own dirty/saveStatus/lastSavedAt channel so it can
  // autosave independently of the layout + theme channels.
  loginPage: LoginPageSettings;
  loginLogoImageUrl: string | null;
  /** Intrinsic dimensions of the picked logo media — staged into state so
   *  the canvas preview can pass `width`/`height` attrs onto the rendered
   *  `<img>` for aspect-ratio anchoring. Both null when no logo is set or
   *  the picked media didn't have dimensions (e.g. legacy SVG without
   *  recorded width/height). */
  loginLogoImageWidth: number | null;
  loginLogoImageHeight: number | null;
  loginPageDirty: boolean;
  loginPageSaveStatus: SaveStatus;
  loginPageLastSavedAt: number | null;
  // Access-control flags lifted from the Lobby row — read-only in the
  // page builder (managed on the /lobby/:id/access route). The login-page
  // canvas reads these so the designer sees a preview that matches what
  // visitors will see at runtime.
  lobbyAccess: {
    identityEmail: boolean;
    identityGoogle: boolean;
    passwordRequired: boolean;
  };
}

export type PageBuilderAction =
  // Generic state plumbing
  | { type: "setSections"; sections: Section[] }
  | { type: "selectSection"; sectionId: string }
  | { type: "selectColumn"; sectionId: string; columnId: string }
  | {
      type: "selectBlock";
      sectionId: string;
      columnId: string;
      blockId: string;
      // When set, the selected block lives inside a card (nested surface).
      // The card lives at sectionId.columnId.cardBlockId; the selected child
      // block's id is `blockId`.
      cardBlockId?: string;
    }
  | { type: "clearSelection" }
  | { type: "setViewport"; viewport: ViewportSize }
  | { type: "setMode"; mode: "edit" | "preview" }
  | { type: "setRightPanelTab"; tab: RightPanelTab }
  | { type: "setSaveStatus"; status: SaveStatus; at?: number | null }
  | { type: "markDirty" }
  | { type: "markClean"; at?: number }
  // Section operations
  | { type: "addSection"; section: Section; select?: boolean }
  | { type: "deleteSection"; sectionId: string }
  | { type: "renameSection"; sectionId: string; name: string }
  | { type: "updateSection"; sectionId: string; updates: Partial<Section> }
  | { type: "reorderSections"; activeId: string; overId: string }
  // Column operations
  | {
      type: "renameColumn";
      sectionId: string;
      columnId: string;
      name: string;
    }
  | {
      type: "resizeColumn";
      sectionId: string;
      leftColumnId: string;
      rightColumnId: string;
      leftWidth: string;
      rightWidth: string;
      viewport: ViewportSize;
    }
  | {
      type: "updateColumn";
      sectionId: string;
      columnId: string;
      updates: Partial<Column>;
    }
  // Block operations
  | {
      type: "addBlock";
      sectionId: string;
      columnId: string;
      block: Block;
      // Optional insertion index inside the column's blocks. Appends to end
      // when omitted. The reducer handles atIndex directly (no more Canvas-
      // side setTimeout reorder) so the auto-appended trailing paragraph
      // for non-paragraph inserts lands IMMEDIATELY after the new block,
      // not at the column's end.
      atIndex?: number;
      select?: boolean;
    }
  | {
      type: "deleteBlock";
      sectionId: string;
      columnId: string;
      blockId: string;
    }
  | {
      type: "renameBlock";
      sectionId: string;
      columnId: string;
      blockId: string;
      name: string;
    }
  | {
      type: "updateBlock";
      sectionId: string;
      columnId: string;
      blockId: string;
      content: Partial<BlockContent>;
    }
  | {
      type: "reorderBlocks";
      sectionId: string;
      columnId: string;
      blockIds: string[];
    }
  | {
      type: "reorderColumns";
      sectionId: string;
      columnIds: string[];
    }
  | {
      type: "setSectionVisibility";
      sectionId: string;
      hidden: boolean;
    }
  | {
      type: "setColumnVisibility";
      sectionId: string;
      columnId: string;
      hidden: boolean;
    }
  | {
      type: "setBlockVisibility";
      sectionId: string;
      columnId: string;
      blockId: string;
      hidden: boolean;
    }
  | {
      type: "moveBlockUp";
      sectionId: string;
      columnId: string;
      blockId: string;
    }
  | {
      type: "moveBlockDown";
      sectionId: string;
      columnId: string;
      blockId: string;
    }
  | {
      type: "moveBlockToColumn";
      sectionId: string;
      sourceColumnId: string;
      blockId: string;
      direction: "left" | "right";
    }
  | {
      type: "moveBlock";
      sourceColumnId: string;
      targetColumnId: string;
      blockId: string;
      // Optional explicit destination index; appends to end if omitted.
      targetIndex?: number;
    }
  // Replace a column-level block IN PLACE with a fresh block of `newType`.
  // Preserves the original block.id so React keys + selection survive. Used
  // by the Notion-style slash menu inside the inline editor: typing `/` at
  // the start of an empty paragraph opens the menu; the picked type replaces
  // that paragraph. When `newType` isn't `"paragraph"` the reducer auto-
  // appends a fresh empty paragraph right after it so the user can keep
  // typing below.
  | {
      type: "replaceBlock";
      sectionId: string;
      columnId: string;
      blockId: string;
      newType: BlockType;
    }
  // Card-nested block operations. Each locates the host card by walking
  // sections → columns → blocks for a block with id === cardBlockId, then
  // mutates that block's `content.blocks` immutably. Cross-container moves
  // (card ↔ column, card ↔ card) aren't shipped in this pass — see the
  // overhaul follow-up notes.
  | {
      type: "addBlockToCard";
      cardBlockId: string;
      block: Block;
      // When omitted, appends to the end of the card.
      index?: number;
      select?: boolean;
    }
  | {
      type: "deleteBlockFromCard";
      cardBlockId: string;
      blockId: string;
    }
  | {
      type: "updateBlockInCard";
      cardBlockId: string;
      blockId: string;
      content: Partial<BlockContent>;
    }
  | {
      type: "reorderBlocksInCard";
      cardBlockId: string;
      blockIds: string[];
    }
  | {
      type: "moveBlockUpInCard";
      cardBlockId: string;
      blockId: string;
    }
  | {
      type: "moveBlockDownInCard";
      cardBlockId: string;
      blockId: string;
    }
  // Same in-place replace as `replaceBlock`, but inside a Card's nested
  // block list. Preserves the child block.id and auto-appends an empty
  // paragraph below it when `newType` is not `"paragraph"`.
  | {
      type: "replaceBlockInCard";
      cardBlockId: string;
      blockId: string;
      newType: BlockType;
    }
  // Phase 5: theme operations — these flow through the SEPARATE theme fetcher.
  | { type: "updateTheme"; partial: Partial<ThemeSettings> }
  | { type: "resetTheme"; theme: ThemeSettings }
  | { type: "setTheme"; theme: ThemeSettings }
  | { type: "setThemeSaveStatus"; status: SaveStatus; at?: number | null }
  | { type: "markThemeDirty" }
  | { type: "markThemeClean"; at?: number }
  // Per-block themeOverrides — these flow through the LAYOUT fetcher.
  | {
      type: "updateBlockThemeOverrides";
      blockId: string;
      overrides: Partial<ThemeSettings>;
    }
  | { type: "clearBlockThemeOverrides"; blockId: string }
  // Universal Block-level field setter. Used for `marginBottom` today; kept
  // generic (Partial<Block>) so future universal fields can ride the same
  // action without growing the action union. `content` is rejected at the
  // type level (it lives on `updateBlock` / `updateBlockInCard` which carry
  // proper Partial<BlockContent> typing).
  | {
      type: "updateBlockMeta";
      blockId: string;
      partial: Partial<Omit<Block, "id" | "type" | "content">>;
    }
  // Login-page template — flows through the dedicated update_login_page
  // fetcher. Mirrors the theme channel: a partial merge action plus
  // status/dirty plumbing. `setLoginLogoImageUrl` lets MediaPicker stage
  // the freshly-uploaded URL so the canvas preview refreshes without a
  // loader round-trip.
  | { type: "updateLoginPage"; partial: Partial<LoginPageSettings> }
  | {
      type: "setLoginLogoImageUrl";
      url: string | null;
      width?: number | null;
      height?: number | null;
    }
  | {
      type: "setLoginPageSaveStatus";
      status: SaveStatus;
      at?: number | null;
    }
  | { type: "markLoginPageDirty" }
  | { type: "markLoginPageClean"; at?: number };

// Action types that mutate persisted layout — used to flip the dirty flag.
export const LAYOUT_MUTATING_ACTIONS = new Set<PageBuilderAction["type"]>([
  "setSections",
  "addSection",
  "deleteSection",
  "renameSection",
  "updateSection",
  "reorderSections",
  "renameColumn",
  "resizeColumn",
  "updateColumn",
  "addBlock",
  "deleteBlock",
  "renameBlock",
  "updateBlock",
  "reorderBlocks",
  "reorderColumns",
  "moveBlockUp",
  "moveBlockDown",
  "moveBlockToColumn",
  "moveBlock",
  "replaceBlock",
  "addBlockToCard",
  "deleteBlockFromCard",
  "updateBlockInCard",
  "reorderBlocksInCard",
  "moveBlockUpInCard",
  "moveBlockDownInCard",
  "replaceBlockInCard",
  "setSectionVisibility",
  "setColumnVisibility",
  "setBlockVisibility",
  // themeOverrides live on the block, so they autosave with layout.
  "updateBlockThemeOverrides",
  "clearBlockThemeOverrides",
  "updateBlockMeta",
]);

// Action types that mutate the lobby theme — flip the themeDirty flag and
// trigger the dedicated theme fetcher in PageBuilderInner.
export const THEME_MUTATING_ACTIONS = new Set<PageBuilderAction["type"]>([
  "updateTheme",
  "resetTheme",
]);

// Action types that mutate the login-page template — flip the
// loginPageDirty flag and trigger the dedicated login-page fetcher.
export const LOGIN_PAGE_MUTATING_ACTIONS = new Set<PageBuilderAction["type"]>([
  "updateLoginPage",
]);

export function findBlockLocation(
  sections: Section[],
  blockId: string
): { sectionId: string; columnId: string; index: number } | null {
  for (const section of sections) {
    for (const column of section.columns) {
      const idx = column.blocks.findIndex((b) => b.id === blockId);
      if (idx !== -1) {
        return { sectionId: section.id, columnId: column.id, index: idx };
      }
    }
  }
  return null;
}

// Locate a card by id. Returns the section+column it sits in plus its index
// inside the column, so the reducer can mutate the card and only the card.
// Returns null if the id doesn't resolve to a `type === "card"` block.
function findCardLocation(
  sections: Section[],
  cardBlockId: string
): {
  sectionId: string;
  columnId: string;
  index: number;
  card: Block;
} | null {
  for (const section of sections) {
    for (const column of section.columns) {
      const idx = column.blocks.findIndex(
        (b) => b.id === cardBlockId && b.type === "card"
      );
      if (idx !== -1) {
        return {
          sectionId: section.id,
          columnId: column.id,
          index: idx,
          card: column.blocks[idx],
        };
      }
    }
  }
  return null;
}

// Helpers for card-nested updates. Each takes a `cardBlockId` and a mutator
// over the card's child block list, walks the tree once, and rebuilds the
// affected branches immutably. Pulling these into helpers keeps each reducer
// case to a single line of orchestration.
function withCardBlocks(
  sections: Section[],
  cardBlockId: string,
  mutate: (blocks: Block[]) => Block[]
): { sections: Section[]; changed: boolean } {
  let changed = false;
  const nextSections = sections.map((s) => {
    if (!s.columns.some((c) => c.blocks.some((b) => b.id === cardBlockId))) {
      return s;
    }
    return {
      ...s,
      columns: s.columns.map((col) => {
        if (!col.blocks.some((b) => b.id === cardBlockId)) return col;
        return {
          ...col,
          blocks: col.blocks.map((b) => {
            if (b.id !== cardBlockId || b.type !== "card") return b;
            const cardContent = b.content as CardBlockContent;
            const childBlocks = cardContent.blocks ?? [];
            const nextChildren = mutate(childBlocks);
            if (nextChildren === childBlocks) return b;
            changed = true;
            return {
              ...b,
              content: {
                ...cardContent,
                blocks: nextChildren,
              } satisfies CardBlockContent,
            };
          }),
        };
      }),
    };
  });
  return { sections: nextSections, changed };
}

// Hydrate `rightPanelTab` from URL. Defaults to "blocks" for any unknown value.
export function parseRightPanelTabParam(
  value: string | null
): RightPanelTab {
  if (value === "theme") return "theme";
  return "blocks";
}

// Hydrate Selection from URL params. Called on first mount to seed reducer
// state, and used by the selection effect to write back to the URL.
export function parseSelectionParam(value: string | null): Selection {
  if (!value) return { kind: "none" };
  const parts = value.split(":");
  const kind = parts[0];
  const id = parts.slice(1).join(":");
  if (!id) return { kind: "none" };
  if (kind === "section") {
    return { kind: "section", sectionId: id };
  }
  if (kind === "column") {
    const [sectionId, columnId] = id.split(".");
    if (!sectionId || !columnId) return { kind: "none" };
    return { kind: "column", sectionId, columnId };
  }
  if (kind === "block") {
    const parts = id.split(".");
    const [sectionId, columnId, blockId, cardBlockId] = parts;
    if (!sectionId || !columnId || !blockId) return { kind: "none" };
    if (cardBlockId) {
      return { kind: "block", sectionId, columnId, blockId, cardBlockId };
    }
    return { kind: "block", sectionId, columnId, blockId };
  }
  return { kind: "none" };
}

export function serializeSelection(selection: Selection): string | null {
  switch (selection.kind) {
    case "none":
      return null;
    case "section":
      return `section:${selection.sectionId}`;
    case "column":
      return `column:${selection.sectionId}.${selection.columnId}`;
    case "block":
      return selection.cardBlockId
        ? `block:${selection.sectionId}.${selection.columnId}.${selection.blockId}.${selection.cardBlockId}`
        : `block:${selection.sectionId}.${selection.columnId}.${selection.blockId}`;
  }
}

export function pageBuilderReducer(
  state: PageBuilderState,
  action: PageBuilderAction
): PageBuilderState {
  // Compute next state for each action type, then flip dirty at the bottom if
  // the action mutates the persisted layout.
  let next: PageBuilderState;
  switch (action.type) {
    case "setSections": {
      next = { ...state, sections: action.sections };
      break;
    }
    case "selectSection": {
      next = {
        ...state,
        selection: { kind: "section", sectionId: action.sectionId },
      };
      break;
    }
    case "selectColumn": {
      next = {
        ...state,
        selection: {
          kind: "column",
          sectionId: action.sectionId,
          columnId: action.columnId,
        },
      };
      break;
    }
    case "selectBlock": {
      next = {
        ...state,
        selection: {
          kind: "block",
          sectionId: action.sectionId,
          columnId: action.columnId,
          blockId: action.blockId,
          ...(action.cardBlockId
            ? { cardBlockId: action.cardBlockId }
            : {}),
        },
      };
      break;
    }
    case "clearSelection": {
      next = { ...state, selection: { kind: "none" } };
      break;
    }
    case "setViewport": {
      next = { ...state, viewport: action.viewport };
      break;
    }
    case "setMode": {
      next = { ...state, mode: action.mode };
      break;
    }
    case "setRightPanelTab": {
      next = { ...state, rightPanelTab: action.tab };
      break;
    }
    case "setSaveStatus": {
      next = {
        ...state,
        saveStatus: action.status,
        lastSavedAt: action.at !== undefined ? action.at : state.lastSavedAt,
      };
      break;
    }
    case "markDirty": {
      next = { ...state, dirty: true };
      break;
    }
    case "markClean": {
      next = {
        ...state,
        dirty: false,
        lastSavedAt: action.at ?? state.lastSavedAt,
      };
      break;
    }
    case "addSection": {
      next = {
        ...state,
        sections: [...state.sections, action.section],
        selection: action.select
          ? { kind: "section", sectionId: action.section.id }
          : state.selection,
      };
      break;
    }
    case "deleteSection": {
      const filtered = state.sections.filter((s) => s.id !== action.sectionId);
      // Drop selection if it was anchored to the removed section.
      let selection = state.selection;
      if (
        selection.kind !== "none" &&
        "sectionId" in selection &&
        selection.sectionId === action.sectionId
      ) {
        selection = { kind: "none" };
      }
      next = { ...state, sections: filtered, selection };
      break;
    }
    case "renameSection": {
      next = {
        ...state,
        sections: state.sections.map((s) =>
          s.id === action.sectionId ? { ...s, name: action.name } : s
        ),
      };
      break;
    }
    case "updateSection": {
      next = {
        ...state,
        sections: state.sections.map((s) =>
          s.id === action.sectionId ? { ...s, ...action.updates } : s
        ),
      };
      break;
    }
    case "reorderSections": {
      const oldIndex = state.sections.findIndex(
        (s) => s.id === action.activeId
      );
      const newIndex = state.sections.findIndex((s) => s.id === action.overId);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
        next = state;
      } else {
        next = {
          ...state,
          sections: arrayMove(state.sections, oldIndex, newIndex),
        };
      }
      break;
    }
    case "renameColumn": {
      next = {
        ...state,
        sections: state.sections.map((s) =>
          s.id === action.sectionId
            ? {
                ...s,
                columns: s.columns.map((col) =>
                  col.id === action.columnId
                    ? { ...col, name: action.name }
                    : col
                ),
              }
            : s
        ),
      };
      break;
    }
    case "resizeColumn": {
      next = {
        ...state,
        sections: state.sections.map((s) => {
          if (s.id !== action.sectionId) return s;
          return {
            ...s,
            columns: s.columns.map((col) => {
              if (col.id === action.leftColumnId) {
                return action.viewport === "tablet"
                  ? { ...col, tabletWidth: action.leftWidth }
                  : { ...col, width: action.leftWidth };
              }
              if (col.id === action.rightColumnId) {
                return action.viewport === "tablet"
                  ? { ...col, tabletWidth: action.rightWidth }
                  : { ...col, width: action.rightWidth };
              }
              return col;
            }),
          };
        }),
      };
      break;
    }
    case "updateColumn": {
      next = {
        ...state,
        sections: state.sections.map((s) =>
          s.id === action.sectionId
            ? {
                ...s,
                columns: s.columns.map((col) =>
                  col.id === action.columnId
                    ? { ...col, ...action.updates }
                    : col
                ),
              }
            : s
        ),
      };
      break;
    }
    case "addBlock": {
      // Notion-style trailing paragraph: when the new block isn't itself a
      // paragraph, push a fresh empty paragraph right after it so the column
      // always ends in a "Press '/' for commands" line.
      const trailing =
        action.block.type === "paragraph" ? null : createEmptyParagraphBlock();
      next = {
        ...state,
        sections: state.sections.map((s) =>
          s.id === action.sectionId
            ? {
                ...s,
                columns: s.columns.map((col) => {
                  if (col.id !== action.columnId) return col;
                  const insertAt =
                    action.atIndex === undefined
                      ? col.blocks.length
                      : Math.max(
                          0,
                          Math.min(action.atIndex, col.blocks.length)
                        );
                  const copy = [...col.blocks];
                  if (trailing) {
                    copy.splice(insertAt, 0, action.block, trailing);
                  } else {
                    copy.splice(insertAt, 0, action.block);
                  }
                  return { ...col, blocks: copy };
                }),
              }
            : s
        ),
        selection: action.select
          ? {
              kind: "block",
              sectionId: action.sectionId,
              columnId: action.columnId,
              blockId: action.block.id,
            }
          : state.selection,
      };
      break;
    }
    case "deleteBlock": {
      let selection = state.selection;
      if (
        selection.kind === "block" &&
        (selection.blockId === action.blockId ||
          // If the deleted block IS a card, drop any selection anchored to a
          // nested child of that card too.
          selection.cardBlockId === action.blockId)
      ) {
        selection = { kind: "none" };
      }
      next = {
        ...state,
        sections: state.sections.map((s) =>
          s.id === action.sectionId
            ? {
                ...s,
                columns: s.columns.map((col) => {
                  if (col.id !== action.columnId) return col;
                  const filtered = col.blocks.filter(
                    (b) => b.id !== action.blockId
                  );
                  // Notion-style: a column is NEVER empty. If the user just
                  // removed the last block, immediately push back a fresh
                  // empty paragraph so the "Press '/' for commands" hint
                  // stays visible.
                  return {
                    ...col,
                    blocks:
                      filtered.length === 0
                        ? [createEmptyParagraphBlock()]
                        : filtered,
                  };
                }),
              }
            : s
        ),
        selection,
      };
      break;
    }
    case "renameBlock": {
      next = {
        ...state,
        sections: state.sections.map((s) =>
          s.id === action.sectionId
            ? {
                ...s,
                columns: s.columns.map((col) =>
                  col.id === action.columnId
                    ? {
                        ...col,
                        blocks: col.blocks.map((b) =>
                          b.id === action.blockId
                            ? { ...b, name: action.name }
                            : b
                        ),
                      }
                    : col
                ),
              }
            : s
        ),
      };
      break;
    }
    case "updateBlock": {
      next = {
        ...state,
        sections: state.sections.map((s) =>
          s.id === action.sectionId
            ? {
                ...s,
                columns: s.columns.map((col) =>
                  col.id === action.columnId
                    ? {
                        ...col,
                        blocks: col.blocks.map((b) =>
                          b.id === action.blockId
                            ? {
                                ...b,
                                content: { ...b.content, ...action.content },
                              }
                            : b
                        ),
                      }
                    : col
                ),
              }
            : s
        ),
      };
      break;
    }
    case "reorderBlocks": {
      next = {
        ...state,
        sections: state.sections.map((s) =>
          s.id === action.sectionId
            ? {
                ...s,
                columns: s.columns.map((col) => {
                  if (col.id !== action.columnId) return col;
                  const blockMap = new Map(col.blocks.map((b) => [b.id, b]));
                  const reordered = action.blockIds
                    .map((id) => blockMap.get(id))
                    .filter(Boolean) as Block[];
                  return { ...col, blocks: reordered };
                }),
              }
            : s
        ),
      };
      break;
    }
    case "reorderColumns": {
      next = {
        ...state,
        sections: state.sections.map((s) => {
          if (s.id !== action.sectionId) return s;
          const colMap = new Map(s.columns.map((c) => [c.id, c]));
          const reordered = action.columnIds
            .map((id) => colMap.get(id))
            .filter(Boolean) as Column[];
          // Defensive: if we somehow lost a column, keep the originals.
          if (reordered.length !== s.columns.length) return s;
          return { ...s, columns: reordered };
        }),
      };
      break;
    }
    case "setSectionVisibility": {
      next = {
        ...state,
        sections: state.sections.map((s) =>
          s.id === action.sectionId ? { ...s, hidden: action.hidden } : s
        ),
      };
      break;
    }
    case "setColumnVisibility": {
      next = {
        ...state,
        sections: state.sections.map((s) =>
          s.id === action.sectionId
            ? {
                ...s,
                columns: s.columns.map((col) =>
                  col.id === action.columnId
                    ? { ...col, hidden: action.hidden }
                    : col
                ),
              }
            : s
        ),
      };
      break;
    }
    case "setBlockVisibility": {
      next = {
        ...state,
        sections: state.sections.map((s) =>
          s.id === action.sectionId
            ? {
                ...s,
                columns: s.columns.map((col) =>
                  col.id === action.columnId
                    ? {
                        ...col,
                        blocks: col.blocks.map((b) =>
                          b.id === action.blockId
                            ? { ...b, hidden: action.hidden }
                            : b
                        ),
                      }
                    : col
                ),
              }
            : s
        ),
      };
      break;
    }
    case "moveBlockUp": {
      next = {
        ...state,
        sections: state.sections.map((s) =>
          s.id === action.sectionId
            ? {
                ...s,
                columns: s.columns.map((col) => {
                  if (col.id !== action.columnId) return col;
                  const idx = col.blocks.findIndex(
                    (b) => b.id === action.blockId
                  );
                  if (idx <= 0) return col;
                  const blocks = [...col.blocks];
                  [blocks[idx - 1], blocks[idx]] = [blocks[idx], blocks[idx - 1]];
                  return { ...col, blocks };
                }),
              }
            : s
        ),
      };
      break;
    }
    case "moveBlockDown": {
      next = {
        ...state,
        sections: state.sections.map((s) =>
          s.id === action.sectionId
            ? {
                ...s,
                columns: s.columns.map((col) => {
                  if (col.id !== action.columnId) return col;
                  const idx = col.blocks.findIndex(
                    (b) => b.id === action.blockId
                  );
                  if (idx === -1 || idx >= col.blocks.length - 1) return col;
                  const blocks = [...col.blocks];
                  [blocks[idx], blocks[idx + 1]] = [blocks[idx + 1], blocks[idx]];
                  return { ...col, blocks };
                }),
              }
            : s
        ),
      };
      break;
    }
    case "moveBlockToColumn": {
      next = {
        ...state,
        sections: state.sections.map((s) => {
          if (s.id !== action.sectionId) return s;
          const sourceIdx = s.columns.findIndex(
            (c) => c.id === action.sourceColumnId
          );
          if (sourceIdx === -1) return s;
          const targetIdx =
            action.direction === "left" ? sourceIdx - 1 : sourceIdx + 1;
          if (targetIdx < 0 || targetIdx >= s.columns.length) return s;
          const block = s.columns[sourceIdx].blocks.find(
            (b) => b.id === action.blockId
          );
          if (!block) return s;
          return {
            ...s,
            columns: s.columns.map((col, i) => {
              if (i === sourceIdx) {
                return {
                  ...col,
                  blocks: col.blocks.filter((b) => b.id !== action.blockId),
                };
              }
              if (i === targetIdx) {
                return { ...col, blocks: [block, ...col.blocks] };
              }
              return col;
            }),
          };
        }),
      };
      break;
    }
    case "moveBlock": {
      // Cross-column DnD support. Source column locates the block; target
      // column receives at the requested index (or end).
      const loc = findBlockLocation(state.sections, action.blockId);
      if (!loc) {
        next = state;
        break;
      }
      if (action.sourceColumnId !== loc.columnId) {
        // Source mismatch — bail out rather than corrupt state.
        next = state;
        break;
      }
      if (action.sourceColumnId === action.targetColumnId) {
        next = state;
        break;
      }
      let movedBlock: Block | null = null;
      const sectionsAfterRemove = state.sections.map((s) => ({
        ...s,
        columns: s.columns.map((col) => {
          if (col.id !== action.sourceColumnId) return col;
          const blocks = col.blocks.filter((b) => {
            if (b.id === action.blockId) {
              movedBlock = b;
              return false;
            }
            return true;
          });
          return { ...col, blocks };
        }),
      }));
      if (!movedBlock) {
        next = state;
        break;
      }
      const insertion = movedBlock as Block;
      next = {
        ...state,
        sections: sectionsAfterRemove.map((s) => ({
          ...s,
          columns: s.columns.map((col) => {
            if (col.id !== action.targetColumnId) return col;
            const blocks = [...col.blocks];
            const insertAt =
              action.targetIndex === undefined
                ? blocks.length
                : Math.max(0, Math.min(action.targetIndex, blocks.length));
            blocks.splice(insertAt, 0, insertion);
            return { ...col, blocks };
          }),
        })),
      };
      break;
    }
    case "replaceBlock": {
      // In-place replacement: swap the block at the matching position with a
      // fresh `createBlock(newType)` BUT keep the original id so React keys,
      // selection, and any pending-focus state survive. When the new type
      // isn't `"paragraph"`, an empty paragraph is auto-appended right after
      // it so the user can keep typing below the just-inserted block.
      const replacement: Block = {
        ...createBlock(action.newType),
        id: action.blockId,
      };
      const trailing =
        action.newType === "paragraph" ? null : createEmptyParagraphBlock();
      next = {
        ...state,
        sections: state.sections.map((s) =>
          s.id === action.sectionId
            ? {
                ...s,
                columns: s.columns.map((col) => {
                  if (col.id !== action.columnId) return col;
                  const idx = col.blocks.findIndex(
                    (b) => b.id === action.blockId
                  );
                  if (idx === -1) return col;
                  const copy = [...col.blocks];
                  if (trailing) {
                    copy.splice(idx, 1, replacement, trailing);
                  } else {
                    copy.splice(idx, 1, replacement);
                  }
                  return { ...col, blocks: copy };
                }),
              }
            : s
        ),
      };
      break;
    }
    case "addBlockToCard": {
      const loc = findCardLocation(state.sections, action.cardBlockId);
      if (!loc) {
        next = state;
        break;
      }
      // Notion-style trailing paragraph (mirror of `addBlock`): non-paragraph
      // inserts get a fresh empty paragraph appended immediately after them.
      const trailing =
        action.block.type === "paragraph" ? null : createEmptyParagraphBlock();
      const { sections: nextSections } = withCardBlocks(
        state.sections,
        action.cardBlockId,
        (blocks) => {
          const insertAt =
            action.index === undefined
              ? blocks.length
              : Math.max(0, Math.min(action.index, blocks.length));
          const copy = [...blocks];
          if (trailing) {
            copy.splice(insertAt, 0, action.block, trailing);
          } else {
            copy.splice(insertAt, 0, action.block);
          }
          return copy;
        }
      );
      next = {
        ...state,
        sections: nextSections,
        selection: action.select
          ? {
              kind: "block",
              sectionId: loc.sectionId,
              columnId: loc.columnId,
              blockId: action.block.id,
              cardBlockId: action.cardBlockId,
            }
          : state.selection,
      };
      break;
    }
    case "deleteBlockFromCard": {
      const { sections: nextSections, changed } = withCardBlocks(
        state.sections,
        action.cardBlockId,
        (blocks) => {
          const filtered = blocks.filter((b) => b.id !== action.blockId);
          if (filtered.length === blocks.length) return blocks;
          // Cards mirror columns: never let the nested list go empty —
          // restore a single empty paragraph so the "Press '/' for commands"
          // hint stays visible inside the card.
          return filtered.length === 0
            ? [createEmptyParagraphBlock()]
            : filtered;
        }
      );
      let selection = state.selection;
      if (
        selection.kind === "block" &&
        selection.cardBlockId === action.cardBlockId &&
        selection.blockId === action.blockId
      ) {
        selection = { kind: "none" };
      }
      next = changed
        ? { ...state, sections: nextSections, selection }
        : { ...state, selection };
      break;
    }
    case "updateBlockInCard": {
      const { sections: nextSections } = withCardBlocks(
        state.sections,
        action.cardBlockId,
        (blocks) =>
          blocks.map((b) =>
            b.id === action.blockId
              ? { ...b, content: { ...b.content, ...action.content } }
              : b
          )
      );
      next = { ...state, sections: nextSections };
      break;
    }
    case "reorderBlocksInCard": {
      const { sections: nextSections } = withCardBlocks(
        state.sections,
        action.cardBlockId,
        (blocks) => {
          const map = new Map(blocks.map((b) => [b.id, b]));
          const reordered = action.blockIds
            .map((id) => map.get(id))
            .filter((b): b is Block => Boolean(b));
          // Defensive: if reorder lost a block, keep the originals.
          if (reordered.length !== blocks.length) return blocks;
          return reordered;
        }
      );
      next = { ...state, sections: nextSections };
      break;
    }
    case "moveBlockUpInCard": {
      const { sections: nextSections } = withCardBlocks(
        state.sections,
        action.cardBlockId,
        (blocks) => {
          const idx = blocks.findIndex((b) => b.id === action.blockId);
          if (idx <= 0) return blocks;
          const copy = [...blocks];
          [copy[idx - 1], copy[idx]] = [copy[idx], copy[idx - 1]];
          return copy;
        }
      );
      next = { ...state, sections: nextSections };
      break;
    }
    case "moveBlockDownInCard": {
      const { sections: nextSections } = withCardBlocks(
        state.sections,
        action.cardBlockId,
        (blocks) => {
          const idx = blocks.findIndex((b) => b.id === action.blockId);
          if (idx === -1 || idx >= blocks.length - 1) return blocks;
          const copy = [...blocks];
          [copy[idx], copy[idx + 1]] = [copy[idx + 1], copy[idx]];
          return copy;
        }
      );
      next = { ...state, sections: nextSections };
      break;
    }
    case "replaceBlockInCard": {
      // Same shape as `replaceBlock`, but inside a card's nested block list.
      // Preserves the child block.id and auto-appends a trailing empty
      // paragraph when the new type isn't already a paragraph.
      const replacement: Block = {
        ...createBlock(action.newType),
        id: action.blockId,
      };
      const trailing =
        action.newType === "paragraph" ? null : createEmptyParagraphBlock();
      const { sections: nextSections } = withCardBlocks(
        state.sections,
        action.cardBlockId,
        (blocks) => {
          const idx = blocks.findIndex((b) => b.id === action.blockId);
          if (idx === -1) return blocks;
          const copy = [...blocks];
          if (trailing) {
            copy.splice(idx, 1, replacement, trailing);
          } else {
            copy.splice(idx, 1, replacement);
          }
          return copy;
        }
      );
      next = { ...state, sections: nextSections };
      break;
    }
    case "updateTheme": {
      next = {
        ...state,
        theme: { ...state.theme, ...action.partial },
      };
      break;
    }
    case "resetTheme": {
      next = {
        ...state,
        theme: action.theme,
      };
      break;
    }
    case "setTheme": {
      next = { ...state, theme: action.theme };
      break;
    }
    case "setThemeSaveStatus": {
      next = {
        ...state,
        themeSaveStatus: action.status,
        themeLastSavedAt:
          action.at !== undefined ? action.at : state.themeLastSavedAt,
      };
      break;
    }
    case "markThemeDirty": {
      next = { ...state, themeDirty: true };
      break;
    }
    case "markThemeClean": {
      next = {
        ...state,
        themeDirty: false,
        themeLastSavedAt: action.at ?? state.themeLastSavedAt,
      };
      break;
    }
    case "updateBlockThemeOverrides": {
      const loc = findBlockLocation(state.sections, action.blockId);
      if (!loc) {
        next = state;
        break;
      }
      next = {
        ...state,
        sections: state.sections.map((s) =>
          s.id === loc.sectionId
            ? {
                ...s,
                columns: s.columns.map((col) =>
                  col.id === loc.columnId
                    ? {
                        ...col,
                        blocks: col.blocks.map((b) =>
                          b.id === action.blockId
                            ? {
                                ...b,
                                themeOverrides: {
                                  ...(b.themeOverrides ?? {}),
                                  ...action.overrides,
                                },
                              }
                            : b
                        ),
                      }
                    : col
                ),
              }
            : s
        ),
      };
      break;
    }
    case "clearBlockThemeOverrides": {
      const loc = findBlockLocation(state.sections, action.blockId);
      if (!loc) {
        next = state;
        break;
      }
      next = {
        ...state,
        sections: state.sections.map((s) =>
          s.id === loc.sectionId
            ? {
                ...s,
                columns: s.columns.map((col) =>
                  col.id === loc.columnId
                    ? {
                        ...col,
                        blocks: col.blocks.map((b) => {
                          if (b.id !== action.blockId) return b;
                          // Strip themeOverrides entirely so JSON stays clean.
                          const { themeOverrides: _omit, ...rest } = b;
                          void _omit;
                          return rest;
                        }),
                      }
                    : col
                ),
              }
            : s
        ),
      };
      break;
    }
    case "updateBlockMeta": {
      // Find-and-replace the block wherever it lives — column level OR
      // nested inside a card. Universal Block-level field setter; today
      // drives `marginBottom`, but any future Partial<Block> field can ride
      // through this path without growing the action union.
      //
      // Each field of `partial` set to `undefined` is treated as "clear" so
      // the persisted JSON stays minimal (e.g. clearing marginBottom should
      // remove the field rather than leave `marginBottom: undefined` on the
      // serialized block).
      const applyMeta = (b: Block): Block => {
        const merged = { ...b, ...action.partial } as Block;
        for (const [key, value] of Object.entries(action.partial)) {
          if (value === undefined) {
            delete (merged as unknown as Record<string, unknown>)[key];
          }
        }
        return merged;
      };

      const sectionsMapped = state.sections.map((s) => ({
        ...s,
        columns: s.columns.map((col) => ({
          ...col,
          blocks: col.blocks.map((b) => {
            if (b.id === action.blockId) return applyMeta(b);
            // Card-nested children — walk one level deep. Cards-inside-cards
            // are disallowed (see CardBlock's DISALLOWED_INSIDE_CARD), so a
            // single-level scan is enough.
            if (b.type === "card") {
              const content = b.content as CardBlockContent;
              const children = content.blocks ?? [];
              if (!children.some((c) => c.id === action.blockId)) return b;
              return {
                ...b,
                content: {
                  ...content,
                  blocks: children.map((c) =>
                    c.id === action.blockId ? applyMeta(c) : c
                  ),
                },
              };
            }
            return b;
          }),
        })),
      }));
      next = { ...state, sections: sectionsMapped };
      break;
    }
    case "updateLoginPage": {
      next = {
        ...state,
        loginPage: { ...state.loginPage, ...action.partial },
      };
      break;
    }
    case "setLoginLogoImageUrl": {
      next = {
        ...state,
        loginLogoImageUrl: action.url,
        // Dimensions are optional on the action: when the caller hands them
        // in (MediaPicker selection has them), stage them too; when not
        // (e.g. the URL was set without a fresh media pick), clear them so
        // we don't leave stale numbers attached to a different logo.
        loginLogoImageWidth: action.width ?? null,
        loginLogoImageHeight: action.height ?? null,
      };
      break;
    }
    case "setLoginPageSaveStatus": {
      next = {
        ...state,
        loginPageSaveStatus: action.status,
        loginPageLastSavedAt:
          action.at !== undefined ? action.at : state.loginPageLastSavedAt,
      };
      break;
    }
    case "markLoginPageDirty": {
      next = { ...state, loginPageDirty: true };
      break;
    }
    case "markLoginPageClean": {
      next = {
        ...state,
        loginPageDirty: false,
        loginPageLastSavedAt: action.at ?? state.loginPageLastSavedAt,
      };
      break;
    }
    default: {
      // Exhaustiveness check; if a new action is added but not handled,
      // TypeScript will flag it.
      const _exhaustive: never = action;
      void _exhaustive;
      next = state;
    }
  }

  if (LAYOUT_MUTATING_ACTIONS.has(action.type) && next !== state) {
    next = { ...next, dirty: true };
  }
  if (THEME_MUTATING_ACTIONS.has(action.type) && next !== state) {
    next = { ...next, themeDirty: true };
  }
  if (LOGIN_PAGE_MUTATING_ACTIONS.has(action.type) && next !== state) {
    next = { ...next, loginPageDirty: true };
  }

  return next;
}
