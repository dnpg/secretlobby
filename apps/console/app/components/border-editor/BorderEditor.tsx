import { useEffect, useRef, useState } from "react";
import { cn } from "@secretlobby/ui";
import type {
  BorderSideStyles,
  BorderSideWidths,
  BorderStyle,
  BoxShadow,
  ShadowStop,
} from "@secretlobby/theme";
import {
  ColorPicker,
  type ColorValue,
  type SavedSwatch,
} from "~/components/color-picker";
import {
  formatHexWithAlpha,
  parseHexWithAlpha,
  unlinkValue,
} from "~/components/color-picker/utils";

// =============================================================================
// BorderEditor
// -----------------------------------------------------------------------------
// Reusable border-settings component for the page-builder sidebar. Pure UI —
// the caller owns the value, saved swatches, and persistence handlers.
//
// Composition (top → bottom):
//   1. Border style          — full CSS border-style dropdown (or per-side).
//   2. Border width          — Figma-style uniform input with a per-side
//                              expand (top/right/bottom/left). Width 0 / 0px
//                              acts as the border on/off switch — no explicit
//                              "show" toggle.
//   3. Border color          — ColorPicker (solid only). Hex+alpha round-trips
//                              through the underlying string field.
//   4. Box-shadow            — collapsible stack with inset toggle, +Add /
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
  style: BorderStyle;
  /** Uniform width (CSS length, e.g. "1px"). When `sideWidths` is set, the
   *  uniform value still seeds the per-side inputs on first expand. A value
   *  of `"0"` / `"0px"` means "no border" — there is no separate show flag. */
  width: string;
  /** Hex with optional alpha (#RRGGBB or #RRGGBBAA). */
  colorHex: string;
  /** Per-side widths — populated when the user expands the per-side editor.
   *  Undefined means "use uniform width". */
  sideWidths?: BorderSideWidths;
  /** Per-side styles — populated when the user expands per-side. */
  sideStyles?: BorderSideStyles;
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

export function BorderEditor({
  value,
  onChange,
  swatches = [],
  onSaveSwatch,
  onUpdateSwatch,
  onDeleteSwatch,
  setDraft,
  clearDraft,
}: BorderEditorProps) {
  return (
    <div className="space-y-3">
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
      // Collapse — keep the top side as the new uniform; the per-side
      // overrides are dropped.
      onChange({
        ...value,
        style: sides.top,
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
// WidthRow — Figma-style uniform input with per-side expand. Width 0 = no
// border (the renderer hides the border whenever every effective width is 0).
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
      onChange({
        ...value,
        width: sides.top,
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

// Parse a CSS length like "1px" / "0.5px" / "2" into its numeric part. We
// always emit `${n}px` back, so non-px units are normalised on edit. Returns
// 0 for unparseable input (matches "no border" semantics).
function parseWidthPx(value: string): number {
  const n = parseFloat(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

const WIDTH_MIN = 0;
const WIDTH_MAX = 64;
const WIDTH_DRAG_SENSITIVITY = 0.5; // 2px of cursor travel ≈ 1 unit
const WIDTH_DRAG_THRESHOLD = 3; // ignore "wiggle on click" up to 3px

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
  // Track the number portion locally so typing doesn't fight a parent
  // re-render with the same parsed value. Re-sync on prop change when blurred.
  const numeric = parseWidthPx(value);
  const [draft, setDraft] = useState<string>(String(numeric));
  const focusedRef = useRef(false);
  useEffect(() => {
    if (!focusedRef.current) setDraft(String(numeric));
  }, [numeric]);

  const commit = (raw: string) => {
    const n = parseWidthPx(raw);
    const clamped = Math.max(WIDTH_MIN, Math.min(WIDTH_MAX, n));
    setDraft(String(clamped));
    onChange(`${clamped}px`);
  };

  // Drag-scrub the "px" unit handle on the right edge — pointer-events so
  // touch / pen work, capture so the drag continues even if the cursor
  // exits the handle, and a 3px threshold so a stray click is a no-op.
  const dragStartXRef = useRef<number | null>(null);
  const dragStartValueRef = useRef(0);
  const dragMovedRef = useRef(false);
  const onHandlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    dragStartXRef.current = e.clientX;
    dragStartValueRef.current = parseWidthPx(value);
    dragMovedRef.current = false;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "ew-resize";
  };
  const onHandlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (dragStartXRef.current === null) return;
    const dx = e.clientX - dragStartXRef.current;
    if (Math.abs(dx) < WIDTH_DRAG_THRESHOLD) return;
    dragMovedRef.current = true;
    const step = e.shiftKey
      ? 0.1
      : e.altKey
        ? 2
        : WIDTH_DRAG_SENSITIVITY;
    const next = Math.max(
      WIDTH_MIN,
      Math.min(
        WIDTH_MAX,
        Math.round(dragStartValueRef.current + dx * step)
      )
    );
    setDraft(String(next));
    onChange(`${next}px`);
  };
  const endDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (dragStartXRef.current === null) return;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    dragStartXRef.current = null;
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  };

  return (
    <div
      className={cn(
        "flex items-stretch rounded border border-theme bg-theme-tertiary text-theme-primary",
        "focus-within:ring-2 focus-within:ring-blue-500/40"
      )}
    >
      {prefix && (
        <span className="px-1.5 py-1 text-[10px] text-theme-muted flex items-center w-7 flex-shrink-0">
          {prefix}
        </span>
      )}
      <input
        type="number"
        inputMode="numeric"
        min={WIDTH_MIN}
        max={WIDTH_MAX}
        step={1}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={() => {
          focusedRef.current = true;
        }}
        onBlur={(e) => {
          focusedRef.current = false;
          commit(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit((e.target as HTMLInputElement).value);
        }}
        className="flex-1 min-w-0 border-none bg-transparent focus:outline-none text-theme-primary px-1.5 py-1 text-xs"
        placeholder="0"
        aria-label={ariaLabel}
      />
      <button
        type="button"
        onPointerDown={onHandlePointerDown}
        onPointerMove={onHandlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className={cn(
          "px-2 text-[10px] text-theme-muted border-l border-theme select-none touch-none",
          "hover:text-theme-primary cursor-ew-resize"
        )}
        tabIndex={-1}
        title="Drag to adjust"
        aria-label={`${ariaLabel} — drag to adjust`}
      >
        px
      </button>
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
  // No visible offset / blur by default — the user opts into a real shadow
  // by editing the row. Keeps cards shadowless until intentionally styled.
  x: 0,
  y: 0,
  blur: 0,
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
