import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  boxPaddingToCSS,
  type BoxPadding,
  type BoxSides,
} from "~/lib/theme";

// =============================================================================
// BoxPaddingInput
// -----------------------------------------------------------------------------
// Figma-style box-padding control — sibling of `BorderRadiusInput` for the
// four sides of a CSS box. Default (collapsed) view is a single number input
// whose in-field glyph doubles as a drag-to-scrub handle and writes all four
// sides uniformly. A right-side button toggles a 2x2 grid of per-side inputs
// (Top / Right / Bottom / Left). Each per-side field also exposes a
// drag-scrub handle scoped to that side.
//
// Uniformity is derived from `value` itself — when `value` is a number OR
// every side of the object matches, the collapsed view shows that number;
// otherwise the collapsed input shows the placeholder "Mixed" (italic,
// muted) but typing a number / dragging its handle still writes to all four
// sides and collapses back to uniform mode.
// =============================================================================

interface BoxPaddingInputProps {
  value: BoxPadding;
  onChange: (next: BoxPadding) => void;
  min?: number;
  max?: number;
  label?: string;
}

function isUniform(value: BoxPadding): boolean {
  if (typeof value === "number") return true;
  return (
    value.top === value.right &&
    value.right === value.bottom &&
    value.bottom === value.left
  );
}

function uniformValue(value: BoxPadding): number | null {
  if (typeof value === "number") return value;
  if (isUniform(value)) return value.top;
  return null;
}

function asSides(value: BoxPadding): BoxSides {
  if (typeof value === "number") {
    return { top: value, right: value, bottom: value, left: value };
  }
  return value;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

// =============================================================================
// useDragScrub — kept inline-duplicated with BorderRadiusInput's variant so
// each input stays self-contained. Future refactor could lift this into a
// shared hook (e.g. ~/lib/use-drag-scrub.ts) but the two consumers are tiny
// and divergence risk is low.
// =============================================================================
const DRAG_THRESHOLD = 3;
const BASE_SENSITIVITY = 0.5;
const FINE_SENSITIVITY = 0.1;
const COARSE_SENSITIVITY = 2;

interface UseDragScrubArgs {
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
}

function useDragScrub({ value, min, max, onChange }: UseDragScrubArgs) {
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

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}

// Side glyph — a short arrow pointing toward the side this field controls
// (top/right/bottom/left). Inline SVG, no dependency.
function SideGlyph({ side }: { side: "top" | "right" | "bottom" | "left" | "all" }) {
  // Rotation table — base SVG points UP for "top"; rotate to address the
  // other sides. "all" uses a plus sign instead (no rotation).
  const rotate =
    side === "right"
      ? 90
      : side === "bottom"
        ? 180
        : side === "left"
          ? 270
          : 0;
  if (side === "all") {
    return (
      <svg
        width="10"
        height="10"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        aria-hidden="true"
      >
        <path d="M8 3 L8 13 M3 8 L13 8" />
      </svg>
    );
  }
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
      <path d="M8 13 L8 3 M4 7 L8 3 L12 7" />
    </svg>
  );
}

// Right-side toggle icon — same 2x2 dots as BorderRadiusInput so the affordance
// reads the same across both controls.
function SidesToggleIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="8" cy="2" r="1.5" />
      <circle cx="14" cy="8" r="1.5" />
      <circle cx="8" cy="14" r="1.5" />
      <circle cx="2" cy="8" r="1.5" />
    </svg>
  );
}

interface ScrubFieldProps {
  side: "top" | "right" | "bottom" | "left" | "all";
  value: number | null;
  scrubValue: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
  ariaLabel: string;
  handleAriaLabel: string;
}

function ScrubField({
  side,
  value,
  scrubValue,
  min,
  max,
  onChange,
  ariaLabel,
  handleAriaLabel,
}: ScrubFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const isMixed = value === null;

  const commit = (raw: string) => {
    setDraft(null);
    const n = Number(raw);
    if (raw.trim() === "" || Number.isNaN(n)) return;
    onChange(clamp(n, min, max));
  };

  const scrub = useDragScrub({ value: scrubValue, min, max, onChange });

  const inputValue =
    draft !== null ? draft : isMixed ? "" : (value as number);

  return (
    <div className="flex items-center gap-1.5 rounded border border-theme bg-theme-tertiary px-2 py-1 flex-1 min-w-0">
      <button
        type="button"
        className="flex items-center justify-center text-theme-muted hover:text-theme-primary flex-shrink-0 cursor-ew-resize touch-none"
        style={{ touchAction: "none" }}
        aria-label={handleAriaLabel}
        title="Drag to adjust (Shift: fine, Alt: coarse)"
        tabIndex={-1}
        {...scrub}
      >
        <SideGlyph side={side} />
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

export function BoxPaddingInput({
  value,
  onChange,
  min = 0,
  max = 9999,
  label,
}: BoxPaddingInputProps) {
  const [expanded, setExpanded] = useState(false);

  const uniform = uniformValue(value);
  const sides = asSides(value);
  const displayCSS = boxPaddingToCSS(value);

  const setUniform = (n: number) => {
    onChange(clamp(n, min, max));
  };

  const setSide = (key: keyof BoxSides, next: number) => {
    const updated: BoxSides = {
      ...sides,
      [key]: clamp(next, min, max),
    };
    if (
      updated.top === updated.right &&
      updated.right === updated.bottom &&
      updated.bottom === updated.left
    ) {
      onChange(updated.top);
    } else {
      onChange(updated);
    }
  };

  const handleToggle = () => {
    if (!expanded) {
      if (typeof value === "number") {
        onChange({ top: value, right: value, bottom: value, left: value });
      }
      setExpanded(true);
    } else {
      if (isUniform(value) && typeof value !== "number") {
        onChange(value.top);
      }
      setExpanded(false);
    }
  };

  const topRow = (
    <div className="flex items-center gap-1.5">
      <ScrubField
        side="all"
        value={uniform}
        scrubValue={
          uniform ??
          Math.round(
            (sides.top + sides.right + sides.bottom + sides.left) / 4
          )
        }
        min={min}
        max={max}
        onChange={setUniform}
        ariaLabel={label ? `${label} (uniform)` : "Padding"}
        handleAriaLabel="Drag to adjust padding"
      />
      <button
        type="button"
        onClick={handleToggle}
        className={`p-1.5 rounded border border-theme cursor-pointer flex-shrink-0 ${
          expanded
            ? "bg-theme-tertiary text-theme-primary"
            : "text-theme-muted hover:text-theme-primary hover:bg-theme-tertiary"
        }`}
        title={expanded ? "Collapse sides" : "Edit sides individually"}
        aria-label={expanded ? "Collapse sides" : "Expand sides"}
        aria-pressed={expanded}
      >
        <SidesToggleIcon />
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
          {/* 2x2 grid mirrors BorderRadiusInput's corner layout. We arrange
              the sides as [Top, Right] over [Left, Bottom] so the visual
              order reads "across the top, across the bottom" left to right,
              matching how the user thinks about the rectangle's outline. */}
          <div className="grid grid-cols-2 gap-1.5">
            <ScrubField
              side="top"
              value={sides.top}
              scrubValue={sides.top}
              min={min}
              max={max}
              onChange={(n) => setSide("top", n)}
              ariaLabel="Top padding"
              handleAriaLabel="Drag to adjust top padding"
            />
            <ScrubField
              side="right"
              value={sides.right}
              scrubValue={sides.right}
              min={min}
              max={max}
              onChange={(n) => setSide("right", n)}
              ariaLabel="Right padding"
              handleAriaLabel="Drag to adjust right padding"
            />
            <ScrubField
              side="left"
              value={sides.left}
              scrubValue={sides.left}
              min={min}
              max={max}
              onChange={(n) => setSide("left", n)}
              ariaLabel="Left padding"
              handleAriaLabel="Drag to adjust left padding"
            />
            <ScrubField
              side="bottom"
              value={sides.bottom}
              scrubValue={sides.bottom}
              min={min}
              max={max}
              onChange={(n) => setSide("bottom", n)}
              ariaLabel="Bottom padding"
              handleAriaLabel="Drag to adjust bottom padding"
            />
          </div>
        </div>
      ) : (
        topRow
      )}
    </div>
  );
}
