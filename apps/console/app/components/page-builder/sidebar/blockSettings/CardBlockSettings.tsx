import { useState } from "react";
import type { CardBlockContent } from "../../state/types";
import type { ThemeSettings } from "~/lib/theme";
import { usePageBuilder } from "../../state/provider";
import { CardThemeFields } from "../CardThemeFields";
import { ThemeOverrideAccordion } from "../ThemeOverrideAccordion";
import { BoxPaddingInput } from "~/components/box-padding-input";
import { RefreshIcon } from "../../icons";

// Default uniform padding mirrors the legacy `p-4` Tailwind class CardBlock
// used to apply before the per-card padding override existed. Kept here as
// a named constant so the renderer and the settings panel agree on what
// "no override" means visually.
const DEFAULT_CARD_PADDING = 16;

interface CardBlockSettingsProps {
  blockId: string;
  content: CardBlockContent;
  onUpdate: (content: Partial<CardBlockContent>) => void;
}

// Per-block Card editor. After the page-builder overhaul, the Card is a
// nested container of blocks (Heading / Paragraph / Image / etc.) — the
// rich-text body editor is gone. This sidebar surface keeps just the
// per-block-specific bits:
//   - a help line pointing to the in-canvas slash menu
//   - the theme-override surface (CardThemeFields + reset)
//   - per-card padding override (last block-specific section before the
//     universal Margin-bottom row appended by BlockSettings)
//
// Title input was removed — the recommended pattern is a Heading sub-block
// at index 0 inside the card. The `title` field stays on the type for
// back-compat with stored layouts; nothing in the editor writes it now.
export function CardBlockSettings({
  blockId,
  content,
  onUpdate,
}: CardBlockSettingsProps) {
  const { state, dispatch } = usePageBuilder();

  // Walk to the block — single-pass lookup matching PlayerBlockSettings.
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
  const hasAnyOverrides = Object.keys(overrides).length > 0;
  // Override toggle — mirrors the Player pattern. ON routes
  // `<CardThemeFields/>` edits into `block.themeOverrides`; OFF routes
  // them to the global theme. Seeded from "does this block already have
  // overrides" so an existing override-card opens in override-mode.
  const [overrideActive, setOverrideActive] = useState(hasAnyOverrides);
  const effectiveTheme: ThemeSettings = { ...state.theme, ...overrides };
  const handleThemeChange = (partial: Partial<ThemeSettings>) => {
    if (overrideActive) {
      dispatch({
        type: "updateBlockThemeOverrides",
        blockId,
        overrides: partial,
      });
    } else {
      dispatch({ type: "updateTheme", partial });
    }
  };
  const handleOverrideToggle = (next: boolean) => {
    setOverrideActive(next);
    // Flipping the toggle OFF clears every per-block override so the card
    // snaps back to the global theme. Flipping it ON without prior
    // overrides is a no-op until the user edits a field.
    if (!next && hasAnyOverrides) {
      dispatch({ type: "clearBlockThemeOverrides", blockId });
    }
  };

  return (
    <>
      <p className="text-xs text-theme-muted">
        Card holds a stack of blocks. Type{" "}
        <kbd className="px-1 py-0.5 rounded bg-theme-tertiary border border-theme text-theme-primary text-[11px]">
          /
        </kbd>{" "}
        inside the card to add headings, lists, tables, and images. Cards
        can&rsquo;t nest cards or contain players or galleries.
      </p>

      {block && (
        // Same accordion + override toggle pattern used by PlayerBlockSettings —
        // single source of truth in ThemeOverrideAccordion. The body is
        // <CardThemeFields/> wired to either global theme or per-block
        // overrides based on `overrideActive`. We deliberately don't pass
        // `showResetButtons` here — the override toggle itself drives the
        // "back to global theme" UX (flipping it off clears overrides).
        <ThemeOverrideAccordion
          title="Theme"
          hasAnyOverrides={hasAnyOverrides}
          overrideActive={overrideActive}
          onOverrideToggle={handleOverrideToggle}
        >
          <CardThemeFields
            value={effectiveTheme}
            baseTheme={state.theme}
            onChange={handleThemeChange}
          />
        </ThemeOverrideAccordion>
      )}

      {/* Padding — pinned to the bottom of the card-specific panel so the
          universal Margin-bottom row (appended by BlockSettings) sits at
          the very end and the spacing controls cluster together at the
          tail of the panel. Figma-style collapse/expand input; default
          (when unset) is the legacy 16px on all sides. */}
      <div className="pt-3 border-t border-theme">
        <div className="flex items-center justify-between gap-2 mb-1">
          <label className="text-sm font-medium text-theme-primary flex items-center gap-1.5">
            <span>Padding</span>
            {content.padding !== undefined && (
              <span
                className="w-1.5 h-1.5 rounded-full bg-[var(--color-brand-red)] flex-shrink-0"
                aria-label="Modified from default"
                title="Modified from default (16)"
              />
            )}
          </label>
          {content.padding !== undefined && (
            <button
              type="button"
              onClick={() => onUpdate({ padding: undefined })}
              className="p-1 rounded text-theme-muted hover:text-theme-primary hover:bg-theme-tertiary cursor-pointer transition-colors"
              title="Reset to default (16)"
              aria-label="Reset padding to default"
            >
              <RefreshIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <BoxPaddingInput
          value={content.padding ?? DEFAULT_CARD_PADDING}
          onChange={(next) => onUpdate({ padding: next })}
          min={0}
          max={512}
        />
      </div>
    </>
  );
}
