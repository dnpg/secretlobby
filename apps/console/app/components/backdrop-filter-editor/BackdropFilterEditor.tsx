import { useEffect, useRef, useState } from "react";
import { cn } from "@secretlobby/ui";
import type { BackdropFilter, FilterFn, FilterKind } from "./types";
import {
  ALL_FILTER_KINDS,
  backdropFilterToCSS,
  defaultForKind,
  filterKindLabel,
} from "./utils";

// =============================================================================
// BackdropFilterEditor
// -----------------------------------------------------------------------------
// Pure controlled editor for a CSS `backdrop-filter` value. Designed to live
// inside a section settings panel (e.g. the Theme overlay's Card section) but
// reusable from any block-settings UI — it takes only `value` + `onChange`
// and renders inline (no popover).
//
// Layout:
//   ┌ Backdrop filter ────────── [+ Add filter ▾] ┐
//   │  ─ Filter list ─                            │
//   │   [blur]        [slider 0–40] [8 px] [x]    │
//   │   [brightness]  [slider 0–2 .05] [1]  [x]   │
//   │   ...                                       │
//   │  ─ Preview ─                                │
//   │   [checkered swatch w/ backdrop-filter live]│
//   └─────────────────────────────────────────────┘
// =============================================================================

export interface BackdropFilterEditorProps {
  value: BackdropFilter;
  onChange: (next: BackdropFilter) => void;
}

export function BackdropFilterEditor({
  value,
  onChange,
}: BackdropFilterEditorProps) {
  const filters = value;

  const update = (id: string, patch: Partial<FilterFn>) => {
    onChange(
      filters.map((f) =>
        f.id === id ? ({ ...f, ...patch } as FilterFn) : f
      )
    );
  };

  const remove = (id: string) => {
    onChange(filters.filter((f) => f.id !== id));
  };

  const add = (kind: FilterKind) => {
    onChange([...filters, defaultForKind(kind)]);
  };

  const css = backdropFilterToCSS(filters);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-theme-secondary">Backdrop filter</span>
        <AddFilterMenu onAdd={add} />
      </div>

      {filters.length === 0 ? (
        <div className="rounded border border-dashed border-theme/60 px-2 py-3 text-[11px] text-theme-muted text-center">
          No filters applied. Use “Add filter” to start.
        </div>
      ) : (
        <div className="space-y-1.5">
          {filters.map((f) => (
            <FilterRow
              key={f.id}
              filter={f}
              onChange={(patch) => update(f.id, patch)}
              onRemove={() => remove(f.id)}
            />
          ))}
        </div>
      )}

      <BackdropPreview css={css} />
    </div>
  );
}

// =============================================================================
// AddFilterMenu — small dropdown anchored to the section header. Filter kinds
// already in the list are NOT disabled — CSS allows the same function to
// appear multiple times (e.g. two drop-shadows) and we don't want to lock
// out that flexibility.
// =============================================================================

function AddFilterMenu({ onAdd }: { onAdd: (kind: FilterKind) => void }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
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
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-theme bg-theme-tertiary/40 hover:bg-theme-tertiary text-theme-secondary cursor-pointer"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        <span>Add filter</span>
        <svg
          className={cn("w-3 h-3 transition-transform", open && "rotate-180")}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {open && (
        <div
          className="absolute right-0 z-30 mt-1 w-44 rounded-lg border border-theme bg-theme-secondary shadow-lg py-1"
          role="menu"
        >
          {ALL_FILTER_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                onAdd(k);
                setOpen(false);
              }}
              className="block w-full text-left px-3 py-1.5 text-xs text-theme-primary hover:bg-theme-tertiary cursor-pointer"
              role="menuitem"
            >
              {filterKindLabel(k)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// FilterRow — one row per filter function. The right-hand control varies by
// kind (slider + number for the numeric kinds, four small inputs for
// drop-shadow). All rows share the same outer shell so the list reads
// vertically aligned.
// =============================================================================

interface FilterRowProps {
  filter: FilterFn;
  onChange: (patch: Partial<FilterFn>) => void;
  onRemove: () => void;
}

function FilterRow({ filter, onChange, onRemove }: FilterRowProps) {
  return (
    <div className="rounded border border-theme/60 bg-theme-tertiary/20 px-2 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-theme-primary font-medium">
          {filterKindLabel(filter.kind)}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="p-0.5 rounded text-theme-muted hover:text-red-400 hover:bg-theme-tertiary cursor-pointer flex-shrink-0"
          aria-label={`Remove ${filterKindLabel(filter.kind)} filter`}
          title="Remove filter"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="mt-1">
        <FilterControl filter={filter} onChange={onChange} />
      </div>
    </div>
  );
}

// =============================================================================
// FilterControl — discriminated render dispatch. Each variant has its own
// numeric ranges that map to sensible CSS limits (e.g. blur 0–40px, brightness
// 0–2, hue-rotate 0–360°). Values are persisted as numbers; the unit lives in
// the rendered CSS string (see utils.backdropFilterToCSS).
// =============================================================================

function FilterControl({
  filter,
  onChange,
}: {
  filter: FilterFn;
  onChange: (patch: Partial<FilterFn>) => void;
}) {
  switch (filter.kind) {
    case "blur":
      return (
        <SliderNumberRow
          value={filter.px}
          min={0}
          max={40}
          step={1}
          suffix="px"
          onChange={(px) => onChange({ px })}
        />
      );
    case "brightness":
      return (
        <SliderNumberRow
          value={filter.value}
          min={0}
          max={2}
          step={0.05}
          onChange={(value) => onChange({ value })}
        />
      );
    case "contrast":
      return (
        <SliderNumberRow
          value={filter.value}
          min={0}
          max={2}
          step={0.05}
          onChange={(value) => onChange({ value })}
        />
      );
    case "grayscale":
      return (
        <SliderNumberRow
          value={filter.percent}
          min={0}
          max={100}
          step={1}
          suffix="%"
          onChange={(percent) => onChange({ percent })}
        />
      );
    case "hue-rotate":
      return (
        <SliderNumberRow
          value={filter.degrees}
          min={0}
          max={360}
          step={1}
          suffix="°"
          onChange={(degrees) => onChange({ degrees })}
        />
      );
    case "invert":
      return (
        <SliderNumberRow
          value={filter.percent}
          min={0}
          max={100}
          step={1}
          suffix="%"
          onChange={(percent) => onChange({ percent })}
        />
      );
    case "opacity":
      return (
        <SliderNumberRow
          value={filter.percent}
          min={0}
          max={100}
          step={1}
          suffix="%"
          onChange={(percent) => onChange({ percent })}
        />
      );
    case "saturate":
      return (
        <SliderNumberRow
          value={filter.value}
          min={0}
          max={3}
          step={0.05}
          onChange={(value) => onChange({ value })}
        />
      );
    case "sepia":
      return (
        <SliderNumberRow
          value={filter.percent}
          min={0}
          max={100}
          step={1}
          suffix="%"
          onChange={(percent) => onChange({ percent })}
        />
      );
    case "drop-shadow":
      return (
        <DropShadowRow
          x={filter.x}
          y={filter.y}
          blur={filter.blur}
          color={filter.color}
          onChange={onChange}
        />
      );
  }
}

// =============================================================================
// SliderNumberRow — common slider + number-input pair used by every single-
// number filter. The number input is the source of truth on blur; the slider
// fires onChange continuously while dragging.
// =============================================================================

interface SliderNumberRowProps {
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (next: number) => void;
}

function SliderNumberRow({
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: SliderNumberRowProps) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
        className="flex-1 min-w-0 cursor-pointer"
      />
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(clamp(Number(e.target.value) || 0))}
        className="w-14 px-1 py-0.5 text-[11px] rounded border border-theme bg-theme-tertiary text-theme-primary text-right"
      />
      {suffix && (
        <span className="text-[11px] text-theme-muted w-5 flex-shrink-0">
          {suffix}
        </span>
      )}
    </div>
  );
}

// =============================================================================
// DropShadowRow — four inline inputs: x, y, blur, color. Color uses the
// browser-native color picker for now; consumers that want a richer picker
// can swap this in a follow-up.
// =============================================================================

interface DropShadowRowProps {
  x: number;
  y: number;
  blur: number;
  color: string;
  onChange: (
    patch: Partial<{ x: number; y: number; blur: number; color: string }>
  ) => void;
}

function DropShadowRow({ x, y, blur, color, onChange }: DropShadowRowProps) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      <LabeledNumber
        label="X"
        value={x}
        onChange={(v) => onChange({ x: v })}
      />
      <LabeledNumber
        label="Y"
        value={y}
        onChange={(v) => onChange({ y: v })}
      />
      <LabeledNumber
        label="Blur"
        value={blur}
        min={0}
        onChange={(v) => onChange({ blur: v })}
      />
      <label className="flex flex-col gap-0.5">
        <span className="text-[10px] uppercase tracking-wide text-theme-muted">
          Color
        </span>
        <input
          type="color"
          value={color}
          onChange={(e) => onChange({ color: e.target.value })}
          className="w-full h-6 rounded border border-theme cursor-pointer"
          aria-label="Drop shadow color"
        />
      </label>
    </div>
  );
}

interface LabeledNumberProps {
  label: string;
  value: number;
  min?: number;
  onChange: (n: number) => void;
}

function LabeledNumber({ label, value, min, onChange }: LabeledNumberProps) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-theme-muted">
        {label}
      </span>
      <input
        type="number"
        value={value}
        min={min}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="w-full px-1 py-0.5 text-[11px] rounded border border-theme bg-theme-tertiary text-theme-primary"
      />
    </label>
  );
}

// =============================================================================
// BackdropPreview — small swatch that demonstrates the composed filter live.
// A colorful gradient sits behind a translucent rectangle that has the
// `backdrop-filter` applied; both vendor-prefixed and standard properties
// are set so Safari users still see the effect.
// =============================================================================

function BackdropPreview({ css }: { css: string }) {
  return (
    <div className="rounded border border-theme overflow-hidden">
      <div
        className="relative h-16 w-full"
        style={{
          background:
            "linear-gradient(135deg, #f472b6 0%, #60a5fa 50%, #34d399 100%)",
        }}
      >
        <div
          className="absolute inset-2 rounded flex items-center justify-center text-[11px] text-white/90 font-medium"
          style={{
            backgroundColor: "rgba(255,255,255,0.08)",
            // Safari still needs the prefixed property.
            WebkitBackdropFilter: css,
            backdropFilter: css,
          }}
        >
          Preview
        </div>
      </div>
    </div>
  );
}
