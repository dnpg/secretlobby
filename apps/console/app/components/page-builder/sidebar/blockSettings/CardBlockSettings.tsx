import type { CardBlockContent } from "../../state/types";
import type { ThemeSettings } from "~/lib/theme";
import { usePageBuilder } from "../../state/provider";
import { useThemeOverlay } from "../../PageBuilderRoot";
import { CardThemeFields } from "../CardThemeFields";

interface CardBlockSettingsProps {
  blockId: string;
  content: CardBlockContent;
  onUpdate: (content: Partial<CardBlockContent>) => void;
}

// Per-block Card editor. After the page-builder overhaul, the Card is a
// nested container of blocks (Heading / Paragraph / Image / etc.) — the
// rich-text body editor is gone. This sidebar surface keeps just the
// per-block-specific bits:
//   - optional Title rename (kept on the type for back-compat with stored
//     layouts; users are encouraged to use a Heading sub-block instead)
//   - a help line pointing to the in-canvas slash menu
//   - the existing theme-override surface (CardThemeFields + reset)
export function CardBlockSettings({
  blockId,
  content,
  onUpdate,
}: CardBlockSettingsProps) {
  const { state, dispatch } = usePageBuilder();
  const { setOpen: setThemeOverlayOpen } = useThemeOverlay();
  // Walk to the block. Cheap — block settings already iterate this tree.
  const block = (() => {
    for (const section of state.sections) {
      for (const column of section.columns) {
        const b = column.blocks.find((bb) => bb.id === blockId);
        if (b) return b;
      }
    }
    return null;
  })();
  const overrides: Partial<ThemeSettings> = block?.themeOverrides ?? {};
  const effectiveTheme: ThemeSettings = { ...state.theme, ...overrides };

  // Drop one or more override keys from this block. Reuses the existing
  // clear-then-reapply pattern; see CardThemeFields for the full rationale.
  const resetFields = (keys: (keyof ThemeSettings)[]) => {
    const next: Partial<ThemeSettings> = { ...overrides };
    for (const k of keys) delete next[k];
    dispatch({ type: "clearBlockThemeOverrides", blockId });
    if (Object.keys(next).length > 0) {
      dispatch({
        type: "updateBlockThemeOverrides",
        blockId,
        overrides: next,
      });
    }
  };

  return (
    <>
      <div>
        <label className="block text-sm font-medium text-theme-primary mb-2">
          Title
        </label>
        <input
          type="text"
          value={content.title ?? ""}
          onChange={(e) => onUpdate({ title: e.target.value })}
          placeholder="Optional card title"
          className="w-full px-3 py-2 text-sm bg-theme-tertiary border border-theme rounded-lg text-theme-primary placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-red)]"
        />
        <p className="mt-2 text-xs text-theme-muted">
          Card holds a stack of blocks. Type{" "}
          <kbd className="px-1 py-0.5 rounded bg-theme-tertiary border border-theme text-theme-primary text-[11px]">
            /
          </kbd>{" "}
          inside the card to add headings, lists, tables, and images. Cards
          can&rsquo;t nest cards or contain players or galleries.
        </p>
      </div>
      {block && (() => {
        const hasAnyOverrides = Object.keys(overrides).length > 0;
        return (
          <div className="pt-3 border-t border-theme space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-theme-muted">
                Card style overrides
              </div>
              <button
                type="button"
                onClick={() => setThemeOverlayOpen(true)}
                className="text-xs text-[var(--color-brand-red)] hover:underline cursor-pointer"
                title="Edit the global Card theme settings"
              >
                Global styles →
              </button>
            </div>
            {hasAnyOverrides && (
              <button
                type="button"
                onClick={() =>
                  dispatch({ type: "clearBlockThemeOverrides", blockId })
                }
                className="w-full px-2 py-1 text-xs text-red-400 hover:text-red-300 border border-red-500/30 hover:border-red-500/50 rounded cursor-pointer"
                title="Clear every Card override on this block and inherit the global theme"
              >
                Reset all overrides
              </button>
            )}
            <CardThemeFields
              value={effectiveTheme}
              baseTheme={state.theme}
              showResetButtons
              onChange={(partial) =>
                dispatch({
                  type: "updateBlockThemeOverrides",
                  blockId,
                  overrides: partial,
                })
              }
              onResetField={resetFields}
            />
          </div>
        );
      })()}
    </>
  );
}
