import { RichTextEditor } from "@secretlobby/ui";
import type { CardBlockContent } from "../../state/types";
import type { ThemeSettings } from "~/lib/theme";
import { usePageBuilder } from "../../state/provider";
import { useThemeOverlay } from "../../PageBuilderRoot";
import { CardThemeFields } from "../CardThemeFields";

// Theme keys this panel manages. Used to count active overrides for the
// "Reset all overrides" affordance — overrides outside this list (if any
// future block kind ever stores them on a Card block) survive the bulk reset.
const CARD_THEME_KEYS = new Set<keyof ThemeSettings>([
  "cardBgColor",
  "cardBgType",
  "cardBgOpacity",
  "cardBackdropFilter",
  "cardHeadingColor",
  "cardHeadingColorRich",
  "cardContentColor",
  "cardContentColorRich",
  // Border — legacy flat fields kept for back-compat consumers.
  "cardBorderShow",
  "cardBorderType",
  "cardBorderColor",
  "cardBorderGradientFrom",
  "cardBorderGradientTo",
  "cardBorderGradientAngle",
  "cardBorderOpacity",
  "cardBorderWidth",
  // Border — new CSS3 structured fields owned by BorderEditor.
  "cardBorderStyle",
  "cardBorderSideWidths",
  "cardBorderSideStyles",
  "cardBorderImage",
  "cardOutline",
  "cardBoxShadow",
  "cardBorderRadius",
]);

interface CardBlockSettingsProps {
  blockId: string;
  content: CardBlockContent;
  onUpdate: (content: Partial<CardBlockContent>) => void;
}

// Per-block Card editor. The colour / border / backdrop fields are reused
// straight from the global Theme → Card section (CardThemeFields). The only
// per-block-specific UI here is the Title + Content + the legacy
// "Show Border" content toggle. Theme overrides live on
// `block.themeOverrides` and are dispatched through the existing
// updateBlockThemeOverrides / clearBlockThemeOverrides reducer actions.
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
  // Effective theme = global theme shallow-merged with this block's overrides.
  // CardThemeFields reads this as the displayed value. baseTheme stays the
  // pristine global theme so the Modified indicator + reset compare against
  // the right thing.
  const effectiveTheme: ThemeSettings = { ...state.theme, ...overrides };

  // Drop one or more override keys from this block. The reducer's
  // `updateBlockThemeOverrides` only does shallow merges, and
  // `clearBlockThemeOverrides` wipes the entire map — so to remove a single
  // key we clear and re-apply the survivors. Same pattern the legacy
  // BlockColorOverrides used.
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
        <label className="block text-sm font-medium text-theme-primary mb-2">Title</label>
        <input
          type="text"
          value={content.title}
          onChange={(e) => onUpdate({ title: e.target.value })}
          placeholder="Optional card title"
          className="w-full px-3 py-2 text-sm bg-theme-tertiary border border-theme rounded-lg text-theme-primary placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-red)]"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-theme-primary mb-2">Content</label>
        <RichTextEditor
          defaultValue={content.content}
          onChange={(html) => onUpdate({ content: html })}
          placeholder="Card content..."
          features={["bold", "italic", "underline", "link", "bulletList", "orderedList", "textAlign"]}
        />
      </div>
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={content.showBorder}
          onChange={(e) => onUpdate({ showBorder: e.target.checked })}
          className="accent-[var(--color-brand-red)]"
        />
        <span className="text-sm text-theme-secondary">Show Border</span>
      </label>
      {block && (() => {
        // Count overrides that belong to the Card panel — used to decide
        // whether the "Reset all" button is meaningful.
        const cardOverrideKeys = (
          Object.keys(overrides) as (keyof ThemeSettings)[]
        ).filter((k) => CARD_THEME_KEYS.has(k));
        const hasCardOverrides = cardOverrideKeys.length > 0;
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
            {hasCardOverrides && (
              <button
                type="button"
                onClick={() => resetFields(cardOverrideKeys)}
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
