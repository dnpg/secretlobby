import { useEffect, useMemo, useRef, useState } from "react";
import { cn, MediaPicker, type MediaItem } from "@secretlobby/ui";
import type {
  ImageBackground,
  ThemeBackground,
  ThemeBackgroundColor,
} from "@secretlobby/theme";
import {
  ColorPicker,
  type ColorValue,
  type SavedSwatch,
} from "~/components/color-picker";
import {
  colorValueToCSS,
  normalizeHex,
  stripHash,
} from "~/components/color-picker/utils";

// =============================================================================
// BackgroundPicker
// -----------------------------------------------------------------------------
// Renders the layered `ThemeBackground` (`{ color, image? }`) as TWO stacked
// editor sections inside one popover:
//
//   1. Color  — always visible, required. Wraps <ColorPicker> for
//               solid / gradient / saved-swatch editing.
//   2. Image  — optional overlay, collapsible. When unset shows a
//               "+ Add background image" affordance; when set expands to
//               size / position / repeat / overlay / remove.
//
// The trigger button outside the popover renders a tiny preview swatch
// (color + image stacked, via `backgroundToCSS`) plus a short label.
//
// Lives in the console app — not in the theme package — because it depends on
// React, the shared MediaPicker, and the per-account swatch handlers.
// =============================================================================

const DEFAULT_COLOR: ThemeBackgroundColor = {
  type: "solid",
  color: "#000000",
  opacity: 100,
};

const DEFAULT_IMAGE_SIZE: ImageBackground["size"] = "cover";
const DEFAULT_IMAGE_POSITION = "center";
const DEFAULT_IMAGE_REPEAT: ImageBackground["repeat"] = "no-repeat";

export interface BackgroundPickerProps {
  value: ThemeBackground;
  onChange: (next: ThemeBackground) => void;
  swatches?: SavedSwatch[];
  onSaveSwatch?: (name: string, value: ColorValue) => void;
  onUpdateSwatch?: (id: string, name: string, value: ColorValue) => void;
  onDeleteSwatch?: (id: string) => void;
  label?: string;
}

export function BackgroundPicker({
  value: rawValue,
  onChange: rawOnChange,
  swatches = [],
  onSaveSwatch,
  onUpdateSwatch,
  onDeleteSwatch,
  label,
}: BackgroundPickerProps) {
  // Defensive: a stale page-builder tab may still hold the pre-restructure
  // `ThemeBackground` (the old single-variant union). Detect by the presence
  // of a top-level `type` discriminator and lift the raw value into the new
  // `{ color }` shape so every sub-component reads consistent data. The
  // loader's `normalizeThemeBackground` does the same migration server-side;
  // this is purely a runtime safety net for tabs that haven't reloaded since
  // the bg restructure.
  const value: ThemeBackground = useMemo(() => {
    if (!rawValue || typeof rawValue !== "object") {
      return { color: { type: "solid", color: "#030712", opacity: 100 } };
    }
    const v = rawValue as unknown as { type?: string; color?: unknown };
    if (typeof v.type === "string" && !v.color) {
      // Legacy single-variant value — wrap as the color layer.
      return { color: rawValue as unknown as ThemeBackgroundColor };
    }
    return rawValue;
  }, [rawValue]);
  const onChange = rawOnChange;
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Click-outside + Escape close the popover (mirrors ColorPicker).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      // Don't close when a MediaPicker dialog is open — it portals outside the
      // popover, but the click should not dismiss our popover. The MediaPicker
      // dialog uses fixed positioning with z-50; any click inside it lands on
      // a node descended from body. We detect by walking up looking for a
      // Radix dialog content / overlay marker.
      if (target instanceof HTMLElement) {
        if (target.closest("[role='dialog']")) return;
      }
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative">
      <BackgroundTrigger
        ref={triggerRef}
        value={value}
        swatches={swatches}
        onClick={() => setOpen((v) => !v)}
        label={label}
      />
      {open && (
        <div
          ref={popoverRef}
          className="absolute right-0 z-40 mt-2 w-[280px] rounded-xl border border-theme bg-theme-secondary shadow-2xl"
          role="dialog"
          aria-label={label || "Background picker"}
        >
          <div className="flex items-center justify-between border-b border-theme px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-theme-muted">
              Background
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-1 rounded hover:bg-theme-tertiary text-theme-secondary hover:text-theme-primary cursor-pointer"
              title="Close"
              aria-label="Close background picker"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <div className="p-3 space-y-3">
            {/* Color section — always visible, required. */}
            <div>
              <label className="block text-[10px] uppercase tracking-wide text-theme-muted mb-1">
                Color
              </label>
              <ColorPicker
                label={label}
                value={value.color as ColorValue}
                onChange={(next) =>
                  onChange({ ...value, color: next as ThemeBackgroundColor })
                }
                swatches={swatches}
                onSaveSwatch={onSaveSwatch}
                onUpdateSwatch={onUpdateSwatch}
                onDeleteSwatch={onDeleteSwatch}
              />
            </div>

            {/* Image section — optional overlay, collapsible. */}
            <ImageSection
              image={value.image}
              onChange={(image) => onChange({ ...value, image })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Trigger — shows the resolved background as a preview tile (color + image
// stacked) and a short label line. Mirrors the visual shape of ColorPicker's
// SwatchTrigger so the two pickers feel like siblings.
// =============================================================================

interface BackgroundTriggerProps {
  value: ThemeBackground;
  swatches: SavedSwatch[];
  onClick: () => void;
  label?: string;
}

const BackgroundTrigger = ({
  ref,
  value,
  swatches,
  onClick,
  label,
}: BackgroundTriggerProps & { ref?: React.Ref<HTMLButtonElement> }) => {
  // Build the preview tile's inline styles. The image sits on top via
  // `backgroundImage`; the color renders underneath. When the color part is
  // a solid hex we set `backgroundColor`; when it's a gradient we stack it
  // beneath the image in the layered `background-image` shorthand.
  //
  // Defensive fallback: a stale tab may still hold a pre-restructure
  // `ThemeBackground` (the old single-variant union). Recognize that shape by
  // the presence of a top-level `type` field and treat the whole value as the
  // color layer for rendering purposes. Loading the page fresh runs through
  // `normalizeThemeBackground` and produces the correct layered shape.
  const colorPart =
    value && (value as unknown as { color?: ColorValue }).color
      ? (value as unknown as { color: ColorValue }).color
      : (value as unknown as ColorValue);
  const colorCSS = colorValueToCSS(colorPart, swatches);
  const colorIsSolid = colorCSS.startsWith("#") || colorCSS.startsWith("rgb");
  const previewStyle: React.CSSProperties = value.image
    ? {
        backgroundImage: colorIsSolid
          ? `url(${JSON.stringify(value.image.mediaUrl)})`
          : `url(${JSON.stringify(value.image.mediaUrl)}), ${colorCSS}`,
        backgroundColor: colorIsSolid ? colorCSS : undefined,
        backgroundSize: value.image.size,
        backgroundPosition: value.image.position,
        backgroundRepeat: value.image.repeat,
      }
    : { background: colorCSS };

  let labelText: string;
  if (value.image) {
    const sizeLabel =
      value.image.size === "cover"
        ? "cover"
        : value.image.size === "contain"
          ? "contain"
          : "auto";
    labelText = `Image · ${sizeLabel}`;
  } else {
    // Use the legacy-aware `colorPart` from earlier — a stale tab may still
    // hold a pre-restructure `ThemeBackground` where the whole value IS the
    // color layer (no `.color` wrapper). Falling back gracefully here avoids
    // crashing the trigger before the next reload normalizes state.
    const color = colorPart;
    if (color && typeof color === "object" && color.type === "swatch-ref") {
      const linked = swatches.find((s) => s.id === color.swatchId);
      labelText = linked
        ? `Linked to ${linked.name}`
        : "Linked (swatch missing)";
    } else if (color && typeof color === "object" && color.type === "solid") {
      labelText = `${stripHash(color.color)} · ${color.opacity}%`;
    } else if (color && typeof color === "object" && color.type === "gradient") {
      labelText = `Gradient · ${color.gradient.stops.length} stops`;
    } else {
      labelText = "Background";
    }
  }

  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded border border-theme bg-theme-tertiary/40 px-2 py-1.5 text-xs hover:bg-theme-tertiary cursor-pointer"
      aria-label={label || "Open background picker"}
    >
      <span
        className="relative block h-6 w-9 flex-shrink-0 overflow-hidden rounded border border-theme"
        style={{
          backgroundImage:
            "linear-gradient(45deg, rgba(255,255,255,0.15) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.15) 75%), linear-gradient(45deg, rgba(255,255,255,0.15) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.15) 75%)",
          backgroundSize: "8px 8px",
          backgroundPosition: "0 0, 4px 4px",
        }}
      >
        <span className="block h-full w-full rounded" style={previewStyle} />
      </span>
      <span className="flex-1 truncate text-left text-theme-secondary">
        {labelText}
      </span>
    </button>
  );
};

// =============================================================================
// ImageSection — collapsible block at the bottom of the editor. Header has
// the label and a chevron. Body content depends on whether an image is set:
//
//   - No image  → "+ Add background image" button. First selection seeds a
//                 default ImageBackground (cover / center / no-repeat / no
//                 overlay) and assigns it to `bg.image`.
//   - Has image → Thumbnail + Change/Remove buttons, size select, 3×3
//                 position grid + free-text override, repeat select,
//                 collapsible Overlay sub-panel. Bottom "Remove image" button
//                 sets `bg.image = undefined`.
// =============================================================================

interface ImageSectionProps {
  image: ImageBackground | undefined;
  onChange: (next: ImageBackground | undefined) => void;
}

function ImageSection({ image, onChange }: ImageSectionProps) {
  // Auto-expand when an image is set (so the user sees the controls); start
  // collapsed when there's no image yet for a clean initial state.
  const [open, setOpen] = useState(!!image);
  const hasImage = !!image;

  return (
    <div className="rounded border border-theme/60">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-2 py-1.5 text-xs text-theme-secondary hover:bg-theme-tertiary/40 cursor-pointer"
        aria-expanded={open}
      >
        <span className="flex items-center gap-1.5">
          <span>Background image</span>
          {hasImage && (
            <span className="px-1 rounded bg-[var(--color-brand-red-muted)] text-[10px] text-[var(--color-brand-red)]">
              on
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
      {open && (
        <div className="border-t border-theme/60 p-2 space-y-3">
          {image ? (
            <ImageEditor
              image={image}
              onChange={onChange}
              onRemove={() => onChange(undefined)}
            />
          ) : (
            <AddImageButton
              onPick={(media) =>
                onChange({
                  type: "image",
                  mediaId: media.id,
                  mediaUrl: media.url,
                  size: DEFAULT_IMAGE_SIZE,
                  position: DEFAULT_IMAGE_POSITION,
                  repeat: DEFAULT_IMAGE_REPEAT,
                })
              }
            />
          )}
        </div>
      )}
    </div>
  );
}

function AddImageButton({ onPick }: { onPick: (media: MediaItem) => void }) {
  return (
    <MediaPicker
      accept={["image/*"]}
      tabs={["library", "upload"]}
      onSelect={onPick}
    >
      <button
        type="button"
        className="flex w-full items-center justify-center gap-2 rounded border border-dashed border-theme bg-theme-tertiary/30 px-3 py-6 text-xs text-theme-secondary hover:bg-theme-tertiary hover:text-theme-primary cursor-pointer"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 4v16m8-8H4"
          />
        </svg>
        <span>Add background image</span>
      </button>
    </MediaPicker>
  );
}

// =============================================================================
// ImageEditor — body shown when an image is set. Thumbnail + Change/Remove,
// size/position/repeat controls, optional overlay, and a destructive Remove
// button at the bottom.
// =============================================================================

interface ImageEditorProps {
  image: ImageBackground;
  onChange: (next: ImageBackground) => void;
  onRemove: () => void;
}

function ImageEditor({ image, onChange, onRemove }: ImageEditorProps) {
  const handlePick = (media: MediaItem) => {
    // Subsequent picks (Change) only swap mediaId/mediaUrl, preserving the
    // user's existing size/position/repeat/overlay choices.
    onChange({ ...image, mediaId: media.id, mediaUrl: media.url });
  };

  return (
    <div className="space-y-3">
      {/* Media tile + Change */}
      <div className="space-y-2">
        <div className="relative aspect-video overflow-hidden rounded border border-theme bg-theme-tertiary">
          <img
            src={image.mediaUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        </div>
        <MediaPicker
          accept={["image/*"]}
          tabs={["library", "upload"]}
          onSelect={handlePick}
        >
          <button
            type="button"
            className="w-full px-2 py-1 text-xs rounded border border-theme bg-theme-tertiary/40 text-theme-secondary hover:bg-theme-tertiary hover:text-theme-primary cursor-pointer"
          >
            Change image
          </button>
        </MediaPicker>
      </div>

      <div>
        <label className="block text-[10px] uppercase tracking-wide text-theme-muted mb-1">
          Size
        </label>
        <select
          value={image.size}
          onChange={(e) =>
            onChange({
              ...image,
              size: e.target.value as ImageBackground["size"],
            })
          }
          className="w-full px-2 py-1 text-xs bg-theme-tertiary border border-theme rounded text-theme-primary cursor-pointer"
        >
          <option value="cover">Fit to screen</option>
          <option value="contain">Fit inside</option>
          <option value="auto">Original size</option>
        </select>
      </div>

      <div>
        <label className="block text-[10px] uppercase tracking-wide text-theme-muted mb-1">
          Position
        </label>
        <PositionGrid
          value={image.position}
          onChange={(pos) => onChange({ ...image, position: pos })}
        />
        {/* Free-text fallback — overrides the preset grid. Power users
            paste exotic positions ("50% 30%") here. */}
        <input
          type="text"
          value={image.position}
          onChange={(e) => onChange({ ...image, position: e.target.value })}
          placeholder="center"
          className="mt-2 w-full px-2 py-1 text-xs bg-theme-tertiary border border-theme rounded text-theme-primary"
          aria-label="Custom position"
        />
        {/* Pin the image to the viewport so it doesn't scroll with the page
            (parallax effect). Maps to CSS `background-attachment: fixed`. */}
        <label className="mt-2 flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={image.attachment === "fixed"}
            onChange={(e) =>
              onChange({
                ...image,
                attachment: e.target.checked ? "fixed" : "scroll",
              })
            }
            className="accent-[var(--color-brand-red)] cursor-pointer"
          />
          <span className="text-xs text-theme-secondary">
            Fixed (image stays in place while scrolling)
          </span>
        </label>
      </div>

      <div>
        <label className="block text-[10px] uppercase tracking-wide text-theme-muted mb-1">
          Repeat
        </label>
        <select
          value={image.repeat}
          onChange={(e) =>
            onChange({
              ...image,
              repeat: e.target.value as ImageBackground["repeat"],
            })
          }
          className="w-full px-2 py-1 text-xs bg-theme-tertiary border border-theme rounded text-theme-primary cursor-pointer"
        >
          <option value="no-repeat">No repeat</option>
          <option value="repeat">Repeat</option>
          <option value="repeat-x">Repeat horizontally</option>
          <option value="repeat-y">Repeat vertically</option>
        </select>
      </div>

      <OverlayControls
        overlay={image.overlay}
        onChange={(overlay) =>
          onChange(
            overlay
              ? { ...image, overlay }
              : (() => {
                  // Remove the overlay key when the user clears it (rather
                  // than persisting `{ color, opacity: 0 }`) so the JSON
                  // stays minimal.
                  const { overlay: _omit, ...rest } = image;
                  return rest;
                })()
          )
        }
      />

      <button
        type="button"
        onClick={onRemove}
        className="w-full px-2 py-1 text-xs rounded border border-red-500/40 text-red-400 hover:bg-red-500/10 cursor-pointer"
      >
        Remove image
      </button>
    </div>
  );
}

// =============================================================================
// 3×3 position grid — clicking a cell sets `background-position` to a preset
// CSS keyword pair. The currently-selected preset (if any) is highlighted; a
// free-form value not matching any preset just leaves all cells unselected.
// =============================================================================

const POSITION_PRESETS: { label: string; value: string }[] = [
  { label: "top left", value: "top left" },
  { label: "top", value: "top" },
  { label: "top right", value: "top right" },
  { label: "left", value: "left" },
  { label: "center", value: "center" },
  { label: "right", value: "right" },
  { label: "bottom left", value: "bottom left" },
  { label: "bottom", value: "bottom" },
  { label: "bottom right", value: "bottom right" },
];

function PositionGrid({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-1">
      {POSITION_PRESETS.map((preset) => {
        const active = preset.value === value;
        return (
          <button
            key={preset.value}
            type="button"
            onClick={() => onChange(preset.value)}
            className={cn(
              "aspect-square rounded border text-[10px] cursor-pointer",
              active
                ? "border-[var(--color-brand-red)] bg-[var(--color-brand-red-muted)] text-[var(--color-brand-red)]"
                : "border-theme bg-theme-tertiary/40 text-theme-muted hover:text-theme-primary hover:bg-theme-tertiary"
            )}
            title={preset.label}
            aria-label={`Position: ${preset.label}`}
            aria-pressed={active}
          >
            <span aria-hidden="true">·</span>
          </button>
        );
      })}
    </div>
  );
}

// =============================================================================
// OverlayControls — collapsible "Advanced" panel for the optional dimming
// overlay. Solid color + opacity slider; when opacity is 0 (default) no
// overlay is emitted in CSS.
// =============================================================================

interface OverlayControlsProps {
  overlay: ImageBackground["overlay"] | undefined;
  onChange: (next: ImageBackground["overlay"] | undefined) => void;
}

function OverlayControls({ overlay, onChange }: OverlayControlsProps) {
  // Default-open when an overlay is already set so users can find the controls
  // to edit it; collapsed by default for a clean initial state.
  const hasOverlay = !!overlay && overlay.opacity > 0;
  const [open, setOpen] = useState(hasOverlay);

  const color = overlay?.color ?? "#000000";
  const opacity = overlay?.opacity ?? 0;

  return (
    <div className="rounded border border-theme/60">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-2 py-1.5 text-xs text-theme-secondary hover:bg-theme-tertiary/40 cursor-pointer"
        aria-expanded={open}
      >
        <span className="flex items-center gap-1.5">
          <span>Overlay</span>
          {hasOverlay && (
            <span className="px-1 rounded bg-[var(--color-brand-red-muted)] text-[10px] text-[var(--color-brand-red)]">
              {Math.round(opacity)}%
            </span>
          )}
        </span>
        <svg
          className={cn("w-3.5 h-3.5 transition-transform", open && "rotate-180")}
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
      {open && (
        <div className="border-t border-theme/60 p-2 space-y-2">
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-theme-muted mb-1">
              Color
            </label>
            <div className="flex gap-2 items-center">
              <input
                type="color"
                value={color}
                onChange={(e) => onChange({ color: e.target.value, opacity })}
                className="w-9 h-9 rounded border border-theme cursor-pointer flex-shrink-0"
              />
              <input
                type="text"
                value={color}
                onChange={(e) => {
                  const next = normalizeHex(e.target.value);
                  if (next) onChange({ color: next, opacity });
                }}
                className="flex-1 min-w-0 px-2 py-1 text-xs bg-theme-tertiary border border-theme rounded text-theme-primary"
              />
            </div>
          </div>
          <div>
            <label className="flex items-center justify-between text-[10px] uppercase tracking-wide text-theme-muted mb-1">
              <span>Opacity</span>
              <span>{Math.round(opacity)}%</span>
            </label>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={opacity}
              onChange={(e) =>
                onChange({ color, opacity: Number(e.target.value) })
              }
              className="w-full cursor-pointer"
            />
          </div>
          {hasOverlay && (
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="w-full px-2 py-1 text-[11px] rounded border border-theme text-theme-secondary hover:bg-theme-tertiary cursor-pointer"
            >
              Clear overlay
            </button>
          )}
        </div>
      )}
    </div>
  );
}
