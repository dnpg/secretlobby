// =============================================================================
// ThemeFieldRows
// -----------------------------------------------------------------------------
// Shared row primitives for the theme editor UI. These were originally defined
// inline inside ThemeOverlay.tsx, but they're now imported by both the global
// theme editor (ThemeOverlay) and the per-block Card overrides editor
// (CardThemeFields), so they live here.
//
// Nothing in this file knows about reducers or stores — every row is a plain
// controlled component. The caller decides where the value lives and how to
// persist the change. The Modified-from-theme dot + RefreshIcon reset button
// is provided by the optional <FieldRow> wrapper (used by the per-block UI).
// =============================================================================

import { useState } from "react";
import { cn } from "@secretlobby/ui";
import {
  type BackdropFilter,
  type TextColorValue,
} from "~/lib/theme";
import {
  ColorPicker,
  type ColorValue,
} from "~/components/color-picker";
import {
  formatHexWithAlpha,
  gradientFallbackHex,
  parseHexWithAlpha,
  unlinkValue,
} from "~/components/color-picker/utils";
import { BackdropFilterEditor } from "~/components/backdrop-filter-editor";
import { useSwatches } from "../PageBuilderRoot";
import { RefreshIcon } from "../icons";

// =============================================================================
// FieldRow — optional wrapper that renders the label, an inline Modified dot
// and a RefreshIcon reset button to the right when `modified` is true.
//
// Used by per-block override editors to expose per-field reset semantics. The
// global theme editor doesn't render this wrapper — each row already labels
// itself, and there's nothing to reset to.
// =============================================================================

interface FieldRowProps {
  label: string;
  modified?: boolean;
  onReset?: () => void;
  children: React.ReactNode;
}

export function FieldRow({
  label,
  modified = false,
  onReset,
  children,
}: FieldRowProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-theme-secondary flex items-center gap-1.5">
          <span>{label}</span>
          {modified && (
            <span
              className="w-1.5 h-1.5 rounded-full bg-[var(--color-brand-red)] flex-shrink-0"
              aria-label="Modified from theme"
              title="Modified from theme"
            />
          )}
        </span>
        {modified && onReset && (
          <button
            type="button"
            onClick={onReset}
            className="p-1 rounded text-theme-muted hover:text-theme-primary hover:bg-theme-tertiary cursor-pointer transition-colors"
            title="Reset to theme value"
            aria-label="Reset to theme value"
          >
            <RefreshIcon className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

// =============================================================================
// ColorRow — basic native color input + hex string input. Kept for the
// Visualizer section, which uses plain 6-char hex without alpha / gradients.
// =============================================================================

interface ColorRowProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
}

export function ColorRow({ label, value, onChange }: ColorRowProps) {
  return (
    <div>
      <label className="block text-xs text-theme-secondary mb-1">{label}</label>
      <div className="flex gap-2 items-center">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-9 h-9 rounded border border-theme cursor-pointer flex-shrink-0"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 min-w-0 px-2 py-1 text-xs bg-theme-tertiary border border-theme rounded text-theme-primary"
        />
      </div>
    </div>
  );
}

// =============================================================================
// HexPickerRow — adapter that lets the existing hex-string theme fields use
// the full <ColorPicker> popover (with saved-swatch tab, opacity, etc.). The
// underlying theme type stays `string`; we wrap it in a SolidValue on the way
// in, and unwrap the picked hex on the way out. Forced to solid — these
// fields (text color, card heading color, etc.) don't get gradients.
//
// `renderLabel`: when truthy, the row renders its own `<label>` above the
// picker. When the row is wrapped in a <FieldRow>, the wrapper handles the
// label, so pass `renderLabel={false}` to avoid a duplicate.
// =============================================================================

interface HexPickerRowProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
  renderLabel?: boolean;
}

export function HexPickerRow({
  label,
  value,
  onChange,
  renderLabel = true,
}: HexPickerRowProps) {
  const { swatches, saveSwatch, updateSwatch, deleteSwatch, setDraft, clearDraft } =
    useSwatches();
  // Round-trip the alpha channel through 8-char hex. The underlying theme
  // field is a string, so we encode opacity into `#RRGGBBAA` on write and
  // decode it back on read. Opacity 100 collapses to the plain 6-char form,
  // so existing 6-char hex strings keep working without any migration.
  const parsed = parseHexWithAlpha(value) ?? { color: value, opacity: 100 };
  return (
    <div>
      {renderLabel && (
        <label className="block text-xs text-theme-secondary mb-1">{label}</label>
      )}
      <ColorPicker
        label={label}
        value={{
          type: "solid",
          color: parsed.color,
          opacity: parsed.opacity,
        }}
        onChange={(v) => {
          // Pull a hex + opacity pair out of whatever the picker emitted —
          // solid, swatch-ref (resolved via unlinkValue), or gradient (use
          // the gradient's fallback hex). Then re-encode through
          // formatHexWithAlpha so alpha < 100 lands as 8-char hex.
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
          onChange(formatHexWithAlpha(color, opacity));
        }}
        allowedTypes={["solid"]}
        swatches={swatches.filter((s) => s.kind === "solid")}
        onSaveSwatch={saveSwatch}
        onUpdateSwatch={updateSwatch}
        onDeleteSwatch={deleteSwatch}
        setDraft={setDraft}
        clearDraft={clearDraft}
      />
    </div>
  );
}

// =============================================================================
// TextColorRow — full <ColorPicker> (solid + gradient) for text-like theme
// fields. Writes to two theme fields at once: the legacy `<field>` hex string
// (for backward-compat consumers that only know how to render a single hex)
// AND the rich `<field>Rich` field that carries the full Solid/Gradient/Ref.
//
// The picker reads the rich field when set, otherwise falls back to a synth
// solid built from the legacy hex. On every change we recompute and persist
// both: the legacy hex is derived from the rich value via gradientFallbackHex
// so old consumers always get a usable hex (the gradient's fallback color, or
// the resolved swatch's color, or the solid's color).
// =============================================================================

interface TextColorRowProps {
  label: string;
  /** Legacy hex string field — always present in the theme. */
  legacyValue: string;
  /** Rich value field — optional; takes precedence when set. */
  richValue: TextColorValue | undefined;
  /** Called with the new pair on every change. The rich value is undefined
   *  when the user picks a plain solid that matches the legacy field (no
   *  gradient, no ref, default opacity) — keeps the persisted JSON small. */
  onChange: (next: {
    legacy: string;
    rich: TextColorValue | undefined;
  }) => void;
  renderLabel?: boolean;
}

export function TextColorRow({
  label,
  legacyValue,
  richValue,
  onChange,
  renderLabel = true,
}: TextColorRowProps) {
  const { swatches, saveSwatch, updateSwatch, deleteSwatch, setDraft, clearDraft } =
    useSwatches();
  // Picker value: rich when set, else a solid from the legacy hex.
  const pickerValue: ColorValue =
    richValue ?? { type: "solid", color: legacyValue, opacity: 100 };

  return (
    <div>
      {renderLabel && (
        <label className="block text-xs text-theme-secondary mb-1">{label}</label>
      )}
      <ColorPicker
        label={label}
        value={pickerValue}
        onChange={(next) => {
          // Always recompute the legacy hex from the new value so a downstream
          // consumer that reads `theme.textPrimary` (string) still sees a sane
          // single color even when the rich field is a gradient or swatch-ref.
          const legacy = gradientFallbackHex(next, swatches);
          // Optimization: drop the rich field when the picker collapsed back
          // to a plain solid at full opacity that matches the legacy hex.
          // Keeps the persisted JSON minimal for theme JSON that never opted
          // into gradients.
          let rich: TextColorValue | undefined = next as TextColorValue;
          if (
            next.type === "solid" &&
            (next.opacity ?? 100) >= 100 &&
            next.color.toLowerCase() === legacy.toLowerCase()
          ) {
            rich = undefined;
          }
          onChange({ legacy, rich });
        }}
        allowedTypes={["solid", "gradient"]}
        swatches={swatches}
        onSaveSwatch={saveSwatch}
        onUpdateSwatch={updateSwatch}
        onDeleteSwatch={deleteSwatch}
        setDraft={setDraft}
        clearDraft={clearDraft}
      />
    </div>
  );
}

// =============================================================================
// NumberRow — number / slider input with an optional suffix readout.
// =============================================================================

interface NumberRowProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (next: number) => void;
  suffix?: string;
  slider?: boolean;
}

export function NumberRow({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  suffix,
  slider = false,
}: NumberRowProps) {
  return (
    <div>
      <label className="flex items-center justify-between text-xs text-theme-secondary mb-1">
        <span>{label}</span>
        <span className="text-theme-muted">
          {value}
          {suffix ?? ""}
        </span>
      </label>
      <input
        type={slider ? "range" : "number"}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className={
          slider
            ? "w-full"
            : "w-full px-2 py-1 text-xs bg-theme-tertiary border border-theme rounded text-theme-primary"
        }
      />
    </div>
  );
}

// =============================================================================
// SelectRow — labelled <select>.
// =============================================================================

interface SelectRowProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (next: T) => void;
  renderLabel?: boolean;
}

export function SelectRow<T extends string>({
  label,
  value,
  options,
  onChange,
  renderLabel = true,
}: SelectRowProps<T>) {
  return (
    <div>
      {renderLabel && (
        <label className="block text-xs text-theme-secondary mb-1">{label}</label>
      )}
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
    </div>
  );
}

// =============================================================================
// TextRow — labelled <input type="text">.
// =============================================================================

interface TextRowProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
  renderLabel?: boolean;
}

export function TextRow({
  label,
  value,
  onChange,
  renderLabel = true,
}: TextRowProps) {
  return (
    <div>
      {renderLabel && (
        <label className="block text-xs text-theme-secondary mb-1">{label}</label>
      )}
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2 py-1 text-xs bg-theme-tertiary border border-theme rounded text-theme-primary"
      />
    </div>
  );
}

// =============================================================================
// ToggleRow — labelled checkbox toggle.
// =============================================================================

interface ToggleRowProps {
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
}

export function ToggleRow({ label, value, onChange }: ToggleRowProps) {
  return (
    <label className="flex items-center justify-between gap-2 cursor-pointer text-xs text-theme-secondary">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-[var(--color-brand-red)] cursor-pointer"
      />
    </label>
  );
}

// =============================================================================
// CardBackdropFilterSubgroup
// -----------------------------------------------------------------------------
// Collapsible nested group inside the Card section that hosts the reusable
// <BackdropFilterEditor>. Starts collapsed so the section stays compact for
// users who don't need backdrop effects.
//
// The lobby card surface doesn't read --card-backdrop-filter yet (that's a
// follow-up pass); this UI persists the value into lobby.settings.theme.
// =============================================================================

interface CardBackdropFilterSubgroupProps {
  value: BackdropFilter;
  onChange: (next: BackdropFilter) => void;
}

export function CardBackdropFilterSubgroup({
  value,
  onChange,
}: CardBackdropFilterSubgroupProps) {
  const [open, setOpen] = useState(false);
  const activeCount = value.length;
  return (
    <div className="rounded border border-theme/60">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-2 py-1.5 text-xs text-theme-secondary hover:bg-theme-tertiary/40 cursor-pointer"
        aria-expanded={open}
      >
        <span className="flex items-center gap-1.5">
          <span>Backdrop filter</span>
          {activeCount > 0 && (
            <span className="px-1 rounded bg-[var(--color-brand-red-muted)] text-[10px] text-[var(--color-brand-red)]">
              {activeCount}
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
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {open && (
        <div className="border-t border-theme/60 p-2">
          <BackdropFilterEditor value={value} onChange={onChange} />
        </div>
      )}
    </div>
  );
}
