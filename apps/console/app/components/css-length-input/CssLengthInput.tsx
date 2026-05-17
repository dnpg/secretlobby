import { useEffect, useRef, useState } from "react";
import { cn } from "@secretlobby/ui";

// =============================================================================
// CssLengthInput
// -----------------------------------------------------------------------------
// Compact numeric input with a drag-scrub `px` unit handle on the right edge.
// Mirrors the look + UX of the `WidthInput` used inside BorderEditor so that
// every "CSS length in px" field in the page-builder feels the same:
//
//   - Number input (typeable) with local draft state so typing doesn't fight
//     a parent re-render dispatched on every keystroke.
//   - Right-edge `px` handle is drag-scrubbable (Shift = 0.1 step, Alt = 2x).
//   - Enter / blur commit. A 3px movement threshold prevents stray clicks
//     from being interpreted as a drag.
//
// Reused by:
//   - Global theme font-size (ThemeOverlay → Text section).
//   - Per-paragraph font-size override (ParagraphBlockSettings).
//
// The persisted value is a CSS length string (`"16px"`). The component reads
// the numeric portion via `parseFloat` and always emits `${n}px` back, so
// non-px units handed in get normalised on edit.
// =============================================================================

interface CssLengthInputProps {
  value: string;
  onChange: (next: string) => void;
  ariaLabel: string;
  min?: number;
  max?: number;
  // Step used by direct keyboard + spinner input. The drag-scrub gesture
  // uses its own sensitivity (overridable via Shift/Alt) so this only
  // affects the native number input.
  step?: number;
  // Optional left prefix (e.g. "↕" / "T" — same slot the BorderEditor uses
  // to label the side picker). Omitted for single-axis inputs.
  prefix?: string;
  // Optional placeholder displayed when the field is empty / 0.
  placeholder?: string;
}

const DRAG_SENSITIVITY = 0.5;
const DRAG_THRESHOLD = 3;

function parseLengthPx(value: string, fallback = 0): number {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

export function CssLengthInput({
  value,
  onChange,
  ariaLabel,
  min = 0,
  max = 9999,
  step = 1,
  prefix,
  placeholder,
}: CssLengthInputProps) {
  const numeric = parseLengthPx(value);
  // Local draft so typing doesn't fight a parent re-render with the same
  // parsed value. Re-syncs from the prop when the field isn't focused so
  // an external update (e.g. reset button) reflects immediately.
  const [draft, setDraft] = useState<string>(String(numeric));
  const focusedRef = useRef(false);
  useEffect(() => {
    if (!focusedRef.current) setDraft(String(numeric));
  }, [numeric]);

  const commit = (raw: string) => {
    const n = parseLengthPx(raw, numeric);
    const clamped = Math.max(min, Math.min(max, n));
    setDraft(String(clamped));
    onChange(`${clamped}px`);
  };

  // Drag-scrub on the px handle. Pointer-events for touch/pen support,
  // pointer capture so the drag continues even when the cursor leaves
  // the handle, and a 3px threshold so a click without movement is a no-op.
  const dragStartXRef = useRef<number | null>(null);
  const dragStartValueRef = useRef(0);
  const dragMovedRef = useRef(false);
  const onHandlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    dragStartXRef.current = e.clientX;
    dragStartValueRef.current = parseLengthPx(value, numeric);
    dragMovedRef.current = false;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "ew-resize";
  };
  const onHandlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (dragStartXRef.current === null) return;
    const dx = e.clientX - dragStartXRef.current;
    if (Math.abs(dx) < DRAG_THRESHOLD) return;
    dragMovedRef.current = true;
    const sensitivity = e.shiftKey ? 0.1 : e.altKey ? 2 : DRAG_SENSITIVITY;
    const next = Math.max(
      min,
      Math.min(
        max,
        Math.round(dragStartValueRef.current + dx * sensitivity)
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
        min={min}
        max={max}
        step={step}
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
        placeholder={placeholder ?? "0"}
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
