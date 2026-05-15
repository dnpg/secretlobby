import { Link } from "react-router";
import { ColorModeToggle, cn } from "@secretlobby/ui";
import { getDefaultThemeForMode } from "~/lib/theme";
import type { ViewportSize } from "../state/types";
import { usePageBuilder } from "../state/provider";
import {
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
  };
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

  return (
    <header className="flex-shrink-0 h-12 bg-theme-secondary border-b border-theme flex items-center pr-4">
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
              ? "bg-[var(--color-brand-red-muted)] text-[var(--color-brand-red)]"
              : "text-theme-secondary hover:text-theme-primary hover:bg-theme-tertiary"
          )}
          title="Theme settings"
          aria-pressed={themeOverlayOpen}
          aria-label="Theme settings"
        >
          <PaintBrushIcon className="w-5 h-5" />
        </button>

        <button
          type="button"
          onClick={onToggleLayoutEdit}
          className={cn(
            "h-full px-3 flex items-center gap-2 border-r border-theme transition-colors cursor-pointer",
            showLayoutEdit
              ? "bg-[var(--color-brand-red-muted)] text-[var(--color-brand-red)]"
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

        <button
          type="button"
          onClick={() =>
            dispatch({ type: "setMode", mode: isPreview ? "edit" : "preview" })
          }
          className={cn(
            "h-full px-3 flex items-center gap-2 border-r border-theme transition-colors cursor-pointer",
            isPreview
              ? "bg-[var(--color-brand-red)] text-white hover:bg-[var(--color-brand-red)]/90"
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

        <div className="px-4 min-w-0">
          <div className="text-sm font-medium text-theme-primary truncate leading-tight">
            {lobby.title || lobby.name}
          </div>
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
              "bg-[var(--color-brand-red)] text-white hover:bg-[var(--color-brand-red)]/90",
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
