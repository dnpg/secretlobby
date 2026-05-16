import { arrayMove } from "@dnd-kit/sortable";
import type {
  Block,
  BlockContent,
  Column,
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
  | { kind: "block"; sectionId: string; columnId: string; blockId: string };

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
  | { type: "clearBlockThemeOverrides"; blockId: string };

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
  "setSectionVisibility",
  "setColumnVisibility",
  "setBlockVisibility",
  // themeOverrides live on the block, so they autosave with layout.
  "updateBlockThemeOverrides",
  "clearBlockThemeOverrides",
]);

// Action types that mutate the lobby theme — flip the themeDirty flag and
// trigger the dedicated theme fetcher in PageBuilderInner.
export const THEME_MUTATING_ACTIONS = new Set<PageBuilderAction["type"]>([
  "updateTheme",
  "resetTheme",
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
    const [sectionId, columnId, blockId] = id.split(".");
    if (!sectionId || !columnId || !blockId) return { kind: "none" };
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
      return `block:${selection.sectionId}.${selection.columnId}.${selection.blockId}`;
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
      next = {
        ...state,
        sections: state.sections.map((s) =>
          s.id === action.sectionId
            ? {
                ...s,
                columns: s.columns.map((col) =>
                  col.id === action.columnId
                    ? { ...col, blocks: [...col.blocks, action.block] }
                    : col
                ),
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
        selection.blockId === action.blockId
      ) {
        selection = { kind: "none" };
      }
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
                        blocks: col.blocks.filter(
                          (b) => b.id !== action.blockId
                        ),
                      }
                    : col
                ),
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

  return next;
}
