import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  borderRadiusToCSS,
  type BorderRadius,
  type RadiusCorners,
} from "~/lib/theme";

// =============================================================================
// BorderRadiusInput
// -----------------------------------------------------------------------------
// Figma-style border-radius control. Default (collapsed) view is a single
// number input whose in-field glyph doubles as a drag-to-scrub handle and
// writes all four corners uniformly. A right-side button toggles a 2x2 grid
// of per-corner inputs (TL/TR/BL/BR). Each per-corner field also exposes a
// drag-scrub handle scoped to that corner.
//
// Uniformity is derived from `value` itself — when `value` is a number OR
// every corner of the object matches, the collapsed view shows that number;
// otherwise the collapsed input shows the placeholder "Mixed" (italic, muted)
// but typing a number / dragging its handle still writes to all four corners
// and collapses back to uniform mode.
// =============================================================================

interface BorderRadiusInputProps {
  value: BorderRadius;
  onChange: (next: BorderRadius) => void;
  min?: number;
  max?: number;
  label?: string;
}

// Helpers — pure, local.
function isUniform(value: BorderRadius): boolean {
  if (typeof value === "number") return true;
  return (
    value.tl === value.tr &&
    value.tr === value.br &&
    value.br === value.bl
  );
}

function uniformValue(value: BorderRadius): number | null {
  if (typeof value === "number") return value;
  if (isUniform(value)) return value.tl;
  return null;
}

function asCorners(value: BorderRadius): RadiusCorners {
  if (typeof value === "number") {
    return { tl: value, tr: value, br: value, bl: value };
  }
  return value;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

// =============================================================================
// useDragScrub — pointer-events based scrubbing for a Figma-style number drag.
// -----------------------------------------------------------------------------
// Returns props to spread onto a handle element. On pointerdown we capture the
// pointer, remember the starting client X and the starting numeric value, then
// translate horizontal motion into integer deltas (with Shift = fine, Alt =
// coarse). Movement under DRAG_THRESHOLD px is treated as a click (no-op for
// onChange) so the handle can co-exist with other gestures.
// =============================================================================
const DRAG_THRESHOLD = 3; // px
const BASE_SENSITIVITY = 0.5; // 2px ≈ 1 unit
const FINE_SENSITIVITY = 0.1;
const COARSE_SENSITIVITY = 2;

interface UseDragScrubArgs {
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
}

function useDragScrub({ value, min, max, onChange }: UseDragScrubArgs) {
  // Refs so handlers stay stable and always see the freshest start state.
  const startXRef = useRef(0);
  const startValueRef = useRef(0);
  const draggingRef = useRef(false);
  const movedRef = useRef(false);
  const prevBodyUserSelectRef = useRef<string | null>(null);
  const prevBodyCursorRef = useRef<string | null>(null);

  const beginBodyDragStyles = () => {
    prevBodyUserSelectRef.current = document.body.style.userSelect;
    prevBodyCursorRef.current = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "ew-resize";
  };

  const endBodyDragStyles = () => {
    document.body.style.userSelect = prevBodyUserSelectRef.current ?? "";
    document.body.style.cursor = prevBodyCursorRef.current ?? "";
    prevBodyUserSelectRef.current = null;
    prevBodyCursorRef.current = null;
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    // Only respond to primary button / single-touch / pen.
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    startXRef.current = e.clientX;
    startValueRef.current = value;
    draggingRef.current = true;
    movedRef.current = false;
    beginBodyDragStyles();
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    if (!draggingRef.current) return;
    const dx = e.clientX - startXRef.current;
    if (!movedRef.current && Math.abs(dx) < DRAG_THRESHOLD) return;
    movedRef.current = true;
    const sensitivity = e.shiftKey
      ? FINE_SENSITIVITY
      : e.altKey
        ? COARSE_SENSITIVITY
        : BASE_SENSITIVITY;
    const next = clamp(
      Math.round(startValueRef.current + dx * sensitivity),
      min,
      max
    );
    if (next !== value) onChange(next);
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // pointer may have already been released; ignore.
    }
    endBodyDragStyles();
  };

  const onPointerCancel = (e: ReactPointerEvent<HTMLElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    endBodyDragStyles();
  };

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  };
}

// SVG corner glyph — small open-shape path showing which corner is rounded.
// Rotates via the `transform` prop to address each of the four corners.
function CornerGlyph({ rotate }: { rotate: 0 | 90 | 180 | 270 }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: `rotate(${rotate}deg)` }}
      aria-hidden="true"
    >
      <path d="M2 14 L2 6 A4 4 0 0 1 6 2 L14 2" />
    </svg>
  );
}

// Right-side toggle icon — four small dots in a 2x2 arrangement.
function CornersToggleIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="4" cy="4" r="1.5" />
      <circle cx="12" cy="4" r="1.5" />
      <circle cx="4" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
    </svg>
  );
}

// =============================================================================
// ScrubField — a single number input with a drag-scrub glyph on its left edge.
// Used both for the main (uniform) row and each per-corner cell.
// =============================================================================
interface ScrubFieldProps {
  rotate: 0 | 90 | 180 | 270;
  value: number | null; // null → render as "Mixed" placeholder
  scrubValue: number; // value used as the start of a drag (e.g. 0 when mixed)
  min: number;
  max: number;
  onChange: (next: number) => void;
  ariaLabel: string;
  handleAriaLabel: string;
}

function ScrubField({
  rotate,
  value,
  scrubValue,
  min,
  max,
  onChange,
  ariaLabel,
  handleAriaLabel,
}: ScrubFieldProps) {
  // Local string buffer so the user can type freely (clears "Mixed").
  const [draft, setDraft] = useState<string | null>(null);
  const isMixed = value === null;

  const commit = (raw: string) => {
    setDraft(null);
    const n = Number(raw);
    if (raw.trim() === "" || Number.isNaN(n)) return;
    onChange(clamp(n, min, max));
  };

  const scrub = useDragScrub({
    value: scrubValue,
    min,
    max,
    onChange,
  });

  const inputValue =
    draft !== null ? draft : isMixed ? "" : (value as number);

  return (
    <div className="flex items-center gap-1.5 rounded border border-theme bg-theme-tertiary px-2 py-1 flex-1 min-w-0">
      <button
        type="button"
        // Drag-scrub handle. It's a button so it's keyboard-reachable and gets
        // the standard focus ring, but its primary affordance is the pointer
        // drag — a plain click does nothing (the click vs. drag threshold in
        // useDragScrub handles this).
        className="flex items-center justify-center text-theme-muted hover:text-theme-primary flex-shrink-0 cursor-ew-resize touch-none"
        style={{ touchAction: "none" }}
        aria-label={handleAriaLabel}
        title="Drag to adjust (Shift: fine, Alt: coarse)"
        tabIndex={-1}
        {...scrub}
      >
        <CornerGlyph rotate={rotate} />
      </button>
      <input
        type="number"
        value={inputValue}
        placeholder={isMixed ? "Mixed" : undefined}
        min={min}
        max={max}
        step={1}
        onFocus={(e) => {
          if (draft === null) setDraft(e.target.value);
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit((e.target as HTMLInputElement).value);
            (e.target as HTMLInputElement).blur();
          }
        }}
        className={`w-full min-w-0 bg-transparent text-xs text-theme-primary outline-none ${
          isMixed && draft === null
            ? "italic placeholder:italic placeholder:text-theme-muted"
            : ""
        }`}
        aria-label={ariaLabel}
      />
    </div>
  );
}

export function BorderRadiusInput({
  value,
  onChange,
  min = 0,
  max = 9999,
  label,
}: BorderRadiusInputProps) {
  // Whether the expanded (4-corner grid) view is open. Independent of value
  // uniformity — the user can collapse a "Mixed" state and we keep the per-
  // corner object intact while showing the "Mixed" placeholder.
  const [expanded, setExpanded] = useState(false);

  const uniform = uniformValue(value);
  const corners = asCorners(value);
  const displayCSS = borderRadiusToCSS(value);

  // Uniform writer — used by both the main input's typing path and its drag-
  // scrub handle. Stores a plain `number` so persisted JSON stays small.
  const setUniform = (n: number) => {
    onChange(clamp(n, min, max));
  };

  const setCorner = (key: keyof RadiusCorners, next: number) => {
    const updated: RadiusCorners = {
      ...corners,
      [key]: clamp(next, min, max),
    };
    // Collapse back to a plain number when all four corners match — keeps
    // persisted JSON minimal for the common uniform case.
    if (
      updated.tl === updated.tr &&
      updated.tr === updated.br &&
      updated.br === updated.bl
    ) {
      onChange(updated.tl);
    } else {
      onChange(updated);
    }
  };

  const handleToggle = () => {
    if (!expanded) {
      // Opening the grid — if value is a uniform number, expand it into four
      // identical corners so the per-corner fields are pre-filled.
      if (typeof value === "number") {
        onChange({ tl: value, tr: value, br: value, bl: value });
      }
      setExpanded(true);
    } else {
      // Collapsing — if all corners match collapse to a number; otherwise
      // keep the per-corner object (the uniform input will show "Mixed").
      if (isUniform(value) && typeof value !== "number") {
        onChange(value.tl);
      }
      setExpanded(false);
    }
  };

  // Shared top row — always rendered, even when expanded. Per the brief the
  // expanded view simply adds the 2x2 corner grid underneath.
  const topRow = (
    <div className="flex items-center gap-1.5">
      <ScrubField
        rotate={0}
        value={uniform}
        // When mixed, base the scrub on the average so dragging from "Mixed"
        // doesn't snap to 0 — feels more natural and matches Figma.
        scrubValue={
          uniform ??
          Math.round((corners.tl + corners.tr + corners.br + corners.bl) / 4)
        }
        min={min}
        max={max}
        onChange={setUniform}
        ariaLabel={label ? `${label} (uniform)` : "Border radius"}
        handleAriaLabel="Drag to adjust border radius"
      />
      <button
        type="button"
        onClick={handleToggle}
        className={`p-1.5 rounded border border-theme cursor-pointer flex-shrink-0 ${
          expanded
            ? "bg-theme-tertiary text-theme-primary"
            : "text-theme-muted hover:text-theme-primary hover:bg-theme-tertiary"
        }`}
        title={expanded ? "Collapse corners" : "Edit corners individually"}
        aria-label={expanded ? "Collapse corners" : "Expand corners"}
        aria-pressed={expanded}
      >
        <CornersToggleIcon />
      </button>
    </div>
  );

  return (
    <div>
      {(label || displayCSS) && (
        <div className="flex items-center justify-between text-xs text-theme-secondary mb-1">
          {label ? <span>{label}</span> : <span />}
          <span className="text-theme-muted">{displayCSS}</span>
        </div>
      )}
      {expanded ? (
        <div className="space-y-1.5">
          {topRow}
          <div className="grid grid-cols-2 gap-1.5">
            <ScrubField
              rotate={0}
              value={corners.tl}
              scrubValue={corners.tl}
              min={min}
              max={max}
              onChange={(n) => setCorner("tl", n)}
              ariaLabel="Top-left corner radius"
              handleAriaLabel="Drag to adjust top-left corner"
            />
            <ScrubField
              rotate={90}
              value={corners.tr}
              scrubValue={corners.tr}
              min={min}
              max={max}
              onChange={(n) => setCorner("tr", n)}
              ariaLabel="Top-right corner radius"
              handleAriaLabel="Drag to adjust top-right corner"
            />
            <ScrubField
              rotate={270}
              value={corners.bl}
              scrubValue={corners.bl}
              min={min}
              max={max}
              onChange={(n) => setCorner("bl", n)}
              ariaLabel="Bottom-left corner radius"
              handleAriaLabel="Drag to adjust bottom-left corner"
            />
            <ScrubField
              rotate={180}
              value={corners.br}
              scrubValue={corners.br}
              min={min}
              max={max}
              onChange={(n) => setCorner("br", n)}
              ariaLabel="Bottom-right corner radius"
              handleAriaLabel="Drag to adjust bottom-right corner"
            />
          </div>
        </div>
      ) : (
        topRow
      )}
    </div>
  );
}
