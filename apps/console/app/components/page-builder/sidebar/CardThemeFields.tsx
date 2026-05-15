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
  NumberRow,
  SelectRow,
  TextColorRow,
  TextRow,
  ToggleRow,
} from "./ThemeFieldRows";
import { BorderRadiusInput } from "~/components/border-radius-input";

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

export function CardThemeFields({
  value,
  baseTheme,
  onChange,
  onResetField,
  showResetButtons = false,
}: CardThemeFieldsProps) {
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

      {/* Show border — toggle. ToggleRow is a single inline row already (label
          on the left, checkbox on the right), so when in override mode we
          slot the dot + reset into the same line via FieldRow with a custom
          right-hand strip. ToggleRow renders its own label too, so suppress
          via wrap+pass-through: the FieldRow's label IS the toggle label. */}
      {showResetButtons ? (
        <FieldRow
          label="Show border"
          modified={isModified(["cardBorderShow"])}
          onReset={makeReset(["cardBorderShow"])}
        >
          <input
            type="checkbox"
            checked={value.cardBorderShow}
            onChange={(e) => onChange({ cardBorderShow: e.target.checked })}
            className="accent-[var(--color-brand-red)] cursor-pointer"
          />
        </FieldRow>
      ) : (
        <ToggleRow
          label="Show border"
          value={value.cardBorderShow}
          onChange={(v) => onChange({ cardBorderShow: v })}
        />
      )}

      {value.cardBorderShow && (
        <>
          {wrap(
            "Border type",
            ["cardBorderType"],
            <SelectRow
              label="Border type"
              value={value.cardBorderType}
              options={[
                { value: "solid", label: "Solid" },
                { value: "gradient", label: "Gradient" },
              ]}
              onChange={(v) => onChange({ cardBorderType: v })}
              renderLabel={!showResetButtons}
            />
          )}
          {value.cardBorderType === "solid" ? (
            wrap(
              "Border color",
              ["cardBorderColor"],
              <HexPickerRow
                label="Border color"
                value={value.cardBorderColor}
                onChange={(v) => onChange({ cardBorderColor: v })}
                renderLabel={!showResetButtons}
              />
            )
          ) : (
            <>
              {wrap(
                "Border gradient from",
                ["cardBorderGradientFrom"],
                <HexPickerRow
                  label="Border gradient from"
                  value={value.cardBorderGradientFrom}
                  onChange={(v) => onChange({ cardBorderGradientFrom: v })}
                  renderLabel={!showResetButtons}
                />
              )}
              {wrap(
                "Border gradient to",
                ["cardBorderGradientTo"],
                <HexPickerRow
                  label="Border gradient to"
                  value={value.cardBorderGradientTo}
                  onChange={(v) => onChange({ cardBorderGradientTo: v })}
                  renderLabel={!showResetButtons}
                />
              )}
              {wrap(
                "Border gradient angle",
                ["cardBorderGradientAngle"],
                <NumberRow
                  label="Border gradient angle"
                  value={value.cardBorderGradientAngle}
                  min={0}
                  max={360}
                  suffix="°"
                  onChange={(v) => onChange({ cardBorderGradientAngle: v })}
                />
              )}
            </>
          )}
          {wrap(
            "Border opacity",
            ["cardBorderOpacity"],
            <NumberRow
              label="Border opacity"
              value={value.cardBorderOpacity}
              min={0}
              max={100}
              slider
              suffix="%"
              onChange={(v) => onChange({ cardBorderOpacity: v })}
            />
          )}
          {wrap(
            "Border width",
            ["cardBorderWidth"],
            <TextRow
              label="Border width"
              value={value.cardBorderWidth}
              onChange={(v) => onChange({ cardBorderWidth: v })}
              renderLabel={!showResetButtons}
            />
          )}
        </>
      )}

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
