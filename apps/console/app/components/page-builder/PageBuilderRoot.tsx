import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useBlocker, useFetcher, useSearchParams } from "react-router";
import { toast } from "sonner";
import { cn } from "@secretlobby/ui";
import type { SocialLinksSettings } from "@secretlobby/lobby-template";
import type {
  LoginPageSettings,
  PlaylistSummary,
  StoredPageLayout,
  ThemeSettings,
  ViewportSize,
} from "./state/types";
import { createDefaultPageLayout } from "./state/helpers";
import {
  parseRightPanelTabParam,
  parseSelectionParam,
  serializeSelection,
  type PageBuilderState,
} from "./state/reducer";
import {
  PageBuilderProvider,
  usePageBuilder,
} from "./state/provider";
import { LeftRail } from "./sidebar/LeftRail";
import { Canvas } from "./canvas/Canvas";
import { TopHeader } from "./toolbar/TopHeader";
import type { ColorValue, SavedSwatch } from "~/components/color-picker";
import { unlinkValue } from "~/components/color-picker";

// Shape of `useLoaderData` for the page-builder route. Loosely typed here so
// the route file can pass `loaderData` straight in without re-deriving types.
interface PageBuilderLoaderData {
  lobby: {
    id: string;
    name: string;
    slug: string;
    title: string | null;
    isDefault: boolean;
    // True when the lobby has a password gate. Used by TopHeader to preview
    // the Logout button — never carries the raw password string.
    hasPassword: boolean;
  };
  pageLayout: StoredPageLayout | null;
  // Which layout the loader returned — main lobby page or the login page.
  pageKind: "lobby" | "login";
  csrfToken: string;
  theme: ThemeSettings;
  playlists: PlaylistSummary[];
  defaultPlaylistId: string;
  // Lobby-level social link settings — passed through to the page-builder
  // state so the SocialLinks block can render the user's configured links.
  // The block never writes back; mutating these still happens on the
  // dedicated /lobby/{id}/social route.
  socialLinks: SocialLinksSettings;
  // Absolute origin (e.g. `https://acme.secretlobby.co`) for cross-origin
  // audio API requests from PlayerBlock to the lobby app.
  lobbyOrigin: string;
  // 1-hour preview token allowing the canvas to fetch audio from unpublished
  // lobbies without the user holding a lobby session cookie.
  lobbyPreviewToken: string;
  swatches: Array<{
    id: string;
    name: string;
    kind: "solid" | "gradient";
    // Server returns the JSON column as-is; we trust the shape at runtime
    // and treat it as a SavedSwatch's `value` when handing it to the picker.
    value: unknown;
  }>;
  // Login-page template settings — always returned by the loader (regardless
  // of pageKind) so the autosave fetcher has a baseline to diff against and
  // a freshly-toggled "Login page" view doesn't have to wait for a separate
  // round-trip to hydrate.
  loginPage: LoginPageSettings;
  loginLogoImageUrl: string | null;
  loginLogoImageWidth: number | null;
  loginLogoImageHeight: number | null;
}

// =============================================================================
// Swatch context — separate from the page-builder reducer so swatch mutations
// don't touch the layout/theme dirty channels. The page builder root owns the
// fetcher that POSTs create_swatch / delete_swatch, and updates an in-memory
// list optimistically so the ColorPicker can react immediately.
// =============================================================================

// =============================================================================
// Theme overlay context — tiny helper so deep child components can request to
// open the global Theme overlay (the paint-brush sliding panel). The state
// itself still lives in `PageBuilderInner`; this context only exposes the
// setter / current state so we don't have to prop-drill it through SettingsOverlay
// → BlockSettings → CardBlockSettings.
// =============================================================================

interface ThemeOverlayContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const ThemeOverlayContext = createContext<ThemeOverlayContextValue | null>(null);

export function useThemeOverlay(): ThemeOverlayContextValue {
  const ctx = useContext(ThemeOverlayContext);
  if (!ctx) {
    // No-op default so callers used outside the provider don't crash.
    return { open: false, setOpen: () => {} };
  }
  return ctx;
}

interface SwatchContextValue {
  swatches: SavedSwatch[];
  saveSwatch: (name: string, value: ColorValue) => void;
  updateSwatch: (id: string, name: string, value: ColorValue) => void;
  deleteSwatch: (id: string) => void;
  // Session-local draft overrides for in-progress swatch edits.
  // Map<swatchId, ColorValue>. Never persisted — cleared on save / cancel /
  // close. Consumers that resolve a swatch-ref check drafts first, then fall
  // back to the saved swatch value. The page-builder canvas reads this so
  // every consumer of a swatch previews the in-progress value live as the
  // user types / drags inside the swatch editor.
  drafts: Map<string, ColorValue>;
  setDraft: (id: string, value: ColorValue) => void;
  clearDraft: (id: string) => void;
}

const SwatchContext = createContext<SwatchContextValue | null>(null);

// Stable empty map used by the no-op fallback context so consumers calling
// `Map#get` outside a provider don't blow up. Frozen-ish — we never mutate it.
const EMPTY_DRAFTS: Map<string, ColorValue> = new Map();

export function useSwatches(): SwatchContextValue {
  const ctx = useContext(SwatchContext);
  if (!ctx) {
    // Default no-op context so the picker still works in isolation.
    return {
      swatches: [],
      saveSwatch: () => {},
      updateSwatch: () => {},
      deleteSwatch: () => {},
      drafts: EMPTY_DRAFTS,
      setDraft: () => {},
      clearDraft: () => {},
    };
  }
  return ctx;
}

interface PageBuilderRootProps {
  loaderData: PageBuilderLoaderData;
}

function isViewport(value: string | null): value is ViewportSize {
  return value === "desktop" || value === "tablet" || value === "mobile";
}

function isMode(value: string | null): value is "edit" | "preview" {
  return value === "edit" || value === "preview";
}

// Top-level page-builder shell. Wraps the editor in `<PageBuilderProvider>` and
// renders the layout (sidebar | canvas | right-panel placeholder).
export function PageBuilderRoot({ loaderData }: PageBuilderRootProps) {
  const {
    lobby,
    pageLayout,
    pageKind,
    csrfToken,
    theme,
    playlists,
    defaultPlaylistId,
    lobbyOrigin,
    lobbyPreviewToken,
    socialLinks,
    loginPage,
    loginLogoImageUrl,
    loginLogoImageWidth,
    loginLogoImageHeight,
  } = loaderData;
  // Loader returns the JSON column as `unknown`; the runtime shape matches
  // SavedSwatch from the picker — cast once at this boundary so the rest of
  // the component tree can use the strong type.
  const initialSwatches = loaderData.swatches as unknown as SavedSwatch[];
  const [searchParams] = useSearchParams();

  // Seed reducer state on first render. We hydrate from URL params (selection,
  // viewport, mode, tab) so that linking back into the editor restores the
  // full UX. SSR-safe: useReducer's initializer runs once on the server and
  // the URL params come from React Router so they're identical on both passes.
  const initialState = useMemo<PageBuilderState>(() => {
    const seededSections =
      pageLayout?.sections ?? createDefaultPageLayout(defaultPlaylistId).sections;
    const vpRaw = searchParams.get("vp");
    const modeRaw = searchParams.get("mode");
    const selectionRaw = searchParams.get("selected");
    const tabRaw = searchParams.get("tab");
    return {
      mode: isMode(modeRaw) ? modeRaw : "edit",
      selection: parseSelectionParam(selectionRaw),
      viewport: isViewport(vpRaw) ? vpRaw : "desktop",
      sections: seededSections,
      dirty: false,
      saveStatus: "idle",
      lastSavedAt: null,
      rightPanelTab: parseRightPanelTabParam(tabRaw),
      theme,
      themeDirty: false,
      themeSaveStatus: "idle",
      themeLastSavedAt: null,
      playlists,
      defaultPlaylistId,
      lobbyOrigin,
      lobbyPreviewToken,
      pageKind,
      socialLinks,
      loginPage,
      loginLogoImageUrl,
      loginLogoImageWidth,
      loginLogoImageHeight,
      loginPageDirty: false,
      loginPageSaveStatus: "idle",
      loginPageLastSavedAt: null,
    };
    // We intentionally seed only once; subsequent URL changes are handled by
    // selection/viewport effects inside the inner component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <PageBuilderProvider initialState={initialState}>
      <SwatchProvider initialSwatches={initialSwatches} csrfToken={csrfToken}>
        <PageBuilderInner lobby={lobby} csrfToken={csrfToken} pageKind={pageKind} />
      </SwatchProvider>
    </PageBuilderProvider>
  );
}

// =============================================================================
// Swatch provider — owns the create_swatch / delete_swatch fetcher.
// Optimistic updates keep the picker snappy; the server is the source of truth
// (and replaces optimistic ids with real ones on successful create).
// =============================================================================

interface SwatchProviderProps {
  initialSwatches: SavedSwatch[];
  csrfToken: string;
  children: React.ReactNode;
}

type SwatchActionData =
  | { success: true; swatchId?: string; replacedCount?: number }
  | { error: string };

function SwatchProvider({ initialSwatches, csrfToken, children }: SwatchProviderProps) {
  const [swatches, setSwatches] = useState<SavedSwatch[]>(initialSwatches);

  // Session-local draft overrides for in-progress swatch edits. Map<swatchId,
  // ColorValue>. Never persisted; cleared on save / cancel / close. Consumers
  // that resolve a swatch-ref check drafts first, then fall back to the saved
  // swatch value — so the canvas previews live as the user types/drags inside
  // the swatch editor.
  const [drafts, setDrafts] = useState<Map<string, ColorValue>>(() => new Map());

  const setDraft = useCallback((id: string, value: ColorValue) => {
    setDrafts((prev) => {
      const next = new Map(prev);
      next.set(id, value);
      return next;
    });
  }, []);

  const clearDraft = useCallback((id: string) => {
    setDrafts((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  // Three separate fetchers so create/update/delete can interleave without
  // stepping on each other's optimistic state. Each fetcher's effect watches
  // its own response and reconciles its tracked optimistic change.
  const createFetcher = useFetcher<SwatchActionData>();
  const updateFetcher = useFetcher<SwatchActionData>();
  const deleteFetcher = useFetcher<SwatchActionData>();

  // Track which temp id is pending swap to a server-issued id on create.
  const [pendingTempId, setPendingTempId] = useState<string | null>(null);
  // Snapshot of the row pre-update; if the server fails we rebuild from this
  // so the user's edits revert cleanly.
  const updateSnapshotRef = useRef<SavedSwatch | null>(null);
  // Snapshot of the deleted row + its index, so a failed delete can be put
  // back at the same position.
  const deleteSnapshotRef = useRef<{ swatch: SavedSwatch; index: number } | null>(
    null
  );

  // --- create reconciliation ---
  useEffect(() => {
    if (createFetcher.state !== "idle" || !createFetcher.data) return;
    if ("success" in createFetcher.data && createFetcher.data.success) {
      const newId = createFetcher.data.swatchId;
      if (newId && pendingTempId) {
        setSwatches((prev) =>
          prev.map((s) => (s.id === pendingTempId ? { ...s, id: newId } : s))
        );
      }
      setPendingTempId(null);
    } else if ("error" in createFetcher.data) {
      if (pendingTempId) {
        setSwatches((prev) => prev.filter((s) => s.id !== pendingTempId));
      }
      setPendingTempId(null);
      toast.error(`Failed to save swatch: ${createFetcher.data.error}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createFetcher.state, createFetcher.data]);

  // --- update reconciliation ---
  useEffect(() => {
    if (updateFetcher.state !== "idle" || !updateFetcher.data) return;
    if ("success" in updateFetcher.data && updateFetcher.data.success) {
      updateSnapshotRef.current = null;
    } else if ("error" in updateFetcher.data) {
      const snap = updateSnapshotRef.current;
      if (snap) {
        setSwatches((prev) => prev.map((s) => (s.id === snap.id ? snap : s)));
      }
      updateSnapshotRef.current = null;
      toast.error(`Failed to update swatch: ${updateFetcher.data.error}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateFetcher.state, updateFetcher.data]);

  // --- delete reconciliation ---
  useEffect(() => {
    if (deleteFetcher.state !== "idle" || !deleteFetcher.data) return;
    if ("success" in deleteFetcher.data && deleteFetcher.data.success) {
      deleteSnapshotRef.current = null;
      const replaced = deleteFetcher.data.replacedCount ?? 0;
      if (replaced > 0) {
        toast.success(
          `Swatch deleted — inlined ${replaced} reference${replaced === 1 ? "" : "s"}`
        );
      }
    } else if ("error" in deleteFetcher.data) {
      const snap = deleteSnapshotRef.current;
      if (snap) {
        setSwatches((prev) => {
          const next = [...prev];
          next.splice(snap.index, 0, snap.swatch);
          return next;
        });
      }
      deleteSnapshotRef.current = null;
      toast.error(`Failed to delete swatch: ${deleteFetcher.data.error}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deleteFetcher.state, deleteFetcher.data]);

  const saveSwatch = useCallback(
    (name: string, value: ColorValue) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      // Swatches store concrete Solid/Gradient values — never refs (no
      // swatch-to-swatch nesting). Resolve refs defensively so the API stays
      // permissive for callers but the persisted shape is always concrete.
      const resolved =
        value.type === "swatch-ref" ? unlinkValue(value, swatches) : value;
      const tempId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const kind: "solid" | "gradient" = resolved.type;
      setSwatches((prev) => [
        { id: tempId, name: trimmed, kind, value: resolved },
        ...prev,
      ]);
      setPendingTempId(tempId);
      createFetcher.submit(
        {
          intent: "create_swatch",
          _csrf: csrfToken,
          name: trimmed,
          kind,
          value: JSON.stringify(resolved),
        },
        { method: "post", encType: "application/x-www-form-urlencoded" }
      );
    },
    [csrfToken, createFetcher, swatches]
  );

  const updateSwatch = useCallback(
    (id: string, name: string, value: ColorValue) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const resolved =
        value.type === "swatch-ref" ? unlinkValue(value, swatches) : value;
      const kind: "solid" | "gradient" = resolved.type;
      // Snapshot the row BEFORE applying the optimistic change so we can
      // roll back on error.
      let snapshot: SavedSwatch | null = null;
      setSwatches((prev) => {
        const existing = prev.find((s) => s.id === id);
        if (existing) snapshot = existing;
        return prev.map((s) =>
          s.id === id ? { ...s, name: trimmed, kind, value: resolved } : s
        );
      });
      updateSnapshotRef.current = snapshot;
      // Clear the in-progress draft for this swatch — the persisted value now
      // matches whatever the draft was showing, so consumers can drop the
      // override without flicker.
      clearDraft(id);
      updateFetcher.submit(
        {
          intent: "update_swatch",
          _csrf: csrfToken,
          id,
          name: trimmed,
          kind,
          value: JSON.stringify(resolved),
        },
        { method: "post", encType: "application/x-www-form-urlencoded" }
      );
    },
    [csrfToken, updateFetcher, swatches, clearDraft]
  );

  const deleteSwatch = useCallback(
    (id: string) => {
      // Snapshot row + index for rollback before filtering.
      let snapshot: { swatch: SavedSwatch; index: number } | null = null;
      setSwatches((prev) => {
        const index = prev.findIndex((s) => s.id === id);
        if (index >= 0) {
          snapshot = { swatch: prev[index], index };
        }
        return prev.filter((s) => s.id !== id);
      });
      deleteSnapshotRef.current = snapshot;
      deleteFetcher.submit(
        {
          intent: "delete_swatch",
          _csrf: csrfToken,
          id,
        },
        { method: "post", encType: "application/x-www-form-urlencoded" }
      );
    },
    [csrfToken, deleteFetcher]
  );

  const value = useMemo<SwatchContextValue>(
    () => ({
      swatches,
      saveSwatch,
      updateSwatch,
      deleteSwatch,
      drafts,
      setDraft,
      clearDraft,
    }),
    [
      swatches,
      saveSwatch,
      updateSwatch,
      deleteSwatch,
      drafts,
      setDraft,
      clearDraft,
    ]
  );

  return (
    <SwatchContext.Provider value={value}>{children}</SwatchContext.Provider>
  );
}

interface PageBuilderInnerProps {
  lobby: {
    id: string;
    name: string;
    slug: string;
    title: string | null;
    isDefault: boolean;
    hasPassword: boolean;
  };
  csrfToken: string;
  pageKind: "lobby" | "login";
}

// Hidden form payload typing for the autosave fetcher. Returned data shape is
// either { success: true } or { error: string }.
type SaveActionData = { success: true } | { error: string };

// Autosave + URL-sync wrapper. Reads from the reducer-backed context, owns the
// fetcher used for `update_page_layout`, and renders the layout shell.
function PageBuilderInner({ lobby, csrfToken, pageKind }: PageBuilderInnerProps) {
  const { state, dispatch, undo, redo } = usePageBuilder();
  const {
    sections,
    selection,
    viewport,
    theme,
    themeDirty,
    dirty,
    loginPage,
    loginPageDirty,
  } = state;
  const isPreview = state.mode === "preview";

  const [searchParams, setSearchParams] = useSearchParams();
  const [isMounted, setIsMounted] = useState(false);
  // Local UI state — the paint brush button in TopHeader toggles this; the
  // ThemeOverlay inside LeftRail reads it. Selecting any layer auto-closes the
  // overlay so the SettingsOverlay can take over.
  const [themeOverlayOpen, setThemeOverlayOpen] = useState(false);
  // Lift the theme-overlay opener so deep components (e.g. CardBlockSettings'
  // "Global styles" link) can request it without prop drilling.
  const themeOverlayApi = useMemo<ThemeOverlayContextValue>(
    () => ({
      open: themeOverlayOpen,
      setOpen: setThemeOverlayOpen,
    }),
    [themeOverlayOpen]
  );
  // Layout-edit toggle (dashed-square button in TopHeader). Default is OFF —
  // the page-builder opens in a clean, content-focused view; the user opts in
  // to layout-edit affordances (section/column borders, click-to-select,
  // resize handles, add-block menu) when they want to restructure the page.
  // Blocks remain selectable / editable regardless.
  const [showLayoutEdit, setShowLayoutEdit] = useState(false);
  // Three separate fetchers: layout (page sections + per-block theme
  // overrides), global lobby theme, and the login-page template. Keeping
  // them split avoids cross-coordination between the three dirty channels —
  // each fetcher has its own queue and never fights the others.
  const fetcher = useFetcher<SaveActionData>();
  const themeFetcher = useFetcher<SaveActionData>();
  const loginPageFetcher = useFetcher<SaveActionData>();

  // Track client-side mounting to gate the URL-sync effect — matches the
  // original PageBuilderInner so we don't rewrite the URL on first hydrate.
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Sync URL params when selection / viewport / mode change. We only update
  // params that differ from the current URL to avoid spurious history churn.
  useEffect(() => {
    if (!isMounted) return;
    const next = new URLSearchParams(searchParams);
    const selectionStr = serializeSelection(selection);
    if (selectionStr) {
      next.set("selected", selectionStr);
    } else {
      next.delete("selected");
    }
    if (viewport === "desktop") {
      next.delete("vp");
    } else {
      next.set("vp", viewport);
    }
    if (state.mode === "edit") {
      next.delete("mode");
    } else {
      next.set("mode", state.mode);
    }
    // Legacy `tab` param from the removed right panel — drop it on visit.
    if (next.has("tab")) next.delete("tab");
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [
    selection,
    viewport,
    state.mode,
    isMounted,
    searchParams,
    setSearchParams,
  ]);

  // Esc while in preview mode → return to edit mode. Other Esc handlers
  // (SettingsOverlay) only run while their UI is mounted, which is gated to
  // edit mode, so there's no conflict.
  useEffect(() => {
    if (!isPreview) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        dispatch({ type: "setMode", mode: "edit" });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isPreview, dispatch]);

  // Cmd/Ctrl+Z → undo, Cmd/Ctrl+Shift+Z (or Cmd/Ctrl+Y) → redo. We bail when
  // focus is inside an editable surface so Tiptap's own per-editor undo wins
  // for in-progress typing — the page-builder history covers everything else
  // (block reorders, inserts, deletes, theme tweaks, column resizes, etc.).
  useEffect(() => {
    if (isPreview) return;
    const handler = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod) return;
      const key = e.key.toLowerCase();
      const isUndo = key === "z" && !e.shiftKey;
      const isRedo = (key === "z" && e.shiftKey) || key === "y";
      if (!isUndo && !isRedo) return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          target.isContentEditable
        ) {
          return;
        }
      }
      e.preventDefault();
      if (isUndo) undo();
      else redo();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isPreview, undo, redo]);

  // Delete / Backspace deletes the currently-selected block. We bail when the
  // target is an editable surface (Tiptap contenteditable, input, textarea) —
  // the editor's own delete semantics MUST win there. Cards dispatch through
  // `deleteBlockFromCard` so nested children unmount cleanly.
  useEffect(() => {
    if (isPreview) return;
    if (selection.kind !== "block") return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Backspace" && e.key !== "Delete") return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          target.isContentEditable
        ) {
          return;
        }
      }
      e.preventDefault();
      if (selection.cardBlockId) {
        dispatch({
          type: "deleteBlockFromCard",
          cardBlockId: selection.cardBlockId,
          blockId: selection.blockId,
        });
      } else {
        dispatch({
          type: "deleteBlock",
          sectionId: selection.sectionId,
          columnId: selection.columnId,
          blockId: selection.blockId,
        });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isPreview, selection, dispatch]);

  // Manual save: submits every fetcher in parallel for the dirty channel(s).
  // Autosave on the login-page channel is debounced separately below; this
  // manual save still drains it eagerly when the user clicks Save (matching
  // the layout + theme channels' behaviour).
  const saveAll = useCallback(() => {
    if (dirty) {
      fetcher.submit(
        {
          intent: "update_page_layout",
          _csrf: csrfToken,
          sections: JSON.stringify(sections),
        },
        { method: "post", encType: "application/x-www-form-urlencoded" }
      );
    }
    if (themeDirty) {
      themeFetcher.submit(
        {
          intent: "update_theme",
          _csrf: csrfToken,
          theme: JSON.stringify(theme),
        },
        { method: "post", encType: "application/x-www-form-urlencoded" }
      );
    }
    if (loginPageDirty) {
      loginPageFetcher.submit(
        {
          intent: "update_login_page",
          _csrf: csrfToken,
          loginPage: JSON.stringify(loginPage),
        },
        { method: "post", encType: "application/x-www-form-urlencoded" }
      );
    }
  }, [
    dirty,
    themeDirty,
    loginPageDirty,
    sections,
    theme,
    loginPage,
    csrfToken,
    fetcher,
    themeFetcher,
    loginPageFetcher,
  ]);

  // Autosave for the login-page channel — debounced ~600ms so a slider drag
  // or a rapid sequence of color tweaks coalesces into a single POST. The
  // layout + theme channels don't autosave (manual save button); login-page
  // autosaves to match the legacy /lobby/:id/login route's "save on every
  // change" UX.
  useEffect(() => {
    if (!loginPageDirty) return;
    const handle = setTimeout(() => {
      loginPageFetcher.submit(
        {
          intent: "update_login_page",
          _csrf: csrfToken,
          loginPage: JSON.stringify(loginPage),
        },
        { method: "post", encType: "application/x-www-form-urlencoded" }
      );
    }, 600);
    return () => clearTimeout(handle);
  }, [loginPageDirty, loginPage, csrfToken, loginPageFetcher]);

  // Reflect fetcher state into reducer-tracked saveStatus.
  useEffect(() => {
    if (fetcher.state === "submitting") {
      dispatch({ type: "setSaveStatus", status: "saving" });
      return;
    }
    if (fetcher.state === "idle" && fetcher.data) {
      if ("success" in fetcher.data && fetcher.data.success) {
        const now = Date.now();
        dispatch({ type: "setSaveStatus", status: "saved", at: now });
        dispatch({ type: "markClean", at: now });
      } else if ("error" in fetcher.data) {
        dispatch({ type: "setSaveStatus", status: "error" });
      }
    }
  }, [fetcher.state, fetcher.data, dispatch]);

  // Reflect themeFetcher state into reducer-tracked themeSaveStatus.
  useEffect(() => {
    if (themeFetcher.state === "submitting") {
      dispatch({ type: "setThemeSaveStatus", status: "saving" });
      return;
    }
    if (themeFetcher.state === "idle" && themeFetcher.data) {
      if ("success" in themeFetcher.data && themeFetcher.data.success) {
        const now = Date.now();
        dispatch({ type: "setThemeSaveStatus", status: "saved", at: now });
        dispatch({ type: "markThemeClean", at: now });
      } else if ("error" in themeFetcher.data) {
        dispatch({ type: "setThemeSaveStatus", status: "error" });
      }
    }
  }, [themeFetcher.state, themeFetcher.data, dispatch]);

  // Reflect loginPageFetcher state into reducer-tracked loginPageSaveStatus.
  useEffect(() => {
    if (loginPageFetcher.state === "submitting") {
      dispatch({ type: "setLoginPageSaveStatus", status: "saving" });
      return;
    }
    if (loginPageFetcher.state === "idle" && loginPageFetcher.data) {
      if (
        "success" in loginPageFetcher.data &&
        loginPageFetcher.data.success
      ) {
        const now = Date.now();
        dispatch({ type: "setLoginPageSaveStatus", status: "saved", at: now });
        dispatch({ type: "markLoginPageClean", at: now });
      } else if ("error" in loginPageFetcher.data) {
        dispatch({ type: "setLoginPageSaveStatus", status: "error" });
      }
    }
  }, [loginPageFetcher.state, loginPageFetcher.data, dispatch]);

  // Combined "is saving" flag for the Save button label/disabled state.
  const isSaving =
    fetcher.state === "submitting" ||
    themeFetcher.state === "submitting" ||
    loginPageFetcher.state === "submitting";
  const hasUnsaved = dirty || themeDirty || loginPageDirty;

  // Block in-app navigation while there are unsaved changes — but ONLY when
  // the user is actually leaving the editor or switching to a different page
  // template. Selection/viewport/mode changes call `setSearchParams({ replace:
  // true })` which counts as a navigation; those are same-pathname AND
  // same-`page` and should never prompt. Switching the page dropdown (lobby ↔
  // login) is same-pathname but a different `page` param, and DOES need the
  // warning because the editor remounts and unsaved edits in the current
  // template would be lost.
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (!hasUnsaved) return false;
    if (currentLocation.pathname !== nextLocation.pathname) return true;
    const currPage =
      new URLSearchParams(currentLocation.search).get("page") ?? "lobby";
    const nextPage =
      new URLSearchParams(nextLocation.search).get("page") ?? "lobby";
    return currPage !== nextPage;
  });

  // Guard full page reloads / tab close. The browser renders its own native
  // dialog when `returnValue` is set on a beforeunload event.
  useEffect(() => {
    if (!hasUnsaved) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsaved]);

  const setViewportLocal = useCallback(
    (vp: ViewportSize) => dispatch({ type: "setViewport", viewport: vp }),
    [dispatch]
  );

  // When the user selects any layer, close the theme overlay so the
  // SettingsOverlay (rendered at the same z-layer) can take over.
  useEffect(() => {
    if (selection.kind !== "none" && themeOverlayOpen) {
      setThemeOverlayOpen(false);
    }
  }, [selection.kind, themeOverlayOpen]);

  // Toggling the paint brush also clears any active selection so the two
  // overlays never stack.
  const toggleThemeOverlay = useCallback(() => {
    setThemeOverlayOpen((open) => {
      const next = !open;
      if (next) dispatch({ type: "clearSelection" });
      return next;
    });
  }, [dispatch]);

  return (
    <ThemeOverlayContext.Provider value={themeOverlayApi}>
    <div className="fixed inset-0 bg-theme-primary flex flex-col z-50">
      <TopHeader
        lobby={lobby}
        pageKind={pageKind}
        themeOverlayOpen={themeOverlayOpen}
        onToggleThemeOverlay={toggleThemeOverlay}
        showLayoutEdit={showLayoutEdit}
        onToggleLayoutEdit={() => setShowLayoutEdit((v) => !v)}
        onChangeViewport={setViewportLocal}
        onSave={saveAll}
        hasUnsaved={hasUnsaved}
        isSaving={isSaving}
      />

      <div className="flex-1 flex min-h-0">
        {/* Left rail: sections navigator + sliding settings/theme overlays.
            Collapsed to zero width in preview mode. */}
        <div
          className={cn(
            "transition-all duration-300 overflow-hidden flex-shrink-0",
            isPreview ? "w-0" : "w-[340px]"
          )}
        >
          <LeftRail
            themeOverlayOpen={themeOverlayOpen}
            onCloseThemeOverlay={() => setThemeOverlayOpen(false)}
            showLayoutEdit={showLayoutEdit}
          />
        </div>

        {/* Canvas */}
        <div className="flex-1 flex flex-col min-w-0 relative">
          <Canvas
            showLayoutEdit={showLayoutEdit}
            hasPassword={lobby.hasPassword}
            csrfToken={csrfToken}
          />
        </div>
      </div>

      {/* Unsaved-changes confirm modal — replaces the native window.confirm
          when in-app navigation is blocked while there are unsaved changes. */}
      {blocker.state === "blocked" && (
        <UnsavedChangesModal
          onLeave={() => blocker.proceed()}
          onStay={() => blocker.reset()}
          onSaveAndLeave={() => {
            saveAll();
            // We don't have a "save complete" promise here; the user can
            // click Save and then re-trigger their navigation. For now,
            // saving from the modal just kicks off the save and closes the
            // modal so the user can see the indicator update. They can
            // navigate once Save completes.
            blocker.reset();
          }}
          isSaving={isSaving}
        />
      )}
    </div>
    </ThemeOverlayContext.Provider>
  );
}

interface UnsavedChangesModalProps {
  onLeave: () => void;
  onStay: () => void;
  onSaveAndLeave: () => void;
  isSaving: boolean;
}

function UnsavedChangesModal({
  onLeave,
  onStay,
  onSaveAndLeave,
  isSaving,
}: UnsavedChangesModalProps) {
  // Esc dismisses the modal (same as clicking Stay).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onStay();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onStay]);

  return (
    <div
      className="absolute inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Unsaved changes"
      onClick={onStay}
    >
      <div
        className="m-4 w-full max-w-sm bg-theme-primary border border-theme rounded-lg shadow-2xl p-5 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-theme-primary">
          Unsaved changes
        </h3>
        <p className="text-sm text-theme-secondary">
          You have unsaved changes to this page. If you leave now they
          will be lost.
        </p>
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onLeave}
            className="px-3 py-1.5 text-sm rounded-lg border border-red-500/40 text-red-300 hover:bg-red-500/10 cursor-pointer"
          >
            Leave without saving
          </button>
          <button
            type="button"
            onClick={onSaveAndLeave}
            disabled={isSaving}
            className="px-3 py-1.5 text-sm rounded-lg bg-[var(--color-brand-red)] text-white hover:bg-[var(--color-brand-red)]/90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isSaving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={onStay}
            className="px-3 py-1.5 text-sm rounded-lg border border-theme text-theme-secondary hover:bg-theme-tertiary cursor-pointer"
          >
            Stay
          </button>
        </div>
      </div>
    </div>
  );
}
