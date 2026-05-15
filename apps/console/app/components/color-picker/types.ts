// =============================================================================
// ColorPicker types
// -----------------------------------------------------------------------------
// Shared by the picker, its sub-components, and the page-builder route that
// hosts the swatch persistence (POSTs go through the route's fetcher).
//
// The shape mirrors @secretlobby/theme's ThemeBackground so a single value
// can be passed straight into the theme reducer when used for the lobby bg.
// =============================================================================

export interface GradientStop {
  id: string;
  position: number; // 0–100
  color: string; // #rrggbb (no alpha — opacity is separate)
  opacity: number; // 0–100
}

export interface LinearGradientValue {
  kind: "linear";
  angle: number; // 0–360
  stops: GradientStop[];
}

export interface RadialGradientValue {
  kind: "radial";
  shape: "circle" | "ellipse";
  stops: GradientStop[];
}

export interface ConicGradientValue {
  kind: "conic";
  angle: number; // 0–360 — starting angle for the sweep
  stops: GradientStop[];
}

export type GradientKindValue =
  | LinearGradientValue
  | RadialGradientValue
  | ConicGradientValue;

export interface SolidValue {
  type: "solid";
  color: string; // #rrggbb
  opacity: number; // 0–100
}

export interface GradientValue {
  type: "gradient";
  gradient: GradientKindValue;
  /**
   * Hex (#rrggbb) used in contexts that can't render a gradient. Two consumer
   * scenarios:
   *  1. A hex-only field is forced to resolve the value down to a single color
   *     (e.g. a per-block override that hasn't migrated to gradient yet).
   *  2. The CSS background-clip:text trick used for gradient *text* isn't
   *     supported by the visitor's browser — in that case the color falls
   *     back to this hex.
   * Always present so consumers never need a hardcoded default.
   */
  fallback: string;
}

// A "design token" reference to a saved swatch. The picker writes this when
// the user clicks a saved swatch tile, instead of copying the swatch's value
// inline. Consumers resolve it at render time against the live swatches list
// so editing a swatch propagates everywhere it's used. On swatch deletion the
// server cascades and replaces every ref with an inlined Solid/Gradient.
export interface SwatchRefValue {
  type: "swatch-ref";
  swatchId: string;
}

export type ColorValue = SolidValue | GradientValue | SwatchRefValue;

// A saved swatch — same payload shape as a `ColorValue`, plus a server id + name.
// `value` is the swatch's own resolved Solid/Gradient — swatches themselves
// never reference other swatches (no nesting).
export interface SavedSwatch {
  id: string;
  name: string;
  kind: "solid" | "gradient";
  value: SolidValue | GradientValue;
}
