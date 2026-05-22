import type { BackdropFilter, FilterFn, FilterKind } from "./types";

// =============================================================================
// BackdropFilterEditor utilities — pure helpers shared by the editor UI and
// any consumer that wants to render the composed CSS string (e.g. the
// generateThemeCSS emitter in @secretlobby/theme).
//
// Kept framework-free: no React, no DOM access.
// =============================================================================

/**
 * Render a BackdropFilter array as a CSS `backdrop-filter` value. An empty
 * (or undefined) list returns `"none"` so callers can drop the result into a
 * CSS variable without conditionals.
 */
export function backdropFilterToCSS(filters: BackdropFilter | undefined): string {
  if (!filters || filters.length === 0) return "none";
  return filters
    .map((f) => {
      switch (f.kind) {
        case "blur":
          return `blur(${f.px}px)`;
        case "brightness":
          return `brightness(${f.value})`;
        case "contrast":
          return `contrast(${f.value})`;
        case "grayscale":
          return `grayscale(${f.percent}%)`;
        case "hue-rotate":
          return `hue-rotate(${f.degrees}deg)`;
        case "invert":
          return `invert(${f.percent}%)`;
        case "opacity":
          return `opacity(${f.percent}%)`;
        case "saturate":
          return `saturate(${f.value})`;
        case "sepia":
          return `sepia(${f.percent}%)`;
        case "drop-shadow":
          return `drop-shadow(${f.x}px ${f.y}px ${f.blur}px ${f.color})`;
        default:
          return "";
      }
    })
    .filter(Boolean)
    .join(" ");
}

/**
 * Build a fresh FilterFn for the given kind with reasonable defaults. Used
 * when the user picks "Add filter → X" from the editor header dropdown.
 */
export function defaultForKind(kind: FilterKind): FilterFn {
  const id = makeFilterId();
  switch (kind) {
    case "blur":
      return { id, kind, px: 8 };
    case "brightness":
      return { id, kind, value: 1 };
    case "contrast":
      return { id, kind, value: 1 };
    case "grayscale":
      return { id, kind, percent: 0 };
    case "hue-rotate":
      return { id, kind, degrees: 0 };
    case "invert":
      return { id, kind, percent: 0 };
    case "opacity":
      return { id, kind, percent: 100 };
    case "saturate":
      return { id, kind, value: 1 };
    case "sepia":
      return { id, kind, percent: 0 };
    case "drop-shadow":
      return { id, kind, x: 0, y: 2, blur: 4, color: "#000000" };
  }
}

// Compact unique filter id — same pattern as makeStopId in the color-picker.
// Only needs uniqueness within a single BackdropFilter array.
let _filterCounter = 0;
export function makeFilterId(): string {
  _filterCounter += 1;
  return `f_${Date.now().toString(36)}_${_filterCounter}`;
}

/**
 * Human-readable label for each filter kind. Used for the list rows and the
 * "Add filter" menu items.
 */
export function filterKindLabel(kind: FilterKind): string {
  switch (kind) {
    case "blur":
      return "Blur";
    case "brightness":
      return "Brightness";
    case "contrast":
      return "Contrast";
    case "grayscale":
      return "Grayscale";
    case "hue-rotate":
      return "Hue rotate";
    case "invert":
      return "Invert";
    case "opacity":
      return "Opacity";
    case "saturate":
      return "Saturate";
    case "sepia":
      return "Sepia";
    case "drop-shadow":
      return "Drop shadow";
  }
}

export const ALL_FILTER_KINDS: FilterKind[] = [
  "blur",
  "brightness",
  "contrast",
  "grayscale",
  "hue-rotate",
  "invert",
  "opacity",
  "saturate",
  "sepia",
  "drop-shadow",
];
