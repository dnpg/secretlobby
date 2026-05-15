import { useState } from "react";
import { cn, MediaPicker, type MediaItem } from "@secretlobby/ui";
import type {
  BorderImage,
  BorderImageRepeat,
  BorderImageSource,
  BorderSideStyles,
  BorderSideWidths,
  BorderStyle,
  BoxShadow,
  Outline,
  ShadowStop,
  ThemeGradient,
} from "@secretlobby/theme";
import { borderImageToCSS } from "@secretlobby/theme";
import {
  ColorPicker,
  type ColorValue,
  type GradientValue,
  type SavedSwatch,
} from "~/components/color-picker";
import {
  formatHexWithAlpha,
  parseHexWithAlpha,
  unlinkValue,
} from "~/components/color-picker/utils";
import {
  applyGlassPresetToBorder,
  isGlassPresetActive,
  GLASS_PRESET,
} from "./glass-preset";

// =============================================================================
// BorderEditor
// -----------------------------------------------------------------------------
// Reusable border-settings component for the page-builder sidebar. Modelled
// on BackgroundPicker / ColorPicker / BorderRadiusInput — pure UI, caller owns
// the value, saved swatches, and persistence handlers.
//
// Composition (top → bottom):
//   1. Show toggle           — single checkbox that gates everything else.
//   2. Glass-mode switch     — one-click preset (white-18% solid border +
//                              soft drop-shadow). When the parent supplies
//                              `onApplyGlassCompanion`, that callback runs
//                              alongside the in-component preset so the
//                              parent can set cross-cutting fields like
//                              backdrop-filter / bg opacity.
//   3. Border style          — full CSS border-style dropdown.
//   4. Border width          — Figma-style uniform input with a per-side
//                              expand (top/right/bottom/left), mirroring
//                              BorderRadiusInput.
//   5. Border color          — ColorPicker (solid only — gradients live in
//                              border-image below). Hex+alpha round-trips
//                              through the underlying string field.
//   6. Border image          — collapsible. Source = gradient (any kind) OR
//                              uploaded image (MediaPicker). When set,
//                              exposes border-image-slice/width/outset/repeat.
//   7. Outline               — collapsible (color/style/width/offset).
//   8. Box-shadow            — collapsible stack with inset toggle, +Add /
//                              remove per shadow.
//
// `BorderEditorValue` keeps the model UI-friendly:
//   - `colorHex` is a single 6- or 8-char string carrying optional alpha so
//     legacy `cardBorderColor` (string field) can pack/unpack without a
//     separate opacity number. The CardThemeFields adapter splits this back
//     into cardBorderColor + cardBorderOpacity on persist.
//   - `sideWidths` / `sideStyles` are undefined for the uniform case; they
//     populate when the user expands the per-side editor.
// =============================================================================

export interface BorderEditorValue {
  show: boolean;
  style: BorderStyle;
  /** Uniform width (CSS length, e.g. "1px"). When `sideWidths` is set, the
   *  uniform value still seeds the per-side inputs on first expand. */
  width: string;
  /** Hex with optional alpha (#RRGGBB or #RRGGBBAA). */
  colorHex: string;
  /** Per-side widths — populated when the user expands the per-side editor.
   *  Undefined means "use uniform width". */
  sideWidths?: BorderSideWidths;
  /** Per-side styles — populated when the user expands per-side. */
  sideStyles?: BorderSideStyles;
  /** Border-image — gradient or uploaded image. Takes precedence over the
   *  solid color when set. */
  image?: BorderImage;
  /** Outline (separate from border). */
  outline?: Outline;
  /** Box-shadow stack. */
  boxShadow?: BoxShadow;
}

export interface BorderEditorProps {
  value: BorderEditorValue;
  onChange: (next: BorderEditorValue) => void;
  /** Saved swatches list passed straight to nested ColorPickers. */
  swatches?: SavedSwatch[];
  onSaveSwatch?: (name: string, value: ColorValue) => void;
  onUpdateSwatch?: (id: string, name: string, value: ColorValue) => void;
  onDeleteSwatch?: (id: string) => void;
  setDraft?: (id: string, value: ColorValue) => void;
  clearDraft?: (id: string) => void;
  /** Hook invoked AFTER the in-component glass preset is applied. CardThemeFields
   *  uses this to also set backdrop-filter + dim card-bg opacity. */
  onApplyGlassCompanion?: (companion: typeof GLASS_PRESET.companion) => void;
}

const BORDER_STYLE_OPTIONS: { value: BorderStyle; label: string }[] = [
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dashed" },
  { value: "dotted", label: "Dotted" },
  { value: "double", label: "Double" },
  { value: "groove", label: "Groove" },
  { value: "ridge", label: "Ridge" },
  { value: "inset", label: "Inset" },
  { value: "outset", label: "Outset" },
  { value: "none", label: "None" },
  { value: "hidden", label: "Hidden" },
];

const BORDER_IMAGE_REPEAT_OPTIONS: {
  value: BorderImageRepeat;
  label: string;
}[] = [
  { value: "stretch", label: "Stretch" },
  { value: "repeat", label: "Repeat" },
  { value: "round", label: "Round" },
  { value: "space", label: "Space" },
];

export function BorderEditor({
  value,
  onChange,
  swatches = [],
  onSaveSwatch,
  onUpdateSwatch,
  onDeleteSwatch,
  setDraft,
  clearDraft,
  onApplyGlassCompanion,
}: BorderEditorProps) {
  const glassActive = isGlassPresetActive(value);

  const handleGlassToggle = () => {
    if (glassActive) {
      // Clear the preset — restore a plain 1px solid neutral border.
      onChange({
        ...value,
        style: "solid",
        width: "1px",
        colorHex: "#374151", // matches the legacy default cardBorderColor
        boxShadow: undefined,
      });
      return;
    }
    onChange(applyGlassPresetToBorder(value));
    if (onApplyGlassCompanion) onApplyGlassCompanion(GLASS_PRESET.companion);
  };

  return (
    <div className="space-y-3">
      {/* Show toggle + Glass mode strip */}
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 cursor-pointer text-xs text-theme-secondary">
          <input
            type="checkbox"
            checked={value.show}
            onChange={(e) => onChange({ ...value, show: e.target.checked })}
            className="accent-[var(--color-brand-red)] cursor-pointer"
          />
          <span>Show border</span>
        </label>
        <button
          type="button"
          onClick={handleGlassToggle}
          className={cn(
            "px-2 py-0.5 text-[11px] rounded border cursor-pointer transition-colors",
            glassActive
              ? "border-[var(--color-brand-red)] bg-[var(--color-brand-red-muted)] text-[var(--color-brand-red)]"
              : "border-theme text-theme-muted hover:text-theme-primary hover:bg-theme-tertiary"
          )}
          title="One-click glassmorphism preset (1px translucent border + soft shadow)"
          aria-pressed={glassActive}
        >
          {glassActive ? "✓ Glass" : "Glass mode"}
        </button>
      </div>

      {value.show && (
        <>
          <StyleRow value={value} onChange={onChange} />
          <WidthRow value={value} onChange={onChange} />
          <ColorRow
            value={value}
            onChange={onChange}
            swatches={swatches}
            onSaveSwatch={onSaveSwatch}
            onUpdateSwatch={onUpdateSwatch}
            onDeleteSwatch={onDeleteSwatch}
            setDraft={setDraft}
            clearDraft={clearDraft}
          />
          <BorderImageSection
            value={value.image}
            onChange={(next) => onChange({ ...value, image: next })}
            swatches={swatches}
            onSaveSwatch={onSaveSwatch}
            onUpdateSwatch={onUpdateSwatch}
            onDeleteSwatch={onDeleteSwatch}
            setDraft={setDraft}
            clearDraft={clearDraft}
          />
        </>
      )}

      <OutlineSection
        value={value.outline}
        onChange={(next) => onChange({ ...value, outline: next })}
      />

      <BoxShadowSection
        value={value.boxShadow}
        onChange={(next) => onChange({ ...value, boxShadow: next })}
      />
    </div>
  );
}

// =============================================================================
// StyleRow — border-style dropdown (uniform OR per-side toggle).
// =============================================================================

function StyleRow({
  value,
  onChange,
}: {
  value: BorderEditorValue;
  onChange: (next: BorderEditorValue) => void;
}) {
  const isPerSide = !!value.sideStyles;
  const sides = value.sideStyles ?? {
    top: value.style,
    right: value.style,
    bottom: value.style,
    left: value.style,
  };

  const togglePerSide = () => {
    if (isPerSide) {
      // Collapse — if all four sides match, keep that as the uniform value;
      // otherwise keep the first side as the new uniform (the per-side
      // overrides are dropped).
      const allMatch =
        sides.top === sides.right &&
        sides.right === sides.bottom &&
        sides.bottom === sides.left;
      onChange({
        ...value,
        style: allMatch ? sides.top : sides.top,
        sideStyles: undefined,
      });
    } else {
      // Expand — seed all four sides from the uniform style.
      onChange({ ...value, sideStyles: sides });
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs text-theme-secondary">Border style</label>
        <button
          type="button"
          onClick={togglePerSide}
          className="text-[10px] text-theme-muted hover:text-theme-primary underline cursor-pointer"
          title={isPerSide ? "Use uniform style" : "Edit each side"}
        >
          {isPerSide ? "Uniform" : "Per side"}
        </button>
      </div>
      {isPerSide ? (
        <div className="grid grid-cols-2 gap-1.5">
          {(["top", "right", "bottom", "left"] as const).map((side) => (
            <StyleSelect
              key={side}
              ariaLabel={`${side} border style`}
              value={sides[side]}
              onChange={(next) =>
                onChange({
                  ...value,
                  sideStyles: { ...sides, [side]: next },
                })
              }
              prefix={side[0].toUpperCase() + side.slice(1)}
            />
          ))}
        </div>
      ) : (
        <StyleSelect
          ariaLabel="Border style"
          value={value.style}
          onChange={(next) => onChange({ ...value, style: next })}
        />
      )}
    </div>
  );
}

function StyleSelect({
  value,
  onChange,
  ariaLabel,
  prefix,
}: {
  value: BorderStyle;
  onChange: (next: BorderStyle) => void;
  ariaLabel: string;
  prefix?: string;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded border border-theme bg-theme-tertiary px-1.5 py-1">
      {prefix && (
        <span className="text-[10px] text-theme-muted flex-shrink-0 w-6">
          {prefix}
        </span>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as BorderStyle)}
        className="w-full min-w-0 bg-transparent text-xs text-theme-primary outline-none cursor-pointer"
        aria-label={ariaLabel}
      >
        {BORDER_STYLE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// =============================================================================
// WidthRow — Figma-style uniform input with per-side expand.
// =============================================================================

function WidthRow({
  value,
  onChange,
}: {
  value: BorderEditorValue;
  onChange: (next: BorderEditorValue) => void;
}) {
  const isPerSide = !!value.sideWidths;
  const sides = value.sideWidths ?? {
    top: value.width,
    right: value.width,
    bottom: value.width,
    left: value.width,
  };

  const togglePerSide = () => {
    if (isPerSide) {
      const allMatch =
        sides.top === sides.right &&
        sides.right === sides.bottom &&
        sides.bottom === sides.left;
      onChange({
        ...value,
        width: allMatch ? sides.top : sides.top,
        sideWidths: undefined,
      });
    } else {
      onChange({ ...value, sideWidths: sides });
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs text-theme-secondary">Border width</label>
        <button
          type="button"
          onClick={togglePerSide}
          className="text-[10px] text-theme-muted hover:text-theme-primary underline cursor-pointer"
          title={isPerSide ? "Use uniform width" : "Edit each side"}
        >
          {isPerSide ? "Uniform" : "Per side"}
        </button>
      </div>
      {isPerSide ? (
        <div className="grid grid-cols-2 gap-1.5">
          {(["top", "right", "bottom", "left"] as const).map((side) => (
            <WidthInput
              key={side}
              ariaLabel={`${side} border width`}
              value={sides[side]}
              onChange={(next) =>
                onChange({
                  ...value,
                  sideWidths: { ...sides, [side]: next },
                })
              }
              prefix={side[0].toUpperCase() + side.slice(1)}
            />
          ))}
        </div>
      ) : (
        <WidthInput
          ariaLabel="Border width"
          value={value.width}
          onChange={(next) => onChange({ ...value, width: next })}
        />
      )}
    </div>
  );
}

function WidthInput({
  value,
  onChange,
  ariaLabel,
  prefix,
}: {
  value: string;
  onChange: (next: string) => void;
  ariaLabel: string;
  prefix?: string;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded border border-theme bg-theme-tertiary px-1.5 py-1">
      {prefix && (
        <span className="text-[10px] text-theme-muted flex-shrink-0 w-6">
          {prefix}
        </span>
      )}
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-w-0 bg-transparent text-xs text-theme-primary outline-none"
        placeholder="1px"
        aria-label={ariaLabel}
      />
    </div>
  );
}

// =============================================================================
// ColorRow — single solid color picker (alpha encoded into the hex string).
// =============================================================================

function ColorRow({
  value,
  onChange,
  swatches,
  onSaveSwatch,
  onUpdateSwatch,
  onDeleteSwatch,
  setDraft,
  clearDraft,
}: {
  value: BorderEditorValue;
  onChange: (next: BorderEditorValue) => void;
  swatches: SavedSwatch[];
  onSaveSwatch?: BorderEditorProps["onSaveSwatch"];
  onUpdateSwatch?: BorderEditorProps["onUpdateSwatch"];
  onDeleteSwatch?: BorderEditorProps["onDeleteSwatch"];
  setDraft?: BorderEditorProps["setDraft"];
  clearDraft?: BorderEditorProps["clearDraft"];
}) {
  const parsed = parseHexWithAlpha(value.colorHex) ?? {
    color: value.colorHex,
    opacity: 100,
  };

  return (
    <div className="space-y-1">
      <label className="block text-xs text-theme-secondary">Border color</label>
      <ColorPicker
        label="Border color"
        value={{ type: "solid", color: parsed.color, opacity: parsed.opacity }}
        onChange={(v) => {
          let color: string;
          let opacity: number;
          if (v.type === "swatch-ref") {
            const resolved = unlinkValue(v, swatches);
            if (resolved.type === "solid") {
              color = resolved.color;
              opacity = resolved.opacity;
            } else {
              color = resolved.fallback ?? parsed.color;
              opacity = 100;
            }
          } else if (v.type === "solid") {
            color = v.color;
            opacity = v.opacity;
          } else {
            color = v.fallback ?? parsed.color;
            opacity = 100;
          }
          onChange({ ...value, colorHex: formatHexWithAlpha(color, opacity) });
        }}
        allowedTypes={["solid"]}
        swatches={swatches.filter((s) => s.kind === "solid")}
        onSaveSwatch={onSaveSwatch}
        onUpdateSwatch={onUpdateSwatch}
        onDeleteSwatch={onDeleteSwatch}
        setDraft={setDraft}
        clearDraft={clearDraft}
      />
    </div>
  );
}

// =============================================================================
// BorderImageSection — collapsible. Source = gradient (any kind) OR uploaded
// image (MediaPicker). When set, exposes slice / width / outset / repeat.
// =============================================================================

const DEFAULT_GRADIENT: ThemeGradient = {
  kind: "linear",
  angle: 135,
  stops: [
    { id: "stop-0", position: 0, color: "#ff7a59", opacity: 100 },
    { id: "stop-100", position: 100, color: "#9d4eff", opacity: 100 },
  ],
};

function BorderImageSection({
  value,
  onChange,
  swatches,
  onSaveSwatch,
  onUpdateSwatch,
  onDeleteSwatch,
  setDraft,
  clearDraft,
}: {
  value: BorderImage | undefined;
  onChange: (next: BorderImage | undefined) => void;
  swatches: SavedSwatch[];
  onSaveSwatch?: BorderEditorProps["onSaveSwatch"];
  onUpdateSwatch?: BorderEditorProps["onUpdateSwatch"];
  onDeleteSwatch?: BorderEditorProps["onDeleteSwatch"];
  setDraft?: BorderEditorProps["setDraft"];
  clearDraft?: BorderEditorProps["clearDraft"];
}) {
  // Auto-open when an image is set so the user can edit immediately; collapsed
  // by default for a clean starting state.
  const [open, setOpen] = useState(!!value);

  return (
    <Collapsible
      label="Border image"
      badge={value ? "on" : undefined}
      open={open}
      onToggle={() => setOpen((o) => !o)}
    >
      {!value && (
        <div className="space-y-2">
          <p className="text-[11px] text-theme-muted">
            Overlay the border with a gradient or uploaded image. Slice /
            width / outset / repeat control how the artwork tiles around the
            edges.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() =>
                onChange({
                  source: { type: "gradient", gradient: DEFAULT_GRADIENT },
                  slice: 1,
                  width: "1",
                  outset: "0",
                  repeat: "stretch",
                })
              }
              className="flex-1 px-2 py-1.5 text-xs rounded border border-dashed border-theme bg-theme-tertiary/30 text-theme-secondary hover:bg-theme-tertiary hover:text-theme-primary cursor-pointer"
            >
              + Gradient
            </button>
            <MediaPicker
              accept={["image/*"]}
              tabs={["library", "upload"]}
              onSelect={(media: MediaItem) =>
                onChange({
                  source: {
                    type: "image",
                    mediaId: media.id,
                    mediaUrl: media.url,
                  },
                  slice: 30,
                  width: "1",
                  outset: "0",
                  repeat: "round",
                })
              }
            >
              <button
                type="button"
                className="flex-1 px-2 py-1.5 text-xs rounded border border-dashed border-theme bg-theme-tertiary/30 text-theme-secondary hover:bg-theme-tertiary hover:text-theme-primary cursor-pointer"
              >
                + Image
              </button>
            </MediaPicker>
          </div>
        </div>
      )}
      {value && (
        <BorderImageEditor
          value={value}
          onChange={onChange}
          swatches={swatches}
          onSaveSwatch={onSaveSwatch}
          onUpdateSwatch={onUpdateSwatch}
          onDeleteSwatch={onDeleteSwatch}
          setDraft={setDraft}
          clearDraft={clearDraft}
        />
      )}
    </Collapsible>
  );
}

function BorderImageEditor({
  value,
  onChange,
  swatches,
  onSaveSwatch,
  onUpdateSwatch,
  onDeleteSwatch,
  setDraft,
  clearDraft,
}: {
  value: BorderImage;
  onChange: (next: BorderImage | undefined) => void;
  swatches: SavedSwatch[];
  onSaveSwatch?: BorderEditorProps["onSaveSwatch"];
  onUpdateSwatch?: BorderEditorProps["onUpdateSwatch"];
  onDeleteSwatch?: BorderEditorProps["onDeleteSwatch"];
  setDraft?: BorderEditorProps["setDraft"];
  clearDraft?: BorderEditorProps["clearDraft"];
}) {
  const handleSourceChange = (next: BorderImageSource) => {
    onChange({ ...value, source: next });
  };

  // Preview tile — a small div with the live border-image applied so the user
  // can see what they're configuring before it lands on the canvas.
  const previewBorderCSS = borderImageToCSS(value);

  return (
    <div className="space-y-3">
      <div
        aria-hidden
        className="h-12 w-full rounded bg-theme-tertiary"
        style={{
          border: "8px solid transparent",
          borderImage: previewBorderCSS,
          borderImageSlice: value.slice,
        }}
      />
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wide text-theme-muted">
          Source
        </span>
        <select
          value={value.source.type}
          onChange={(e) => {
            const next = e.target.value as BorderImageSource["type"];
            if (next === "gradient" && value.source.type !== "gradient") {
              handleSourceChange({
                type: "gradient",
                gradient: DEFAULT_GRADIENT,
              });
            } else if (next === "image" && value.source.type !== "image") {
              // Switching to image — clear mediaId/url; the picker re-prompts.
              onChange(undefined);
            }
          }}
          className="flex-1 px-2 py-1 text-xs bg-theme-tertiary border border-theme rounded text-theme-primary cursor-pointer"
        >
          <option value="gradient">Gradient</option>
          <option value="image">Image</option>
        </select>
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className="px-2 py-1 text-[11px] text-theme-muted hover:text-red-400 cursor-pointer"
          title="Remove border image"
        >
          Remove
        </button>
      </div>

      {value.source.type === "gradient" && (
        <GradientSourceEditor
          gradient={value.source.gradient}
          onChange={(g) =>
            handleSourceChange({ type: "gradient", gradient: g })
          }
          swatches={swatches}
          onSaveSwatch={onSaveSwatch}
          onUpdateSwatch={onUpdateSwatch}
          onDeleteSwatch={onDeleteSwatch}
          setDraft={setDraft}
          clearDraft={clearDraft}
        />
      )}

      {value.source.type === "image" && (
        <ImageSourceEditor
          source={value.source}
          onChange={handleSourceChange}
        />
      )}

      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="Slice"
          value={value.slice}
          min={0}
          max={500}
          step={1}
          onChange={(n) => onChange({ ...value, slice: n })}
          title="border-image-slice — distance from the edge of the source to slice (numbers act as pixels for raster images, units for gradients)"
        />
        <TextField
          label="Width"
          value={value.width}
          onChange={(s) => onChange({ ...value, width: s })}
          placeholder="1"
          title="border-image-width — CSS length, number (× border-width), or 'auto'"
        />
        <TextField
          label="Outset"
          value={value.outset}
          onChange={(s) => onChange({ ...value, outset: s })}
          placeholder="0"
          title="border-image-outset — pushes the image outward from the box"
        />
        <SelectField
          label="Repeat"
          value={value.repeat}
          options={BORDER_IMAGE_REPEAT_OPTIONS}
          onChange={(r) => onChange({ ...value, repeat: r })}
        />
      </div>
    </div>
  );
}

function GradientSourceEditor({
  gradient,
  onChange,
  swatches,
  onSaveSwatch,
  onUpdateSwatch,
  onDeleteSwatch,
  setDraft,
  clearDraft,
}: {
  gradient: ThemeGradient;
  onChange: (next: ThemeGradient) => void;
  swatches: SavedSwatch[];
  onSaveSwatch?: BorderEditorProps["onSaveSwatch"];
  onUpdateSwatch?: BorderEditorProps["onUpdateSwatch"];
  onDeleteSwatch?: BorderEditorProps["onDeleteSwatch"];
  setDraft?: BorderEditorProps["setDraft"];
  clearDraft?: BorderEditorProps["clearDraft"];
}) {
  // Wrap as a GradientValue so the ColorPicker can edit it. The picker emits
  // a ColorValue; we coerce back to ThemeGradient on the way out.
  const pickerValue: GradientValue = {
    type: "gradient",
    gradient,
    fallback: gradient.stops[0]?.color ?? "#000000",
  };

  return (
    <ColorPicker
      label="Border gradient"
      value={pickerValue}
      onChange={(v) => {
        if (v.type !== "gradient") return; // allowedTypes locks this
        onChange(v.gradient);
      }}
      allowedTypes={["gradient"]}
      swatches={swatches.filter((s) => s.kind === "gradient")}
      onSaveSwatch={onSaveSwatch}
      onUpdateSwatch={onUpdateSwatch}
      onDeleteSwatch={onDeleteSwatch}
      setDraft={setDraft}
      clearDraft={clearDraft}
    />
  );
}

function ImageSourceEditor({
  source,
  onChange,
}: {
  source: Extract<BorderImageSource, { type: "image" }>;
  onChange: (next: BorderImageSource) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="relative aspect-video overflow-hidden rounded border border-theme bg-theme-tertiary">
        <img
          src={source.mediaUrl}
          alt=""
          className="h-full w-full object-cover"
        />
      </div>
      <MediaPicker
        accept={["image/*"]}
        tabs={["library", "upload"]}
        onSelect={(media: MediaItem) =>
          onChange({
            type: "image",
            mediaId: media.id,
            mediaUrl: media.url,
          })
        }
      >
        <button
          type="button"
          className="w-full px-2 py-1 text-xs rounded border border-theme bg-theme-tertiary/40 text-theme-secondary hover:bg-theme-tertiary hover:text-theme-primary cursor-pointer"
        >
          Change image
        </button>
      </MediaPicker>
    </div>
  );
}

// =============================================================================
// OutlineSection — collapsible. Separate from border (CSS outline doesn't
// participate in box-sizing and can be offset positively or negatively).
// =============================================================================

const DEFAULT_OUTLINE: Outline = {
  show: true,
  width: "1px",
  style: "solid",
  color: "#374151",
  offset: "2px",
};

function OutlineSection({
  value,
  onChange,
}: {
  value: Outline | undefined;
  onChange: (next: Outline | undefined) => void;
}) {
  const [open, setOpen] = useState(!!value?.show);
  const showing = !!value?.show;

  return (
    <Collapsible
      label="Outline"
      badge={showing ? "on" : undefined}
      open={open}
      onToggle={() => setOpen((o) => !o)}
    >
      <label className="flex items-center gap-2 cursor-pointer text-xs text-theme-secondary mb-2">
        <input
          type="checkbox"
          checked={showing}
          onChange={(e) => {
            if (e.target.checked) {
              onChange(value ?? DEFAULT_OUTLINE);
            } else {
              onChange(value ? { ...value, show: false } : undefined);
            }
          }}
          className="accent-[var(--color-brand-red)] cursor-pointer"
        />
        <span>Show outline</span>
      </label>
      {showing && value && (
        <div className="grid grid-cols-2 gap-2">
          <TextField
            label="Width"
            value={value.width}
            onChange={(s) => onChange({ ...value, width: s })}
            placeholder="1px"
          />
          <SelectField
            label="Style"
            value={value.style}
            options={BORDER_STYLE_OPTIONS}
            onChange={(s) => onChange({ ...value, style: s })}
          />
          <TextField
            label="Color"
            value={value.color}
            onChange={(s) => onChange({ ...value, color: s })}
            placeholder="#374151"
          />
          <TextField
            label="Offset"
            value={value.offset}
            onChange={(s) => onChange({ ...value, offset: s })}
            placeholder="2px"
            title="outline-offset — positive pushes the outline away from the border"
          />
        </div>
      )}
    </Collapsible>
  );
}

// =============================================================================
// BoxShadowSection — collapsible multi-shadow stack with inset toggle.
// =============================================================================

let shadowIdCounter = 0;
function newShadowId(): string {
  shadowIdCounter += 1;
  return `shadow-${Date.now()}-${shadowIdCounter}`;
}

const DEFAULT_SHADOW = (): ShadowStop => ({
  id: newShadowId(),
  inset: false,
  x: 0,
  y: 4,
  blur: 12,
  spread: 0,
  color: formatHexWithAlpha("#000000", 25),
});

function BoxShadowSection({
  value,
  onChange,
}: {
  value: BoxShadow | undefined;
  onChange: (next: BoxShadow | undefined) => void;
}) {
  const [open, setOpen] = useState(!!value && value.length > 0);
  const count = value?.length ?? 0;

  return (
    <Collapsible
      label="Box shadow"
      badge={count > 0 ? String(count) : undefined}
      open={open}
      onToggle={() => setOpen((o) => !o)}
    >
      <div className="space-y-2">
        {(value ?? []).map((shadow, idx) => (
          <ShadowEditor
            key={shadow.id}
            shadow={shadow}
            onChange={(next) => {
              const list = [...(value ?? [])];
              list[idx] = next;
              onChange(list);
            }}
            onRemove={() => {
              const list = (value ?? []).filter((s) => s.id !== shadow.id);
              onChange(list.length > 0 ? list : undefined);
            }}
          />
        ))}
        <button
          type="button"
          onClick={() => onChange([...(value ?? []), DEFAULT_SHADOW()])}
          className="w-full px-2 py-1 text-xs rounded border border-dashed border-theme bg-theme-tertiary/30 text-theme-secondary hover:bg-theme-tertiary hover:text-theme-primary cursor-pointer"
        >
          + Add shadow
        </button>
      </div>
    </Collapsible>
  );
}

function ShadowEditor({
  shadow,
  onChange,
  onRemove,
}: {
  shadow: ShadowStop;
  onChange: (next: ShadowStop) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded border border-theme p-2 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 cursor-pointer text-xs text-theme-secondary">
          <input
            type="checkbox"
            checked={shadow.inset}
            onChange={(e) => onChange({ ...shadow, inset: e.target.checked })}
            className="accent-[var(--color-brand-red)] cursor-pointer"
          />
          <span>Inset</span>
        </label>
        <button
          type="button"
          onClick={onRemove}
          className="text-[10px] text-theme-muted hover:text-red-400 cursor-pointer underline"
        >
          Remove
        </button>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        <NumberField
          label="X"
          value={shadow.x}
          step={1}
          onChange={(n) => onChange({ ...shadow, x: n })}
        />
        <NumberField
          label="Y"
          value={shadow.y}
          step={1}
          onChange={(n) => onChange({ ...shadow, y: n })}
        />
        <NumberField
          label="Blur"
          value={shadow.blur}
          min={0}
          step={1}
          onChange={(n) => onChange({ ...shadow, blur: n })}
        />
        <NumberField
          label="Spread"
          value={shadow.spread}
          step={1}
          onChange={(n) => onChange({ ...shadow, spread: n })}
        />
      </div>
      <TextField
        label="Color"
        value={shadow.color}
        onChange={(s) => onChange({ ...shadow, color: s })}
        placeholder="#00000040"
        title="Hex with optional alpha (#RRGGBB or #RRGGBBAA)"
      />
    </div>
  );
}

// =============================================================================
// Generic primitives — kept local so this component stays self-contained.
// =============================================================================

function Collapsible({
  label,
  badge,
  open,
  onToggle,
  children,
}: {
  label: string;
  badge?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded border border-theme/60">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-2 px-2 py-1.5 text-xs text-theme-secondary hover:bg-theme-tertiary/40 cursor-pointer"
        aria-expanded={open}
      >
        <span className="flex items-center gap-1.5">
          <span>{label}</span>
          {badge && (
            <span className="px-1 rounded bg-[var(--color-brand-red-muted)] text-[10px] text-[var(--color-brand-red)]">
              {badge}
            </span>
          )}
        </span>
        <svg
          className={cn(
            "w-3.5 h-3.5 transition-transform",
            open && "rotate-180"
          )}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19.5 8.25l-7.5 7.5-7.5-7.5"
          />
        </svg>
      </button>
      {open && <div className="border-t border-theme/60 p-2">{children}</div>}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  title,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  title?: string;
}) {
  return (
    <label className="block" title={title}>
      <span className="block text-[10px] uppercase tracking-wide text-theme-muted mb-1">
        {label}
      </span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isNaN(n)) return;
          onChange(n);
        }}
        className="w-full px-2 py-1 text-xs bg-theme-tertiary border border-theme rounded text-theme-primary"
      />
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  title,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
  title?: string;
}) {
  return (
    <label className="block" title={title}>
      <span className="block text-[10px] uppercase tracking-wide text-theme-muted mb-1">
        {label}
      </span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2 py-1 text-xs bg-theme-tertiary border border-theme rounded text-theme-primary"
      />
    </label>
  );
}

function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wide text-theme-muted mb-1">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="w-full px-2 py-1 text-xs bg-theme-tertiary border border-theme rounded text-theme-primary cursor-pointer"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}
