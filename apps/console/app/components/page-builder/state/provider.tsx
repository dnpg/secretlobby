import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type Dispatch,
} from "react";
import {
  LAYOUT_MUTATING_ACTIONS,
  pageBuilderReducer,
  THEME_MUTATING_ACTIONS,
  type PageBuilderAction,
  type PageBuilderState,
  type Selection,
} from "./reducer";
import type { Section, ThemeSettings } from "./types";

interface PageBuilderContextValue {
  state: PageBuilderState;
  dispatch: Dispatch<PageBuilderAction>;
  // Undo/redo wired up via wrapped dispatch — see history machinery below.
  // No-op when there is nothing to undo / redo.
  undo: () => void;
  redo: () => void;
}

const PageBuilderContext = createContext<PageBuilderContextValue | null>(null);

export function usePageBuilder(): PageBuilderContextValue {
  const ctx = useContext(PageBuilderContext);
  if (!ctx) {
    throw new Error(
      "usePageBuilder must be used within a PageBuilderProvider"
    );
  }
  return ctx;
}

interface PageBuilderProviderProps {
  initialState: PageBuilderState;
  children: React.ReactNode;
}

// =============================================================================
// History (undo/redo)
// -----------------------------------------------------------------------------
// We snapshot { sections, theme, selection } before every layout/theme-mutating
// dispatch and stash the snapshot in `pastRef`. `futureRef` is cleared on any
// new mutation so the redo stack only survives until the user edits again.
//
// Coalescing: typing in an inline editor fires `updateBlock` per keystroke and
// dragging a column resize fires `resizeGridTemplate` per pixel. Pushing a snapshot
// per event would blow the 50-entry cap in a few seconds, and undo would step
// back one keystroke at a time. Instead, consecutive actions whose
// `coalesceKey` matches AND fire within COALESCE_MS extend the existing burst
// — the very first snapshot of the burst (the pre-state) stays on top of the
// stack, so one undo restores everything before the burst.
//
// Undo/redo themselves call the raw reducer dispatch via `applySnapshot`,
// guarded by `isReplayingRef` so the wrapped dispatch doesn't re-record them
// onto the history stacks.
// =============================================================================

type HistorySnapshot = {
  sections: Section[];
  theme: ThemeSettings;
  selection: Selection;
};

type HistoryEntry = {
  snapshot: HistorySnapshot;
  // Identifier used to merge consecutive actions of the same kind on the same
  // entity within COALESCE_MS. Null disables coalescing for this entry.
  coalesceKey: string | null;
  pushedAt: number;
};

const HISTORY_LIMIT = 50;
const COALESCE_MS = 500;

// Map an action to a coalesce key. Returning `null` opts the action out of
// coalescing (each one pushes a fresh snapshot). Returning the same string
// across consecutive actions within COALESCE_MS merges them into the
// surrounding burst — see comment above.
function coalesceKeyFor(action: PageBuilderAction): string | null {
  switch (action.type) {
    case "updateBlock":
      return `updateBlock:${action.blockId}`;
    case "updateBlockInCard":
      return `updateBlockInCard:${action.blockId}`;
    case "updateBlockThemeOverrides":
      return `updateBlockThemeOverrides:${action.blockId}`;
    case "renameBlock":
      return `renameBlock:${action.blockId}`;
    case "renameColumn":
      return `renameColumn:${action.columnId}`;
    case "updateColumn":
      return `updateColumn:${action.columnId}`;
    case "renameSection":
      return `renameSection:${action.sectionId}`;
    case "updateSection":
      return `updateSection:${action.sectionId}`;
    case "resizeGridTemplate":
      // v3: track resize fires per pixel of drag; collapse to a single
      // history slot per (section, viewport) so the undo stack doesn't
      // blow up with per-frame snapshots.
      return `resizeGridTemplate:${action.sectionId}.${action.viewport}`;
    case "updateTheme":
      return "updateTheme";
    default:
      return null;
  }
}

function snapshotOf(state: PageBuilderState): HistorySnapshot {
  return {
    sections: state.sections,
    theme: state.theme,
    selection: state.selection,
  };
}

export function PageBuilderProvider({
  initialState,
  children,
}: PageBuilderProviderProps) {
  const [state, rawDispatch] = useReducer(pageBuilderReducer, initialState);

  // Mirror of `state` available synchronously inside callbacks. The wrapped
  // dispatch and `undo`/`redo` push the pre-state into the history stacks
  // before the reducer commits — they can't read `state` directly because
  // closures capture the value at the moment the callback was defined.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const pastRef = useRef<HistoryEntry[]>([]);
  const futureRef = useRef<HistoryEntry[]>([]);
  // True while we're replaying a snapshot through the reducer — keeps the
  // wrapped dispatch from re-pushing the synthetic setSections/setTheme/etc
  // actions back onto the history stack.
  const isReplayingRef = useRef(false);

  const applySnapshot = useCallback((snap: HistorySnapshot) => {
    isReplayingRef.current = true;
    try {
      // Sync `stateRef` ahead of React so back-to-back undo/redo presses see
      // the post-restore state when they push their own pre-state snapshots.
      stateRef.current = {
        ...stateRef.current,
        sections: snap.sections,
        theme: snap.theme,
        selection: snap.selection,
      };
      rawDispatch({ type: "setSections", sections: snap.sections });
      rawDispatch({ type: "setTheme", theme: snap.theme });
      // `setSections` flips `dirty` automatically (it's in
      // LAYOUT_MUTATING_ACTIONS). `setTheme` doesn't flip `themeDirty` — it's
      // the server-hydration escape hatch — so we mark theme dirty here so
      // the user can save the undone state.
      rawDispatch({ type: "markThemeDirty" });
      switch (snap.selection.kind) {
        case "none":
          rawDispatch({ type: "clearSelection" });
          break;
        case "section":
          rawDispatch({
            type: "selectSection",
            sectionId: snap.selection.sectionId,
          });
          break;
        case "column":
          rawDispatch({
            type: "selectColumn",
            sectionId: snap.selection.sectionId,
            columnId: snap.selection.columnId,
          });
          break;
        case "block":
          rawDispatch({
            type: "selectBlock",
            sectionId: snap.selection.sectionId,
            columnId: snap.selection.columnId,
            blockId: snap.selection.blockId,
            ...(snap.selection.cardBlockId
              ? { cardBlockId: snap.selection.cardBlockId }
              : {}),
          });
          break;
      }
    } finally {
      isReplayingRef.current = false;
    }
  }, []);

  const dispatch = useCallback<Dispatch<PageBuilderAction>>((action) => {
    if (!isReplayingRef.current) {
      const mutatesLayout = LAYOUT_MUTATING_ACTIONS.has(action.type);
      const mutatesTheme = THEME_MUTATING_ACTIONS.has(action.type);
      if (mutatesLayout || mutatesTheme) {
        const key = coalesceKeyFor(action);
        const now = Date.now();
        const last = pastRef.current[0];
        const shouldCoalesce =
          !!last &&
          key !== null &&
          last.coalesceKey === key &&
          now - last.pushedAt < COALESCE_MS;
        if (shouldCoalesce && last) {
          // Extend the burst — keep the existing pre-state on top, just
          // bump the timestamp so further keystrokes keep merging.
          last.pushedAt = now;
        } else {
          const entry: HistoryEntry = {
            snapshot: snapshotOf(stateRef.current),
            coalesceKey: key,
            pushedAt: now,
          };
          pastRef.current = [
            entry,
            ...pastRef.current.slice(0, HISTORY_LIMIT - 1),
          ];
          // Any fresh mutation invalidates the redo stack.
          futureRef.current = [];
        }
      }
    }
    rawDispatch(action);
  }, []);

  const undo = useCallback(() => {
    const entry = pastRef.current[0];
    if (!entry) return;
    const current: HistoryEntry = {
      snapshot: snapshotOf(stateRef.current),
      coalesceKey: null,
      pushedAt: Date.now(),
    };
    pastRef.current = pastRef.current.slice(1);
    futureRef.current = [current, ...futureRef.current];
    applySnapshot(entry.snapshot);
  }, [applySnapshot]);

  const redo = useCallback(() => {
    const entry = futureRef.current[0];
    if (!entry) return;
    const current: HistoryEntry = {
      snapshot: snapshotOf(stateRef.current),
      coalesceKey: null,
      pushedAt: Date.now(),
    };
    futureRef.current = futureRef.current.slice(1);
    pastRef.current = [current, ...pastRef.current];
    applySnapshot(entry.snapshot);
  }, [applySnapshot]);

  const value = useMemo(
    () => ({ state, dispatch, undo, redo }),
    [state, dispatch, undo, redo]
  );
  return (
    <PageBuilderContext.Provider value={value}>
      {children}
    </PageBuilderContext.Provider>
  );
}

export { PageBuilderContext };
