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
//   - Prefers the new structured fields (cardBorderImage / cardBorderStyle /
//     cardBorderSide{Widths,Styles} / cardOutline / cardBoxShadow). When the
//     new image field is absent but the legacy fields say `type === "gradient"`,
//     synthesizes a `cardBorderImage` so the user sees their existing gradient
//     in the new editor.
//
// Write side (borderEditorValueToTheme):
//   - Always writes the legacy fields too so older consumers keep rendering.
//   - cardBorderType collapses to "gradient" when an image of type "gradient"
//     is present; "solid" otherwise (image of type "image" doesn't fit the
//     legacy enum, so consumers that only read the legacy fields fall back
//     to the solid color path).
// =============================================================================

const CARD_BORDER_KEYS: (keyof ThemeSettings)[] = [
  "cardBorderShow",
  "cardBorderType",
  "cardBorderColor",
  "cardBorderGradientFrom",
  "cardBorderGradientTo",
  "cardBorderGradientAngle",
  "cardBorderOpacity",
  "cardBorderWidth",
  "cardBorderStyle",
  "cardBorderSideWidths",
  "cardBorderSideStyles",
  "cardBorderImage",
  "cardOutline",
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

  // Synthesize a gradient border-image from the legacy fields when the new
  // structured cardBorderImage is absent — keeps existing gradient borders
  // visible inside the new editor without forcing migration.
  let image = theme.cardBorderImage;
  if (!image && theme.cardBorderType === "gradient") {
    image = {
      source: {
        type: "gradient",
        gradient: {
          kind: "linear",
          angle: theme.cardBorderGradientAngle ?? 135,
          stops: [
            {
              id: "legacy-stop-0",
              position: 0,
              color: theme.cardBorderGradientFrom,
              opacity: 100,
            },
            {
              id: "legacy-stop-100",
              position: 100,
              color: theme.cardBorderGradientTo,
              opacity: 100,
            },
          ],
        },
      },
      slice: 1,
      width: "1",
      outset: "0",
      repeat: "stretch",
    };
  }

  return {
    show: theme.cardBorderShow,
    style: theme.cardBorderStyle ?? "solid",
    width: theme.cardBorderWidth ?? "1px",
    colorHex,
    sideWidths: theme.cardBorderSideWidths,
    sideStyles: theme.cardBorderSideStyles,
    image,
    outline: theme.cardOutline,
    boxShadow: theme.cardBoxShadow,
  };
}

function borderEditorValueToTheme(
  next: BorderEditorValue,
  prev: ThemeSettings
): Partial<ThemeSettings> {
  // Split colorHex back into color + opacity for the legacy fields.
  const parsed = parseHexWithAlpha(next.colorHex) ?? {
    color: next.colorHex,
    opacity: 100,
  };

  // Legacy cardBorderType — keep "gradient" only when the new image is a
  // gradient AND there's no other higher-precedence source. Image-type
  // border-images don't map to the legacy enum, so we fall back to "solid"
  // (legacy consumers ignore the new field anyway).
  const legacyType: "solid" | "gradient" =
    next.image?.source.type === "gradient" ? "gradient" : "solid";

  // When the new image is a gradient, mirror its first/last stops + angle
  // back into the legacy fields so older renderers keep painting the
  // gradient. Image-type sources can't be expressed in the legacy fields, so
  // those keep their previous values untouched.
  let legacyGradient: Partial<ThemeSettings> = {};
  if (next.image?.source.type === "gradient") {
    const g = next.image.source.gradient;
    if (g.kind === "linear") {
      const sorted = [...g.stops].sort((a, b) => a.position - b.position);
      legacyGradient = {
        cardBorderGradientFrom: sorted[0]?.color ?? prev.cardBorderGradientFrom,
        cardBorderGradientTo:
          sorted[sorted.length - 1]?.color ?? prev.cardBorderGradientTo,
        cardBorderGradientAngle: g.angle,
      };
    }
  }

  return {
    // Legacy mirrors — always written so back-compat consumers stay healthy.
    cardBorderShow: next.show,
    cardBorderType: legacyType,
    cardBorderColor: parsed.color,
    cardBorderOpacity: parsed.opacity,
    cardBorderWidth: next.width,
    ...legacyGradient,
    // New structured fields.
    cardBorderStyle: next.style,
    cardBorderSideWidths: next.sideWidths,
    cardBorderSideStyles: next.sideStyles,
    cardBorderImage: next.image,
    cardOutline: next.outline,
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

      {/* Border editor — replaces the previous inline rows. The new component
          handles CSS3 borders end-to-end: per-side widths/styles, border-image
          (gradient OR uploaded image with slice/width/outset/repeat), outline,
          box-shadow, and a one-click Glass mode preset.

          The CARD_BORDER_KEYS list below tracks every theme key the editor
          may write — used by the override Modified/Reset row above the
          component AND by CardBlockSettings' "Reset all overrides" button. */}
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
        onChange={(next) => onChange(borderEditorValueToTheme(next, value))}
        swatches={swatches}
        onSaveSwatch={saveSwatch}
        onUpdateSwatch={updateSwatch}
        onDeleteSwatch={deleteSwatch}
        setDraft={setDraft}
        clearDraft={clearDraft}
        onApplyGlassCompanion={(companion) =>
          onChange({
            cardBackdropFilter: [
              {
                id: `glass-blur-${Date.now()}`,
                kind: "blur",
                px: companion.backdropBlurPx,
              },
            ],
            cardBgOpacity: companion.cardBgOpacity,
          })
        }
      />
      {/* Legacy flat rows removed — BorderEditor owns the same theme keys
          (cardBorderShow, cardBorderType, cardBorderColor, the cardBorderGradient
          fields, cardBorderOpacity, cardBorderWidth) plus the new structured
          keys (cardBorderStyle, cardBorderSideWidths, cardBorderSideStyles,
          cardBorderImage, cardOutline, cardBoxShadow). */}

      {/* Border radius — BorderRadiusInput owns its label/legend internally.
          The FieldRow wrapper would double up labels and break its corner UI,
          so in override mode we render the dot + reset above the input
          instead, mirroring the pattern used for the backdrop filter row. */}
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
            max={64}
            onChange={(v) => onChange({ cardBorderRadius: v })}
          />
        </div>
      ) : (
        <BorderRadiusInput
          label="Border radius"
          value={value.cardBorderRadius}
          min={0}
          max={64}
          onChange={(v) => onChange({ cardBorderRadius: v })}
        />
      )}
    </>
  );
}
