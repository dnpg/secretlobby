import { useState } from "react";
import {
  borderRadiusToCSS,
  type BorderRadius,
  type RadiusCorners,
} from "~/lib/theme";

// =============================================================================
// BorderRadiusInput
// -----------------------------------------------------------------------------
// Figma-style border-radius control. Default (collapsed) view is a single
// number input that writes all four corners uniformly. A corners-toggle button
// expands the control into a 2x2 grid of per-corner inputs (TL/TR/BR/BL),
// each defaulting to the current uniform value.
//
// Uniformity is derived from `value` itself — when `value` is a number OR
// every corner of the object matches, the collapsed view shows that number;
// otherwise the collapsed input shows the placeholder "Mixed" (italic, muted)
// but typing a number still writes to all four corners and collapses back to
// uniform mode.
// =============================================================================

interface BorderRadiusInputProps {
  value: BorderRadius;
  onChange: (next: BorderRadius) => void;
  min?: number;
  max?: number;
  label?: string;
}

// Helpers — pure, exported as locals.
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

// Clamp a number into [min, max].
function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

// SVG corner glyphs — small open-shape paths showing which corner is rounded.
// All four corners share the same `M2 14 L2 6 A4 4 0 0 1 6 2 L14 2` base path
// (top-left rounded) and rotate via the `transform` prop.
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

// Toggle icon — four small dots in a 2x2 arrangement when the control is
// uniform; a single rounded-rectangle when expanded (signals "collapse").
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

function CollapseIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <rect x="2" y="2" width="12" height="12" rx="3" />
    </svg>
  );
}

interface CornerFieldProps {
  rotate: 0 | 90 | 180 | 270;
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
  ariaLabel: string;
}

function CornerField({
  rotate,
  value,
  min,
  max,
  onChange,
  ariaLabel,
}: CornerFieldProps) {
  return (
    <div className="flex items-center gap-1 rounded border border-theme bg-theme-tertiary px-1.5 py-1">
      <span className="text-theme-muted flex-shrink-0">
        <CornerGlyph rotate={rotate} />
      </span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={1}
        onChange={(e) => {
          const raw = Number(e.target.value);
          if (Number.isNaN(raw)) return;
          onChange(clamp(raw, min, max));
        }}
        className="w-full min-w-0 bg-transparent text-xs text-theme-primary outline-none"
        aria-label={ariaLabel}
      />
    </div>
  );
}

export function BorderRadiusInput({
  value,
  onChange,
  min = 0,
  max = 64,
  label,
}: BorderRadiusInputProps) {
  // Whether the expanded (4-corner grid) view is open. Independent of value
  // uniformity — the user can collapse a "Mixed" state and we keep the per-
  // corner object intact while showing the "Mixed" placeholder.
  const [expanded, setExpanded] = useState(false);

  // Local string buffer for the uniform input so the user can type freely
  // (clears on focus when "Mixed"). On commit (Enter / blur) we parse and
  // write to all four corners.
  const uniform = uniformValue(value);
  const [uniformDraft, setUniformDraft] = useState<string | null>(null);

  const corners = asCorners(value);
  const isMixed = uniform === null;
  const displayCSS = borderRadiusToCSS(value);

  const commitUniform = (raw: string) => {
    setUniformDraft(null);
    const n = Number(raw);
    if (raw.trim() === "" || Number.isNaN(n)) return; // ignore non-numeric
    onChange(clamp(n, min, max));
  };

  const setCorner = (key: keyof RadiusCorners, next: number) => {
    const updated: RadiusCorners = { ...corners, [key]: next };
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
          <div className="grid grid-cols-2 gap-1.5">
            <CornerField
              rotate={0}
              value={corners.tl}
              min={min}
              max={max}
              onChange={(n) => setCorner("tl", n)}
              ariaLabel="Top-left corner radius"
            />
            <CornerField
              rotate={90}
              value={corners.tr}
              min={min}
              max={max}
              onChange={(n) => setCorner("tr", n)}
              ariaLabel="Top-right corner radius"
            />
            <CornerField
              rotate={270}
              value={corners.bl}
              min={min}
              max={max}
              onChange={(n) => setCorner("bl", n)}
              ariaLabel="Bottom-left corner radius"
            />
            <CornerField
              rotate={180}
              value={corners.br}
              min={min}
              max={max}
              onChange={(n) => setCorner("br", n)}
              ariaLabel="Bottom-right corner radius"
            />
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleToggle}
              className="p-1 rounded text-theme-muted hover:text-theme-primary hover:bg-theme-tertiary cursor-pointer"
              title="Collapse to a single value"
              aria-label="Collapse corners"
              aria-pressed={true}
            >
              <CollapseIcon />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            value={
              uniformDraft !== null
                ? uniformDraft
                : isMixed
                  ? ""
                  : (uniform as number)
            }
            placeholder={isMixed ? "Mixed" : undefined}
            min={min}
            max={max}
            step={1}
            onFocus={(e) => {
              // Start a fresh typing buffer so the user can replace the value
              // without having to clear "Mixed" manually.
              if (uniformDraft === null) setUniformDraft(e.target.value);
            }}
            onChange={(e) => setUniformDraft(e.target.value)}
            onBlur={(e) => commitUniform(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitUniform((e.target as HTMLInputElement).value);
                (e.target as HTMLInputElement).blur();
              }
            }}
            className={`flex-1 min-w-0 px-2 py-1 text-xs bg-theme-tertiary border border-theme rounded text-theme-primary ${
              isMixed && uniformDraft === null
                ? "italic placeholder:italic placeholder:text-theme-muted"
                : ""
            }`}
            aria-label={label ? `${label} (uniform)` : "Border radius"}
          />
          <button
            type="button"
            onClick={handleToggle}
            className="p-1.5 rounded border border-theme text-theme-muted hover:text-theme-primary hover:bg-theme-tertiary cursor-pointer flex-shrink-0"
            title="Edit corners individually"
            aria-label="Expand corners"
            aria-pressed={false}
          >
            <CornersToggleIcon />
          </button>
        </div>
      )}
    </div>
  );
}
