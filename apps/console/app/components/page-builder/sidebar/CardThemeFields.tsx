// =============================================================================
// CardThemeFields
// -----------------------------------------------------------------------------
// The set of Card-related theme controls, factored out of ThemeOverlay's Card
// section so it can be reused as the per-block override editor too.
//
// Two render modes:
//   - Global theme editor (ThemeOverlay): pass `showResetButtons={false}`. The
//     component reads/writes `state.theme` and never shows the
//     Modified-from-theme indicator. `baseTheme` should equal `value`.
//   - Per-block override editor (CardBlockSettings): pass
//     `showResetButtons={true}`. `value` is the merged theme (global +
//     block.themeOverrides) so each row shows the *effective* color. The
//     Modified indicator + RefreshIcon reset appear whenever the corresponding
//     theme key(s) differ from `baseTheme`. `onChange` writes into
//     `block.themeOverrides`; `onResetField(keys)` drops those keys from the
//     overrides map.
//
// All the row primitives live in `./ThemeFieldRows`. This file is purely
// composition + override/reset wiring.
// =============================================================================

import type { ThemeSettings } from "~/lib/theme";
import {
  CardBackdropFilterSubgroup,
  FieldRow,
  HexPickerRow,
  TextColorRow,
} from "./ThemeFieldRows";
import { BorderRadiusInput } from "~/components/border-radius-input";
import {
  BorderEditor,
  type BorderEditorValue,
} from "~/components/border-editor";
import {
  formatHexWithAlpha,
  parseHexWithAlpha,
} from "~/components/color-picker/utils";
import { useSwatches } from "../PageBuilderRoot";

interface CardThemeFieldsProps {
  /** Effective theme — for the global section this is `state.theme`; for
   *  per-block overrides this is the merged theme (global + block.themeOverrides). */
  value: ThemeSettings;
  /** The base / global theme — used by per-block mode to detect divergence
   *  for the Modified indicator + reset button. Pass the same as `value` when
   *  in global mode (showResetButtons=false). */
  baseTheme: ThemeSettings;
  /** Called with the partial theme update on every change. The caller decides
   *  whether to dispatch to the global theme or to the block's themeOverrides. */
  onChange: (partial: Partial<ThemeSettings>) => void;
  /** Called when the user clicks the per-field RefreshIcon reset. The caller
   *  drops these keys from its store. The array form supports rows that
   *  manage multiple theme keys at once (e.g. TextColorRow writes both
   *  `<field>` and `<field>Rich`). Only meaningful when `showResetButtons`
   *  is true. */
  onResetField?: (keys: (keyof ThemeSettings)[]) => void;
  /** Whether to show the Modified-from-theme dot + reset button on each
   *  field. Off for the global section; on for per-block overrides. */
  showResetButtons?: boolean;
}

// Shallow deep-equal for the values we actually compare here:
//   - hex string fields and selects: ===
//   - rich text values: nested object/string compare via JSON
//   - BackdropFilter arrays: per-item compare via JSON
//   - BorderRadius: either number or per-corner object
// JSON.stringify is fine since these shapes are small + serializable, and the
// only goal is "did the user diverge from the base theme".
function isDifferent(a: unknown, b: unknown): boolean {
  if (a === b) return false;
  if (a === undefined || b === undefined) return true;
  try {
    return JSON.stringify(a) !== JSON.stringify(b);
  } catch {
    return true;
  }
}

// =============================================================================
// Border-editor adapters
// -----------------------------------------------------------------------------
// The BorderEditor speaks a single `BorderEditorValue` shape; the underlying
// theme stores a flat set of legacy fields PLUS new optional structured
// fields. These functions translate between them in both directions so the
// editor can stay UI-friendly and reusable while persisted JSON stays
// backwards-compatible.
//
// Read side (themeToBorderEditorValue):
//   - Splits cardBorderColor (#RRGGBBAA) + cardBorderOpacity into a single
//     hex+alpha string for the editor's `colorHex`.
//   - Prefers the new structured fields (cardBorderStyle / cardBorderSide{Widths,Styles}
//     / cardBoxShadow).
//
// Write side (borderEditorValueToTheme):
//   - Writes the legacy color/width/opacity fields so older consumers keep
//     rendering.
//   - We no longer write cardBorderShow / cardBorderImage / cardOutline — the
//     editor doesn't expose them. The renderer now derives "has border" from
//     `cardBorderWidth > 0` instead of the explicit show flag.
// =============================================================================

const CARD_BORDER_KEYS: (keyof ThemeSettings)[] = [
  "cardBorderType",
  "cardBorderColor",
  "cardBorderOpacity",
  "cardBorderWidth",
  "cardBorderStyle",
  "cardBorderSideWidths",
  "cardBorderSideStyles",
  "cardBoxShadow",
];

function themeToBorderEditorValue(theme: ThemeSettings): BorderEditorValue {
  // Compose the legacy color + opacity into a single hex+alpha string.
  const opacity = theme.cardBorderOpacity ?? 100;
  const baseColor = theme.cardBorderColor || "#374151";
  const colorHex = formatHexWithAlpha(
    parseHexWithAlpha(baseColor)?.color ?? baseColor,
    Math.min(
      opacity,
      parseHexWithAlpha(baseColor)?.opacity ?? 100
    )
  );

  return {
    style: theme.cardBorderStyle ?? "solid",
    width: theme.cardBorderWidth ?? "1px",
    colorHex,
    sideWidths: theme.cardBorderSideWidths,
    sideStyles: theme.cardBorderSideStyles,
    boxShadow: theme.cardBoxShadow,
  };
}

function borderEditorValueToTheme(
  next: BorderEditorValue
): Partial<ThemeSettings> {
  // Split colorHex back into color + opacity for the legacy fields.
  const parsed = parseHexWithAlpha(next.colorHex) ?? {
    color: next.colorHex,
    opacity: 100,
  };

  return {
    // Legacy mirrors — width / color / opacity stay so older renderers keep
    // painting the same border. cardBorderType is forced to "solid" because
    // the editor no longer surfaces gradient borders (border-image was
    // removed).
    cardBorderType: "solid",
    cardBorderColor: parsed.color,
    cardBorderOpacity: parsed.opacity,
    cardBorderWidth: next.width,
    // New structured fields.
    cardBorderStyle: next.style,
    cardBorderSideWidths: next.sideWidths,
    cardBorderSideStyles: next.sideStyles,
    cardBoxShadow: next.boxShadow,
  };
}

export function CardThemeFields({
  value,
  baseTheme,
  onChange,
  onResetField,
  showResetButtons = false,
}: CardThemeFieldsProps) {
  // Swatch context — BorderEditor forwards these into its nested ColorPickers
  // (border color, border-image gradient). HexPickerRow / TextColorRow pull
  // the same context internally, so this hook is the single source for the
  // BorderEditor pass-through.
  const {
    swatches,
    saveSwatch,
    updateSwatch,
    deleteSwatch,
    setDraft,
    clearDraft,
  } = useSwatches();
  // Helper: build the modified flag for one or more theme keys.
  const isModified = (keys: (keyof ThemeSettings)[]): boolean => {
    if (!showResetButtons) return false;
    return keys.some((k) => isDifferent(value[k], baseTheme[k]));
  };
  // Helper: wire a row's RefreshIcon to call back into the caller with the
  // exact keys this row owns. Returns undefined when reset buttons are off so
  // the wrapper renders nothing.
  const makeReset =
    (keys: (keyof ThemeSettings)[]): (() => void) | undefined =>
      showResetButtons && onResetField ? () => onResetField(keys) : undefined;

  // Convenience for rows that don't have their own internal label rendering —
  // when reset buttons are on, we wrap the row in <FieldRow> so the label,
  // dot, and reset button all live in the same horizontal strip. When reset
  // buttons are off (global mode), we let the row render its own label.
  const wrap = (
    label: string,
    keys: (keyof ThemeSettings)[],
    children: React.ReactNode
  ) => {
    if (!showResetButtons) return children;
    return (
      <FieldRow
        label={label}
        modified={isModified(keys)}
        onReset={makeReset(keys)}
      >
        {children}
      </FieldRow>
    );
  };

  return (
    <>
      {/* Background — simplified to a single hex+alpha picker. Writing the
          Background here clamps `cardBgType` to "solid" alongside so the card
          renderer doesn't keep painting a stale gradient. Modified detection
          watches both keys, and resetting clears both. */}
      {wrap(
        "Background",
        ["cardBgColor", "cardBgType"],
        <HexPickerRow
          label="Background"
          value={value.cardBgColor}
          onChange={(v) =>
            onChange({
              cardBgColor: v,
              cardBgType: "solid",
            })
          }
          renderLabel={!showResetButtons}
        />
      )}

      {/* Backdrop filter — collapsible subgroup. The subgroup renders its own
          header (with the active-count badge), so we don't wrap it in a
          FieldRow. The Modified dot + reset live inline next to the header. */}
      {showResetButtons ? (
        <div className="space-y-1">
          {isModified(["cardBackdropFilter"]) && (
            <div className="flex items-center justify-between gap-2 px-1">
              <span className="text-xs text-theme-secondary flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-brand-red)] flex-shrink-0" />
                <span>Backdrop filter modified</span>
              </span>
              <button
                type="button"
                onClick={makeReset(["cardBackdropFilter"])}
                className="text-[10px] text-theme-muted hover:text-theme-primary cursor-pointer underline"
                title="Reset to theme value"
              >
                Reset
              </button>
            </div>
          )}
          <CardBackdropFilterSubgroup
            value={value.cardBackdropFilter ?? []}
            onChange={(filters) => onChange({ cardBackdropFilter: filters })}
          />
        </div>
      ) : (
        <CardBackdropFilterSubgroup
          value={value.cardBackdropFilter ?? []}
          onChange={(filters) => onChange({ cardBackdropFilter: filters })}
        />
      )}

      {wrap(
        "Heading color",
        ["cardHeadingColor", "cardHeadingColorRich"],
        <TextColorRow
          label="Heading color"
          legacyValue={value.cardHeadingColor}
          richValue={value.cardHeadingColorRich}
          onChange={({ legacy, rich }) =>
            onChange({
              cardHeadingColor: legacy,
              cardHeadingColorRich: rich,
            })
          }
          renderLabel={!showResetButtons}
        />
      )}

      {wrap(
        "Content color",
        ["cardContentColor", "cardContentColorRich"],
        <TextColorRow
          label="Content color"
          legacyValue={value.cardContentColor}
          richValue={value.cardContentColorRich}
          onChange={({ legacy, rich }) =>
            onChange({
              cardContentColor: legacy,
              cardContentColorRich: rich,
            })
          }
          renderLabel={!showResetButtons}
        />
      )}

      {/* Border radius — sits at the top of the Border section so users hit
          the most-tweaked control first. BorderRadiusInput owns its label /
          legend internally; the FieldRow wrapper would double up labels and
          break its corner UI, so in override mode we render the dot + reset
          above the input (mirrors the backdrop-filter row pattern). */}
      {showResetButtons ? (
        <div className="space-y-1">
          {isModified(["cardBorderRadius"]) && (
            <div className="flex items-center justify-between gap-2 px-1">
              <span className="text-xs text-theme-secondary flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-brand-red)] flex-shrink-0" />
                <span>Border radius modified</span>
              </span>
              <button
                type="button"
                onClick={makeReset(["cardBorderRadius"])}
                className="text-[10px] text-theme-muted hover:text-theme-primary cursor-pointer underline"
                title="Reset to theme value"
              >
                Reset
              </button>
            </div>
          )}
          <BorderRadiusInput
            label="Border radius"
            value={value.cardBorderRadius}
            min={0}
            max={9999}
            onChange={(v) => onChange({ cardBorderRadius: v })}
          />
        </div>
      ) : (
        <BorderRadiusInput
          label="Border radius"
          value={value.cardBorderRadius}
          min={0}
          max={9999}
          onChange={(v) => onChange({ cardBorderRadius: v })}
        />
      )}

      {/* Border editor — width / style / colour / box-shadow only. Border
          appears when any effective width > 0 (no separate show toggle). The
          CARD_BORDER_KEYS list below tracks every theme key the editor may
          write — used by the override Modified/Reset row above the component
          AND by CardBlockSettings' "Reset all overrides" button. */}
      {showResetButtons && (() => {
        const modifiedKeys = CARD_BORDER_KEYS.filter((k) =>
          isDifferent(value[k], baseTheme[k])
        );
        if (modifiedKeys.length === 0) return null;
        return (
          <div className="flex items-center justify-between gap-2 px-1">
            <span className="text-xs text-theme-secondary flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-brand-red)] flex-shrink-0" />
              <span>Border modified ({modifiedKeys.length})</span>
            </span>
            <button
              type="button"
              onClick={() =>
                onResetField && onResetField(modifiedKeys)
              }
              className="text-[10px] text-theme-muted hover:text-theme-primary cursor-pointer underline"
              title="Reset all border fields to theme value"
            >
              Reset
            </button>
          </div>
        );
      })()}
      <BorderEditor
        value={themeToBorderEditorValue(value)}
        onChange={(next) => onChange(borderEditorValueToTheme(next))}
        swatches={swatches}
        onSaveSwatch={saveSwatch}
        onUpdateSwatch={updateSwatch}
        onDeleteSwatch={deleteSwatch}
        setDraft={setDraft}
        clearDraft={clearDraft}
      />
    </>
  );
}
