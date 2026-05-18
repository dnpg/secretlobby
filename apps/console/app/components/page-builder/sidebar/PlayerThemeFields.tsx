import type { CSSProperties, ReactNode } from "react";
import { Checkbox } from "@secretlobby/ui";
import { AudioVisualizer } from "@secretlobby/player-view";
import {
  type BackdropFilter,
  type BorderRadius,
  type BorderStyle,
  type BoxPadding,
  type ThemeBackgroundColor,
  type ThemeSettings,
} from "~/lib/theme";
import {
  ColorPicker,
  type ColorValue,
  type SavedSwatch,
} from "~/components/color-picker";
import { BackdropFilterEditor } from "~/components/backdrop-filter-editor";
import { BorderRadiusInput } from "~/components/border-radius-input";
import { BoxPaddingInput } from "~/components/box-padding-input";
import { CssLengthInput } from "~/components/css-length-input";
import { ColorRow, HexPickerRow, SelectRow } from "./ThemeFieldRows";

// =============================================================================
// PlayerThemeFields
// -----------------------------------------------------------------------------
// Shared editor for the global Player theme section (rendered in the
// ThemeOverlay) AND the per-block Player override surface (rendered in
// PlayerBlockSettings). Same JSX in both places — the only difference is
// what `onChange` dispatches: a global theme update or a write into
// `block.themeOverrides`.
//
// API mirrors `CardThemeFields`:
//   - `value` is the EFFECTIVE theme (base + overrides merged) so every
//     row renders with the right currently-active value
//   - `onChange` receives a Partial<ThemeSettings>; the caller decides
//     whether to write it globally or as a per-block override
//   - `swatches` + swatch handlers forward into the embedded ColorPicker
//     so saved-swatch refs round-trip
//
// Single source of truth for the player editor — adding/removing settings
// requires touching ONE file, and both consumers (global theme overlay,
// per-block override accordion) pick up the new control for free.
// =============================================================================

// Full CSS `border-style` keyword list. `none` sits last so the "off"
// state isn't the default option a user scrolls past while looking at
// borders. `hidden` is included for spec parity even though it visually
// matches `none`.
const PLAYER_BORDER_STYLES: BorderStyle[] = [
  "solid",
  "dashed",
  "dotted",
  "double",
  "groove",
  "ridge",
  "inset",
  "outset",
  "hidden",
  "none",
];

// =============================================================================
// PlayerContainerStyleSubgroup
// -----------------------------------------------------------------------------
// The repeated "container chrome" subgroup used by the four toggleable
// regions inside the Player section (player outer, visualizer, transport,
// playlist). Each instance:
//   - Renders a Radix <Checkbox> on the heading row. The checkbox is the
//     master switch for the region — when off, PlayerView applies NONE of
//     the chrome (bg/backdrop/border/radius) regardless of the individual
//     field values. The fields stay editable so the user can dial them in
//     and then flip the toggle to compare.
//   - Keeps the "style first, then width + color when style ≠ none" rule
//     consistent with the Image and Card sections.
//
// Reused as a child component (not inlined) so the four regions stay
// visually identical — any change here updates all four, which is the
// expected behaviour for a "same settings" group.
// =============================================================================
interface PlayerContainerStyleSubgroupProps {
  title: string;
  enabled: boolean;
  onEnabledChange: (next: boolean) => void;
  bg: ThemeBackgroundColor;
  onBgChange: (next: ThemeBackgroundColor) => void;
  backdropFilter: BackdropFilter;
  onBackdropFilterChange: (next: BackdropFilter) => void;
  borderRadius: BorderRadius;
  onBorderRadiusChange: (next: BorderRadius) => void;
  borderStyle: BorderStyle;
  onBorderStyleChange: (next: BorderStyle) => void;
  borderWidth: string;
  onBorderWidthChange: (next: string) => void;
  borderColor: string;
  onBorderColorChange: (next: string) => void;
  swatches: SavedSwatch[];
  saveSwatch: (name: string, value: ColorValue) => void;
  updateSwatch: (id: string, name: string, value: ColorValue) => void;
  deleteSwatch: (id: string) => void;
  extraRows?: ReactNode;
}

function PlayerContainerStyleSubgroup({
  title,
  enabled,
  onEnabledChange,
  bg,
  onBgChange,
  backdropFilter,
  onBackdropFilterChange,
  borderRadius,
  onBorderRadiusChange,
  borderStyle,
  onBorderStyleChange,
  borderWidth,
  onBorderWidthChange,
  borderColor,
  onBorderColorChange,
  swatches,
  saveSwatch,
  updateSwatch,
  deleteSwatch,
  extraRows,
}: PlayerContainerStyleSubgroupProps) {
  const checkboxId = `pcs-${title.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center gap-2">
        <Checkbox
          id={checkboxId}
          checked={enabled}
          onCheckedChange={(v) => onEnabledChange(v === true)}
        />
        <label
          htmlFor={checkboxId}
          className="text-[11px] font-semibold text-theme-muted cursor-pointer"
        >
          {title}
        </label>
      </div>

      {/* Chrome fields render ONLY when the toggle is on — keeps the panel
          short for users who don't need this region's container styling
          and reinforces the visual link between the checkbox and the
          settings it activates. Wrapped in a subtle grey panel so the
          group reads as "this is the inside of the {title}" — bordered
          card, tighter spacing, faint tertiary fill. */}
      {enabled && (
        <div className="rounded-md border border-theme/60 bg-theme-tertiary/40 p-3 space-y-3">
          <div>
            <label className="block text-xs text-theme-secondary mb-1">
              Background
            </label>
            <ColorPicker
              label={`${title} background`}
              value={bg as ColorValue}
              onChange={(next) => onBgChange(next as ThemeBackgroundColor)}
              swatches={swatches}
              onSaveSwatch={saveSwatch}
              onUpdateSwatch={updateSwatch}
              onDeleteSwatch={deleteSwatch}
            />
          </div>

          {/* Backdrop filter — rendered inline. The
              `BackdropFilterEditor` ships with its own heading + add
              control on the right, so wrapping it in another label
              would just duplicate the title. */}
          <BackdropFilterEditor
            value={backdropFilter}
            onChange={onBackdropFilterChange}
          />

          <div>
            <label className="block text-xs text-theme-secondary mb-1">
              Border radius
            </label>
            <BorderRadiusInput
              value={borderRadius}
              onChange={onBorderRadiusChange}
              min={0}
              max={9999}
            />
          </div>

          <SelectRow
            label="Border style"
            value={borderStyle}
            options={PLAYER_BORDER_STYLES.map((s) => ({ value: s, label: s }))}
            onChange={(v) => onBorderStyleChange(v as BorderStyle)}
          />

          {borderStyle !== "none" && (
            <>
              <div>
                <label className="block text-xs text-theme-secondary mb-1">
                  Border width
                </label>
                <CssLengthInput
                  value={borderWidth}
                  onChange={onBorderWidthChange}
                  min={0}
                  max={64}
                  ariaLabel={`${title} border width`}
                  placeholder="0"
                />
              </div>
              <HexPickerRow
                label="Border color"
                value={borderColor}
                onChange={onBorderColorChange}
              />
            </>
          )}
        </div>
      )}

      {/* `extraRows` describes content INSIDE the region (visualizer bar
          colors, transport text + buttons) — not container chrome — so
          it stays visible regardless of the checkbox state. Designers
          can configure the content even when they don't want a wrapping
          chrome on the region. */}
      {extraRows}
    </div>
  );
}

// =============================================================================
// EqualizerPreview
// -----------------------------------------------------------------------------
// Small live-animating tile that previews the current Equalizer colours
// without needing audio. Embeds the same `<AudioVisualizer />` the canvas
// uses, set to `demoMode` + `isPlaying` so it animates a synthetic
// frequency pattern (defined in `AudioVisualizer`'s demo branch).
//
// The visualizer reads its colours from CSS variables on the closest
// styled ancestor — we set those variables INLINE on the wrapper here
// so the preview reflects whatever the designer is editing, without
// touching the global lobby theme. When the designer commits a colour
// the same variables update on the canvas root and the main player
// repaints too (PlayerView's `demoMode` toggle also makes the canvas
// animate while not playing, so colour edits are visible there as well).
// =============================================================================
interface EqualizerPreviewProps {
  color1: string;
  color2: string;
  color3: string;
  blendMode: string;
}

function EqualizerPreview({
  color1,
  color2,
  color3,
  blendMode,
}: EqualizerPreviewProps) {
  // Inline CSS variables — `<AudioVisualizer>` calls `getComputedStyle`
  // on the canvas to pull `--color-visualizer-bar` / `-bar-alt` / `-glow`.
  // Setting them on the wrapper means the cascade reaches the canvas
  // without polluting other consumers (sibling players, etc.). Cast to
  // a typed CSSProperties via index signature so TS accepts custom vars.
  const previewVars = {
    "--color-visualizer-bar": color1,
    "--color-visualizer-bar-alt": color2,
    "--color-visualizer-glow": color3,
  } as CSSProperties;
  return (
    <div>
      <label className="block text-xs text-theme-secondary mb-1">
        Preview
      </label>
      <div
        className="overflow-hidden rounded border border-theme bg-theme-tertiary"
        style={previewVars}
      >
        <AudioVisualizer
          audioElement={null}
          isPlaying
          demoMode
          blendMode={blendMode}
          className="w-full h-16"
        />
      </div>
    </div>
  );
}

// =============================================================================
// PlayerThemeFields
// =============================================================================
export interface PlayerThemeFieldsProps {
  /** Effective theme (base merged with any overrides) — every row reads
   *  from here so the rendered control reflects what the canvas actually
   *  paints. */
  value: ThemeSettings;
  onChange: (partial: Partial<ThemeSettings>) => void;
  swatches: SavedSwatch[];
  saveSwatch: (name: string, value: ColorValue) => void;
  updateSwatch: (id: string, name: string, value: ColorValue) => void;
  deleteSwatch: (id: string) => void;
}

export function PlayerThemeFields({
  value: theme,
  onChange,
  swatches,
  saveSwatch,
  updateSwatch,
  deleteSwatch,
}: PlayerThemeFieldsProps) {
  // Helper so existing `set("fieldName", value)` calls below read like the
  // pre-extraction inline JSX. Each call resolves to a single-field
  // Partial<ThemeSettings> handed to the caller's onChange.
  const set = <K extends keyof ThemeSettings>(
    key: K,
    next: ThemeSettings[K]
  ) => {
    onChange({ [key]: next } as Partial<ThemeSettings>);
  };

  return (
    <>
      {/* Visualizer rendering settings — pulled out of the Visualizer
          container subgroup so the canvas-render decisions (Type / the
          three colors / Blend mode) sit at the very top of the Player
          section, ahead of any container chrome. Type comes first
          because it changes what the three color slots mean (Equalizer
          paints a 3-stop gradient through them; Waveform uses each for
          a distinct role). */}
      <SelectRow
        label="Type"
        value={theme.visualizerType}
        options={[
          { value: "equalizer", label: "Equalizer" },
          { value: "waveform", label: "Waveform" },
        ]}
        onChange={(v) => set("visualizerType", v)}
      />
      <ColorRow
        label={
          theme.visualizerType === "equalizer" ? "Color 1" : "Bar color"
        }
        value={theme.visualizerBar}
        onChange={(v) => set("visualizerBar", v)}
      />
      <ColorRow
        label={
          theme.visualizerType === "equalizer"
            ? "Color 2"
            : "Bar alt color"
        }
        value={theme.visualizerBarAlt}
        onChange={(v) => set("visualizerBarAlt", v)}
      />
      <ColorRow
        label={
          theme.visualizerType === "equalizer" ? "Color 3" : "Glow color"
        }
        value={theme.visualizerGlow}
        onChange={(v) => set("visualizerGlow", v)}
      />
      <SelectRow
        label="Blend mode"
        value={theme.visualizerBlendMode}
        options={[
          { value: "normal", label: "Normal" },
          { value: "multiply", label: "Multiply" },
          { value: "screen", label: "Screen" },
          { value: "overlay", label: "Overlay" },
          { value: "lighten", label: "Lighten" },
          { value: "darken", label: "Darken" },
          { value: "color-dodge", label: "Color Dodge" },
          { value: "color-burn", label: "Color Burn" },
          { value: "difference", label: "Difference" },
        ]}
        onChange={(v) => set("visualizerBlendMode", v)}
      />

      {theme.visualizerType === "equalizer" && (
        <EqualizerPreview
          color1={theme.visualizerBar}
          color2={theme.visualizerBarAlt}
          color3={theme.visualizerGlow}
          blendMode={theme.visualizerBlendMode}
        />
      )}

      <PlayerContainerStyleSubgroup
        title="Player container"
        enabled={theme.playerContainerEnabled ?? false}
        onEnabledChange={(v) => set("playerContainerEnabled", v)}
        bg={
          theme.playerBg ?? {
            type: "solid",
            color: "#111827",
            opacity: 100,
          }
        }
        onBgChange={(next) => set("playerBg", next)}
        backdropFilter={theme.playerBackdropFilter ?? []}
        onBackdropFilterChange={(next) =>
          set("playerBackdropFilter", next)
        }
        borderRadius={
          theme.playerBorderRadius ?? theme.cardBorderRadius ?? 12
        }
        onBorderRadiusChange={(v) => set("playerBorderRadius", v)}
        borderStyle={theme.playerBorderStyle ?? "solid"}
        onBorderStyleChange={(v) => set("playerBorderStyle", v)}
        borderWidth={theme.playerBorderWidth ?? "0"}
        onBorderWidthChange={(v) => set("playerBorderWidth", v)}
        borderColor={
          theme.playerBorderColor ??
          theme.cardBorderColor ??
          theme.border ??
          "#000000"
        }
        onBorderColorChange={(v) => set("playerBorderColor", v)}
        swatches={swatches}
        saveSwatch={saveSwatch}
        updateSwatch={updateSwatch}
        deleteSwatch={deleteSwatch}
      />

      <PlayerContainerStyleSubgroup
        title="Visualizer container"
        enabled={theme.visualizerContainerEnabled ?? false}
        onEnabledChange={(v) => set("visualizerContainerEnabled", v)}
        bg={
          (theme.visualizerBg
            ? {
                type: "solid",
                color: theme.visualizerBg,
                opacity: theme.visualizerBgOpacity ?? 100,
              }
            : {
                type: "solid",
                color: "#111827",
                opacity: 100,
              }) as ThemeBackgroundColor
        }
        onBgChange={(next) => {
          // Decompose back into the legacy flat fields so the canvas
          // (which still reads visualizerBg + visualizerBgOpacity) stays
          // in sync. Bundled into one onChange call so a per-block
          // override path persists both keys at once.
          if (next.type === "solid") {
            onChange({
              visualizerBg: next.color,
              visualizerBgOpacity: next.opacity ?? 100,
            });
          }
        }}
        backdropFilter={theme.visualizerBackdropFilter ?? []}
        onBackdropFilterChange={(next) =>
          set("visualizerBackdropFilter", next)
        }
        borderRadius={theme.visualizerBorderRadius}
        onBorderRadiusChange={(v) => set("visualizerBorderRadius", v)}
        borderStyle={theme.visualizerBorderStyle ?? "solid"}
        onBorderStyleChange={(v) => set("visualizerBorderStyle", v)}
        borderWidth={theme.visualizerBorderWidth ?? "0"}
        onBorderWidthChange={(v) => set("visualizerBorderWidth", v)}
        borderColor={
          theme.visualizerBorderColor ?? theme.border ?? "#000000"
        }
        onBorderColorChange={(v) => set("visualizerBorderColor", v)}
        swatches={swatches}
        saveSwatch={saveSwatch}
        updateSwatch={updateSwatch}
        deleteSwatch={deleteSwatch}
      />

      <PlayerContainerStyleSubgroup
        title="Now playing & controls"
        enabled={theme.transportContainerEnabled ?? false}
        onEnabledChange={(v) => set("transportContainerEnabled", v)}
        bg={
          theme.transportBg ?? {
            type: "solid",
            color: "#000000",
            opacity: 0,
          }
        }
        onBgChange={(next) => set("transportBg", next)}
        backdropFilter={theme.transportBackdropFilter ?? []}
        onBackdropFilterChange={(next) =>
          set("transportBackdropFilter", next)
        }
        borderRadius={theme.transportBorderRadius ?? 8}
        onBorderRadiusChange={(v) => set("transportBorderRadius", v)}
        borderStyle={theme.transportBorderStyle ?? "solid"}
        onBorderStyleChange={(v) => set("transportBorderStyle", v)}
        borderWidth={theme.transportBorderWidth ?? "0"}
        onBorderWidthChange={(v) => set("transportBorderWidth", v)}
        borderColor={
          theme.transportBorderColor ??
          theme.cardBorderColor ??
          theme.border ??
          "#000000"
        }
        onBorderColorChange={(v) => set("transportBorderColor", v)}
        swatches={swatches}
        saveSwatch={saveSwatch}
        updateSwatch={updateSwatch}
        deleteSwatch={deleteSwatch}
        extraRows={
          // Content-level transport styling — applies inside the
          // transport container regardless of the container chrome
          // toggle. Grouped by visual region: padding → text → progress
          // bar → play button → skip buttons.
          <>
            <h5 className="text-[10px] font-semibold text-theme-muted pt-3 mt-2">
              Layout & text
            </h5>
            <div>
              <label className="block text-xs text-theme-secondary mb-1">
                Padding
              </label>
              <BoxPaddingInput
                value={theme.transportPadding ?? 0}
                onChange={(v: BoxPadding) => set("transportPadding", v)}
                min={0}
                max={512}
              />
            </div>
            <HexPickerRow
              label="Text color"
              value={
                theme.transportTextColor ??
                theme.cardHeadingColor ??
                theme.textPrimary ??
                "#ffffff"
              }
              onChange={(v) => set("transportTextColor", v)}
            />

            <h5 className="text-[10px] font-semibold text-theme-muted pt-3 mt-2">
              Progress bar
            </h5>
            <HexPickerRow
              label="Progress bar color"
              value={theme.progressBarColor ?? "#3f3f4666"}
              onChange={(v) => set("progressBarColor", v)}
            />
            <HexPickerRow
              label="Progress bar active color"
              value={
                theme.progressBarActiveColor ??
                theme.primary ??
                "#ffffff"
              }
              onChange={(v) => set("progressBarActiveColor", v)}
            />
            <HexPickerRow
              label="Progress bar text color"
              value={
                theme.progressBarTextColor ??
                theme.textSecondary ??
                "#9ca3af"
              }
              onChange={(v) => set("progressBarTextColor", v)}
            />

            <h5 className="text-[10px] font-semibold text-theme-muted pt-3 mt-2">
              Play button
            </h5>
            <div>
              <label className="block text-xs text-theme-secondary mb-1">
                Background
              </label>
              <ColorPicker
                label="Play button background"
                value={
                  (theme.playButtonBg ?? {
                    type: "solid",
                    color: "#000000",
                    opacity: 0,
                  }) as ColorValue
                }
                onChange={(next) =>
                  set("playButtonBg", next as ThemeBackgroundColor)
                }
                swatches={swatches}
                onSaveSwatch={saveSwatch}
                onUpdateSwatch={updateSwatch}
                onDeleteSwatch={deleteSwatch}
              />
            </div>
            <HexPickerRow
              label="Icon color"
              value={
                theme.playButtonIconColor ??
                theme.cardHeadingColor ??
                theme.textPrimary ??
                "#ffffff"
              }
              onChange={(v) => set("playButtonIconColor", v)}
            />
            <div>
              <label className="block text-xs text-theme-secondary mb-1">
                Border radius
              </label>
              <BorderRadiusInput
                value={theme.playButtonBorderRadius ?? 50}
                onChange={(v) => set("playButtonBorderRadius", v)}
                min={0}
                max={9999}
              />
            </div>
            <SelectRow
              label="Border style"
              value={theme.playButtonBorderStyle ?? "solid"}
              options={PLAYER_BORDER_STYLES.map((s) => ({
                value: s,
                label: s,
              }))}
              onChange={(v) =>
                set("playButtonBorderStyle", v as BorderStyle)
              }
            />
            {(theme.playButtonBorderStyle ?? "solid") !== "none" && (
              <>
                <div>
                  <label className="block text-xs text-theme-secondary mb-1">
                    Border width
                  </label>
                  <CssLengthInput
                    value={theme.playButtonBorderWidth ?? "0"}
                    onChange={(v) => set("playButtonBorderWidth", v)}
                    min={0}
                    max={64}
                    ariaLabel="Play button border width"
                    placeholder="0"
                  />
                </div>
                <HexPickerRow
                  label="Border color"
                  value={
                    theme.playButtonBorderColor ??
                    theme.border ??
                    "#000000"
                  }
                  onChange={(v) => set("playButtonBorderColor", v)}
                />
              </>
            )}

            <h5 className="text-[10px] font-semibold text-theme-muted pt-3 mt-2">
              Back / Forward buttons
            </h5>
            <div>
              <label className="block text-xs text-theme-secondary mb-1">
                Background
              </label>
              <ColorPicker
                label="Skip button background"
                value={
                  (theme.skipButtonBg ?? {
                    type: "solid",
                    color: "#000000",
                    opacity: 0,
                  }) as ColorValue
                }
                onChange={(next) =>
                  set("skipButtonBg", next as ThemeBackgroundColor)
                }
                swatches={swatches}
                onSaveSwatch={saveSwatch}
                onUpdateSwatch={updateSwatch}
                onDeleteSwatch={deleteSwatch}
              />
            </div>
            <HexPickerRow
              label="Icon color"
              value={
                theme.skipButtonIconColor ??
                theme.cardContentColor ??
                theme.textSecondary ??
                "#9ca3af"
              }
              onChange={(v) => set("skipButtonIconColor", v)}
            />
            <div>
              <label className="block text-xs text-theme-secondary mb-1">
                Border radius
              </label>
              <BorderRadiusInput
                value={
                  theme.skipButtonBorderRadius ??
                  theme.buttonBorderRadius ??
                  24
                }
                onChange={(v) => set("skipButtonBorderRadius", v)}
                min={0}
                max={9999}
              />
            </div>
            <SelectRow
              label="Border style"
              value={theme.skipButtonBorderStyle ?? "solid"}
              options={PLAYER_BORDER_STYLES.map((s) => ({
                value: s,
                label: s,
              }))}
              onChange={(v) =>
                set("skipButtonBorderStyle", v as BorderStyle)
              }
            />
            {(theme.skipButtonBorderStyle ?? "solid") !== "none" && (
              <>
                <div>
                  <label className="block text-xs text-theme-secondary mb-1">
                    Border width
                  </label>
                  <CssLengthInput
                    value={theme.skipButtonBorderWidth ?? "0"}
                    onChange={(v) => set("skipButtonBorderWidth", v)}
                    min={0}
                    max={64}
                    ariaLabel="Skip button border width"
                    placeholder="0"
                  />
                </div>
                <HexPickerRow
                  label="Border color"
                  value={
                    theme.skipButtonBorderColor ??
                    theme.border ??
                    "#000000"
                  }
                  onChange={(v) => set("skipButtonBorderColor", v)}
                />
              </>
            )}
          </>
        }
      />

      <PlayerContainerStyleSubgroup
        title="Playlist container"
        enabled={theme.playlistContainerEnabled ?? false}
        onEnabledChange={(v) => set("playlistContainerEnabled", v)}
        bg={
          theme.playlistBg ?? {
            type: "solid",
            color: "#1f2937",
            opacity: 0,
          }
        }
        onBgChange={(next) => set("playlistBg", next)}
        backdropFilter={theme.playlistBackdropFilter ?? []}
        onBackdropFilterChange={(next) =>
          set("playlistBackdropFilter", next)
        }
        borderRadius={theme.playlistBorderRadius ?? 8}
        onBorderRadiusChange={(v) => set("playlistBorderRadius", v)}
        borderStyle={theme.playlistBorderStyle ?? "solid"}
        onBorderStyleChange={(v) => set("playlistBorderStyle", v)}
        borderWidth={theme.playlistBorderWidth ?? "0"}
        onBorderWidthChange={(v) => set("playlistBorderWidth", v)}
        borderColor={
          theme.playlistBorderColor ??
          theme.cardBorderColor ??
          theme.border ??
          "#000000"
        }
        onBorderColorChange={(v) => set("playlistBorderColor", v)}
        swatches={swatches}
        saveSwatch={saveSwatch}
        updateSwatch={updateSwatch}
        deleteSwatch={deleteSwatch}
      />

      {/* --- Tracks (not toggleable; just flat color settings) ---------- */}
      <h4 className="text-[11px] font-semibold text-theme-muted pt-3 mt-2">
        Tracks — normal
      </h4>
      <HexPickerRow
        label="Background"
        value={theme.trackBg ?? "#00000000"}
        onChange={(v) => set("trackBg", v)}
      />
      <HexPickerRow
        label="Text"
        value={
          theme.trackText ??
          theme.cardContentColor ??
          theme.textSecondary ??
          "#ffffff"
        }
        onChange={(v) => set("trackText", v)}
      />
      <HexPickerRow
        label="Muted text"
        value={
          theme.trackMutedText ??
          theme.cardMutedColor ??
          theme.textMuted ??
          "#9ca3af"
        }
        onChange={(v) => set("trackMutedText", v)}
      />

      <h4 className="text-[11px] font-semibold text-theme-muted pt-3 mt-2">
        Tracks — hover
      </h4>
      <HexPickerRow
        label="Background"
        value={theme.trackHoverBg ?? "#ffffff14"}
        onChange={(v) => set("trackHoverBg", v)}
      />
      <HexPickerRow
        label="Text"
        value={
          theme.trackHoverText ??
          theme.trackText ??
          theme.cardContentColor ??
          theme.textSecondary ??
          "#ffffff"
        }
        onChange={(v) => set("trackHoverText", v)}
      />

      <h4 className="text-[11px] font-semibold text-theme-muted pt-3 mt-2">
        Tracks — active
      </h4>
      <HexPickerRow
        label="Background"
        value={theme.trackActiveBg ?? "#ffffff1a"}
        onChange={(v) => set("trackActiveBg", v)}
      />
      <HexPickerRow
        label="Text"
        value={theme.trackActiveText ?? theme.primary ?? "#ffffff"}
        onChange={(v) => set("trackActiveText", v)}
      />
    </>
  );
}
