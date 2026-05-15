// =============================================================================
// BackdropFilterEditor types
// -----------------------------------------------------------------------------
// Discriminated union mirroring the CSS `backdrop-filter` function set. Each
// entry carries the per-function value(s) plus a stable id used as a list key.
//
// The component is framework-free and the types are kept dependency-free so
// other apps / packages can consume them without pulling React.
// =============================================================================

export type FilterKind =
  | "blur"
  | "brightness"
  | "contrast"
  | "grayscale"
  | "hue-rotate"
  | "invert"
  | "opacity"
  | "saturate"
  | "sepia"
  | "drop-shadow";

export type FilterFn =
  | { id: string; kind: "blur"; px: number }
  | { id: string; kind: "brightness"; value: number }
  | { id: string; kind: "contrast"; value: number }
  | { id: string; kind: "grayscale"; percent: number }
  | { id: string; kind: "hue-rotate"; degrees: number }
  | { id: string; kind: "invert"; percent: number }
  | { id: string; kind: "opacity"; percent: number }
  | { id: string; kind: "saturate"; value: number }
  | { id: string; kind: "sepia"; percent: number }
  | {
      id: string;
      kind: "drop-shadow";
      x: number;
      y: number;
      blur: number;
      color: string;
    };

export type BackdropFilter = FilterFn[];
