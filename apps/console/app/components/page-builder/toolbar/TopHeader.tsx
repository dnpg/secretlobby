import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { ColorModeToggle, cn } from "@secretlobby/ui";
import { getDefaultThemeForMode } from "~/lib/theme";
import type { ViewportSize } from "../state/types";
import { usePageBuilder } from "../state/provider";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  DashedSquareIcon,
  EyeIcon,
  PaintBrushIcon,
  PencilIcon,
} from "../icons";
import { SaveStatusIndicator } from "./SaveStatusIndicator";
import { ViewportSwitcher } from "./ViewportSwitcher";

// =============================================================================
// TopHeader
// -----------------------------------------------------------------------------
// Long header that spans the full width of the page-builder shell. Replaces
// both the LeftRail's old header and the previous center toolbar.
// Layout:
//   Left cluster:  back chevron (≥40px hit area) · paint brush · preview toggle
//                  · lobby title block
//   Right cluster: save status indicator · viewport switcher
// =============================================================================

interface TopHeaderProps {
  lobby: {
    id: string;
    name: string;
    slug: string;
    title: string | null;
    isDefault: boolean;
    // True when the lobby has a password gate. Drives the Logout-button
    // preview in the right cluster so designers see how the published lobby
    // will look when the gate is on.
    hasPassword: boolean;
  };
  pageKind: "lobby" | "login";
  themeOverlayOpen: boolean;
  onToggleThemeOverlay: () => void;
  showLayoutEdit: boolean;
  onToggleLayoutEdit: () => void;
  onChangeViewport: (vp: ViewportSize) => void;
  onSave: () => void;
  hasUnsaved: boolean;
  isSaving: boolean;
}

export function TopHeader({
  lobby,
  pageKind,
  themeOverlayOpen,
  onToggleThemeOverlay,
  showLayoutEdit,
  onToggleLayoutEdit,
  onChangeViewport,
  onSave,
  hasUnsaved,
  isSaving,
}: TopHeaderProps) {
  const { state, dispatch } = usePageBuilder();
  const {
    mode,
    viewport,
    saveStatus,
    lastSavedAt,
    dirty,
    themeSaveStatus,
    themeLastSavedAt,
    themeDirty,
    theme,
  } = state;
  const isPreview = mode === "preview";
  const onResetTheme = () => {
    dispatch({
      type: "resetTheme",
      theme: getDefaultThemeForMode(theme.colorMode),
    });
  };

  // Page-kind dropdown — switches the canvas between editing the lobby's
  // main page layout and the dedicated login-page layout via `?page=` on the
  // current path. Click-outside / Esc close the menu.
  const navigate = useNavigate();
  const location = useLocation();
  const [pageMenuOpen, setPageMenuOpen] = useState(false);
  const pageMenuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!pageMenuOpen) return;
    const onPointer = (e: MouseEvent) => {
      if (!pageMenuRef.current) return;
      if (!pageMenuRef.current.contains(e.target as Node)) {
        setPageMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPageMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [pageMenuOpen]);

  const selectPageKind = (next: "lobby" | "login") => {
    setPageMenuOpen(false);
    if (next === pageKind) return;
    const params = new URLSearchParams(location.search);
    if (next === "login") {
      params.set("page", "login");
    } else {
      params.delete("page");
    }
    // Drop selection/tab params so the new layout starts in a clean state.
    params.delete("selected");
    params.delete("tab");
    const qs = params.toString();
    navigate(`${location.pathname}${qs ? `?${qs}` : ""}`, { replace: true });
  };

  const pageKindLabel = pageKind === "login" ? "Login page" : "Lobby page";

  return (
    <header className="shrink-0 h-12 bg-theme-secondary border-b border-theme flex items-center pr-4">
      {/* Left cluster */}
      <div className="flex items-center h-full">
        <Link
          to={`/lobby/${lobby.id}`}
          className="h-full w-12 flex items-center justify-center border-r border-theme text-theme-secondary hover:text-theme-primary hover:bg-theme-tertiary transition-colors cursor-pointer"
          title="Close Page Builder"
          aria-label="Close Page Builder"
        >
          <ChevronLeftIcon className="w-6 h-6" />
        </Link>

        <button
          type="button"
          onClick={onToggleThemeOverlay}
          className={cn(
            "h-full px-3 flex items-center gap-2 border-r border-theme transition-colors cursor-pointer",
            themeOverlayOpen
              ? "bg-(--color-brand-red-muted) text-(--color-brand-red)"
              : "text-theme-secondary hover:text-theme-primary hover:bg-theme-tertiary"
          )}
          title="Theme settings"
          aria-pressed={themeOverlayOpen}
          aria-label="Theme settings"
        >
          <PaintBrushIcon className="w-5 h-5" />
        </button>

        {/* Layout-edit toggle is hidden for the login-page template — that
            view is a fixed template with no sections/columns to restructure. */}
        {pageKind !== "login" && (
          <button
            type="button"
            onClick={onToggleLayoutEdit}
            className={cn(
              "h-full px-3 flex items-center gap-2 border-r border-theme transition-colors cursor-pointer",
              showLayoutEdit
                ? "bg-(--color-brand-red-muted) text-(--color-brand-red)"
                : "text-theme-secondary hover:text-theme-primary hover:bg-theme-tertiary"
            )}
            title={
              showLayoutEdit
                ? "Hide section & column edit affordances"
                : "Show section & column edit affordances"
            }
            aria-pressed={showLayoutEdit}
            aria-label="Toggle section and column editing"
          >
            <DashedSquareIcon className="w-5 h-5" />
          </button>
        )}

        <button
          type="button"
          onClick={() =>
            dispatch({ type: "setMode", mode: isPreview ? "edit" : "preview" })
          }
          className={cn(
            "h-full px-3 flex items-center gap-2 border-r border-theme transition-colors cursor-pointer",
            isPreview
              ? "bg-(--color-brand-red) text-white hover:bg-(--color-brand-red)/90"
              : "text-theme-secondary hover:text-theme-primary hover:bg-theme-tertiary"
          )}
          title={isPreview ? "Return to edit mode" : "Preview the page"}
          aria-pressed={isPreview}
          aria-label={isPreview ? "Exit preview" : "Preview"}
        >
          {isPreview ? (
            <PencilIcon className="w-5 h-5" />
          ) : (
            <EyeIcon className="w-5 h-5" />
          )}
        </button>

        <div ref={pageMenuRef} className="relative h-full">
          <button
            type="button"
            onClick={() => setPageMenuOpen((v) => !v)}
            className={cn(
              "h-full px-3 flex items-center gap-2 border-r border-theme transition-colors cursor-pointer min-w-0",
              pageMenuOpen
                ? "bg-theme-tertiary text-theme-primary"
                : "text-theme-secondary hover:text-theme-primary hover:bg-theme-tertiary"
            )}
            aria-haspopup="menu"
            aria-expanded={pageMenuOpen}
            aria-label="Switch page layout"
            title="Switch page layout"
          >
            <div className="text-left min-w-0">
              <div className="text-sm font-medium text-theme-primary truncate leading-tight">
                {pageKindLabel}
              </div>
              <div className="text-[11px] text-theme-muted truncate leading-tight">
                {lobby.title || lobby.name}
              </div>
            </div>
            <ChevronDownIcon />
          </button>
          {pageMenuOpen && (
            <div
              role="menu"
              className="absolute left-0 top-full mt-1 min-w-50 bg-theme-secondary border border-theme rounded-md shadow-lg py-1 z-50"
            >
              {(["lobby", "login"] as const).map((kind) => {
                const label = kind === "login" ? "Login page" : "Lobby page";
                const active = pageKind === kind;
                return (
                  <button
                    key={kind}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    onClick={() => selectPageKind(kind)}
                    className={cn(
                      "w-full text-left px-3 py-1.5 text-sm flex items-center justify-between gap-2 cursor-pointer transition-colors",
                      active
                        ? "text-(--color-brand-red) bg-(--color-brand-red-muted)"
                        : "text-theme-secondary hover:text-theme-primary hover:bg-theme-tertiary"
                    )}
                  >
                    <span>{label}</span>
                    {active && (
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right cluster */}
      <div className="ml-auto flex items-center gap-4">
        {themeOverlayOpen && (
          <button
            type="button"
            onClick={onResetTheme}
            className="px-3 py-1.5 rounded-md text-sm font-medium border border-red-500/40 text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors cursor-pointer"
            title="Reset all theme tokens to defaults"
            aria-label="Reset theme"
          >
            Reset
          </button>
        )}
        {hasUnsaved && (
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving}
            className={cn(
              "px-3 py-1.5 rounded-md text-sm font-medium cursor-pointer transition-colors",
              "bg-(--color-brand-red) text-white hover:bg-(--color-brand-red)/90",
              "disabled:opacity-60 disabled:cursor-not-allowed"
            )}
            title={isSaving ? "Saving changes…" : "Save changes"}
            aria-label="Save changes"
          >
            {isSaving ? "Saving…" : "Save"}
          </button>
        )}
        <SaveStatusIndicator
          saveStatus={saveStatus}
          lastSavedAt={lastSavedAt}
          dirty={dirty}
          themeSaveStatus={themeSaveStatus}
          themeLastSavedAt={themeLastSavedAt}
          themeDirty={themeDirty}
        />
        <ColorModeToggle />
        <ViewportSwitcher viewport={viewport} onChange={onChangeViewport} />
      </div>
    </header>
  );
}
