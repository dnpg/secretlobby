import { RichTextEditor } from "@secretlobby/ui";
import type { CardBlockContent } from "../../state/types";
import type { ThemeSettings } from "~/lib/theme";
import { usePageBuilder } from "../../state/provider";
import { CardThemeFields } from "../CardThemeFields";

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
        <label className="block text-sm font-medium text-white mb-2">Title</label>
        <input
          type="text"
          value={content.title}
          onChange={(e) => onUpdate({ title: e.target.value })}
          placeholder="Optional card title"
          className="w-full px-3 py-2 text-sm bg-theme-tertiary border border-theme rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-red)]"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-white mb-2">Content</label>
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
        <span className="text-sm text-gray-300">Show Border</span>
      </label>
      {block && (
        <div className="pt-3 border-t border-theme space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-theme-muted">
            Card style overrides
          </div>
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
      )}
    </>
  );
}
