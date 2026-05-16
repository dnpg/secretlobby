// =============================================================================
// @secretlobby/theme
// -----------------------------------------------------------------------------
// Pure, framework-free theme helpers and defaults. The console app's
// content.server.ts and the lobby's _index.tsx / api.designer-preview.tsx
// previously held duplicate copies of these — this package is the single
// source of truth.
//
// Nothing here imports Prisma, fs, or React; safe to use from server code,
// route loaders, client components, and SSR.
// =============================================================================

export type ColorMode = "dark" | "light" | "system";

// =============================================================================
// Background value — solid color OR linear gradient.
// -----------------------------------------------------------------------------
// Theme uses a single `background` field; older lobbies stored bgPrimary /
// bgSecondary / bgTertiary as hex strings — migrateThemeBackground() coerces
// those into a SolidBackground at read time.
// =============================================================================

export interface GradientStop {
  id: string;
  position: number; // 0–100
  color: string; // hex (#rrggbb)
  opacity: number; // 0–100
}

export interface LinearGradient {
  kind: "linear";
  angle: number; // 0–360 degrees
  stops: GradientStop[];
}

export interface RadialGradient {
  kind: "radial";
  shape: "circle" | "ellipse";
  stops: GradientStop[];
}

export interface ConicGradient {
  kind: "conic";
  angle: number; // 0–360 degrees, starting angle for the sweep
  stops: GradientStop[];
}

export type ThemeGradient = LinearGradient | RadialGradient | ConicGradient;

export type Solid = { type: "solid"; color: string; opacity: number };
export type Gradient = {
  type: "gradient";
  gradient: ThemeGradient;
  /**
   * Hex (#rrggbb) used by consumers that can't render a gradient — primarily:
   *  - "text as a gradient" via background-clip:text on browsers that lack
   *    support (the text falls back to this solid color).
   *  - Any helper that flattens a ThemeBackground/TextColorValue to a single
   *    color (see `backgroundToSolidColor`).
   * Required so consumers never need a hardcoded default. `normalizeThemeBackground`
   * fills this from the first stop when reading legacy JSON without it.
   */
  fallback: string;
};

// Reference to a saved swatch in the per-account swatch library. Stored in
// place of an inline Solid/Gradient so consumers can edit the swatch once and
// have every linked usage update. On swatch deletion the console-side cascade
// rewrites every ref into an inlined Solid/Gradient before removing the row,
// so this only resolves to "unknown swatch" defensively (e.g. concurrent
// session staleness — handled with a neutral fallback in `backgroundToCSS`).
export type SwatchRef = { type: "swatch-ref"; swatchId: string };

// Image background — references a row in the Media table. We persist the
// resolved `mediaUrl` alongside the FK `mediaId` so SSR can render without a
// join. Layout knobs (size/position/repeat) and an optional dimming overlay
// are applied through CSS variables emitted by `generateThemeCSS`.
export interface ImageBackground {
  type: "image";
  mediaId: string;
  mediaUrl: string;
  size: "cover" | "contain" | "auto";
  position: string; // CSS background-position (e.g. "center", "top left", "50% 30%")
  repeat: "no-repeat" | "repeat" | "repeat-x" | "repeat-y";
  /** CSS background-attachment. `fixed` pins the image to the viewport so it
   *  doesn't scroll with the page (parallax-style). Defaults to `scroll`. */
  attachment?: "scroll" | "fixed";
  /** Optional overlay layered on top of the image. `opacity` is 0–100 (0 = hidden). */
  overlay?: { color: string; opacity: number };
}

// =============================================================================
// ThemeBackground — restructured as a layered "color + optional image overlay"
// shape. The `color` is always present (solid / gradient / swatch-ref) and
// renders underneath; the optional `image` sits on top and lets the color
// shine through any transparency. This replaces the previous tagged-union
// shape where picking an image meant losing the color entirely.
// `normalizeThemeBackground` coerces all four legacy single-variant shapes
// (`solid`, `gradient`, `swatch-ref`, `image`) into this layered form.
// =============================================================================

/** The color layer of a ThemeBackground — always present, used as the base. */
export type ThemeBackgroundColor = Solid | Gradient | SwatchRef;

export interface ThemeBackground {
  /** Required base color/gradient/swatch-ref. Renders underneath the image. */
  color: ThemeBackgroundColor;
  /** Optional image overlay layered on top of the color. */
  image?: ImageBackground;
}

// =============================================================================
// TextColorValue — narrowed value for text-like fields that want to opt into
// gradients via the CSS `background-clip:text` trick. Image backgrounds don't
// make sense for text rendering, so this type excludes `ImageBackground`.
// SwatchRefs are still allowed so a saved swatch can be linked into a text
// field; the resolver below walks through the ref to land on a concrete
// solid/gradient.
// =============================================================================

export type TextColorValue = Solid | Gradient | SwatchRef;

// Minimal shape a swatches array needs to expose for resolution. Matches the
// page-builder's SavedSwatch but kept structural here so this package stays
// free of console-side imports.
export interface ThemeSwatch {
  id: string;
  value: Solid | Gradient;
}

// =============================================================================
// Backdrop filter — mirrors the BackdropFilterEditor's data model so the
// theme JSON persisted in lobby settings stays a plain serializable shape.
// The console app's <BackdropFilterEditor> uses the same shape; this is the
// canonical type so any consumer (lobby renderer, server-side preview, etc.)
// can share it without depending on console code.
// =============================================================================

export type BackdropFilterFn =
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

export type BackdropFilter = BackdropFilterFn[];

// =============================================================================
// Border radius — Figma-style: either a single number (all four corners) or a
// per-corner object. CSS shorthand emitted by `borderRadiusToCSS` follows the
// standard `top-left top-right bottom-right bottom-left` order.
// =============================================================================

export interface RadiusCorners {
  tl: number;
  tr: number;
  br: number;
  bl: number;
}

export type BorderRadius = number | RadiusCorners;

/**
 * Render a `BorderRadius` value as a CSS string. A plain number returns a
 * single `Npx`; the per-corner object returns the four-value shorthand
 * `TLpx TRpx BRpx BLpx`. Undefined / null falls back to `${fallback}px`.
 */
export function borderRadiusToCSS(
  r: BorderRadius | undefined | null,
  fallback = 0
): string {
  if (r === undefined || r === null) return `${fallback}px`;
  if (typeof r === "number") return `${r}px`;
  return `${r.tl}px ${r.tr}px ${r.br}px ${r.bl}px`;
}

/**
 * Coerce a persisted radius value (legacy number, new object, or junk) into a
 * valid `BorderRadius`. Used at theme-JSON read time so old lobbies with
 * `cardBorderRadius: 12` keep working alongside new lobbies that may now
 * persist `{ tl, tr, br, bl }`.
 */
export function normalizeBorderRadius(raw: unknown): BorderRadius {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    if (
      typeof r.tl === "number" &&
      typeof r.tr === "number" &&
      typeof r.br === "number" &&
      typeof r.bl === "number"
    ) {
      return { tl: r.tl, tr: r.tr, br: r.br, bl: r.bl };
    }
  }
  return 0;
}

// =============================================================================
// Border — extended CSS3 model.
// -----------------------------------------------------------------------------
// The legacy flat fields on `ThemeSettings` (cardBorderShow / cardBorderType /
// cardBorderColor / cardBorderGradientFrom|To|Angle / cardBorderOpacity /
// cardBorderWidth) only describe a uniform solid OR linear-gradient border.
// The new types here describe the full CSS border surface: per-side widths
// and styles, border-image (gradient OR uploaded image) with slice/width/
// outset/repeat, an `outline` layer, and a `box-shadow` stack. They're
// additive — the legacy fields stay populated for back-compat consumers,
// and `getCardBorderCSS` reads the new fields first and falls back to the
// legacy ones when they're absent.
// =============================================================================

export type BorderStyle =
  | "none"
  | "hidden"
  | "solid"
  | "dashed"
  | "dotted"
  | "double"
  | "groove"
  | "ridge"
  | "inset"
  | "outset";

/** Per-side widths in CSS length units (e.g. "1px"). All four sides are
 *  always present so consumers can drop them straight into `border-*-width`. */
export interface BorderSideWidths {
  top: string;
  right: string;
  bottom: string;
  left: string;
}

/** Per-side styles. */
export interface BorderSideStyles {
  top: BorderStyle;
  right: BorderStyle;
  bottom: BorderStyle;
  left: BorderStyle;
}

export type BorderImageRepeat = "stretch" | "repeat" | "round" | "space";

export type BorderImageSource =
  | { type: "gradient"; gradient: ThemeGradient }
  | { type: "image"; mediaId: string; mediaUrl: string };

export interface BorderImage {
  source: BorderImageSource;
  /** border-image-slice — a single number applied to all four edges. 0-100.
   *  We don't expose the `fill` keyword (rarely useful for chrome) — it can
   *  be added later as an optional boolean if a use-case appears. */
  slice: number;
  /** border-image-width — CSS length / number / `auto`. */
  width: string;
  /** border-image-outset — CSS length / number. */
  outset: string;
  repeat: BorderImageRepeat;
}

export interface ShadowStop {
  id: string;
  inset: boolean;
  x: number; // px
  y: number; // px
  blur: number; // px
  spread: number; // px
  /** Hex (#RRGGBB or #RRGGBBAA) — alpha carried through `formatHexWithAlpha`. */
  color: string;
}

export type BoxShadow = ShadowStop[];

export interface Outline {
  show: boolean;
  width: string; // CSS length
  style: BorderStyle;
  color: string; // hex with optional alpha
  offset: string; // CSS length
}

/**
 * Render a `BorderImage` value as the value-side of a `border-image` shorthand:
 * `<source> <slice> / <width> / <outset> <repeat>`. Image sources are wrapped
 * in `url(...)` (JSON.stringify-quoted so embedded quotes/parens are safe).
 * Returns `none` for an empty / undefined value.
 */
export function borderImageToCSS(
  image: BorderImage | undefined | null
): string {
  if (!image) return "none";
  let source: string;
  if (image.source.type === "gradient") {
    // Reuse the gradient renderer — `colorPartToCSS` already knows how to
    // emit linear / radial / conic. Wrap as a Gradient value so it takes the
    // gradient branch directly.
    const stops = [...image.source.gradient.stops].sort(
      (a, b) => a.position - b.position
    );
    const parts = stops.map(
      (s) => `${hexToRgba(s.color, (s.opacity ?? 100) / 100)} ${s.position}%`
    );
    const g = image.source.gradient;
    if (g.kind === "linear") {
      source = `linear-gradient(${g.angle}deg, ${parts.join(", ")})`;
    } else if (g.kind === "radial") {
      source = `radial-gradient(${g.shape} at center, ${parts.join(", ")})`;
    } else {
      source = `conic-gradient(from ${g.angle}deg at 50% 50%, ${parts.join(", ")})`;
    }
  } else {
    source = `url(${JSON.stringify(image.source.mediaUrl)})`;
  }
  return `${source} ${image.slice} / ${image.width} / ${image.outset} ${image.repeat}`;
}

/**
 * Render a `BoxShadow` stack as a CSS `box-shadow` value (comma-separated
 * layers). Empty / undefined returns `none`.
 */
export function boxShadowToCSS(shadow: BoxShadow | undefined | null): string {
  if (!shadow || shadow.length === 0) return "none";
  return shadow
    .map((s) => {
      const inset = s.inset ? "inset " : "";
      return `${inset}${s.x}px ${s.y}px ${s.blur}px ${s.spread}px ${s.color}`;
    })
    .join(", ");
}

/**
 * Render an `Outline` value as a CSS object suitable for spreading into a
 * style attribute. `outline-offset` is emitted separately because the
 * `outline` shorthand doesn't include it. Returns `null` when `show` is false.
 */
export function outlineToCSS(
  outline: Outline | undefined | null
):
  | { outline: string; outlineOffset: string }
  | null {
  if (!outline || !outline.show) return null;
  return {
    outline: `${outline.width} ${outline.style} ${outline.color}`,
    outlineOffset: outline.offset,
  };
}

/**
 * Coerce a persisted `BorderSideWidths` shape (legacy uniform CSS-length
 * string, new per-side object, or junk) into either a single string (uniform)
 * or a per-side object. Callers pass the legacy uniform value as the fallback.
 */
export function normalizeBorderSideWidths(
  raw: unknown,
  fallback: string
): string | BorderSideWidths {
  if (typeof raw === "string" && raw.length > 0) return raw;
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    if (
      typeof r.top === "string" &&
      typeof r.right === "string" &&
      typeof r.bottom === "string" &&
      typeof r.left === "string"
    ) {
      // Collapse to a single string when all four match — keeps the persisted
      // JSON minimal for the common uniform case.
      if (r.top === r.right && r.right === r.bottom && r.bottom === r.left) {
        return r.top;
      }
      return { top: r.top, right: r.right, bottom: r.bottom, left: r.left };
    }
  }
  return fallback;
}

/**
 * Render a `BackdropFilter` array as a CSS `backdrop-filter` string. Empty /
 * undefined returns `"none"` so the result can drop straight into a CSS
 * variable without conditionals on the caller side.
 */
export function backdropFilterToCSS(
  filters: BackdropFilter | undefined
): string {
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

export interface ThemeSettings {
  colorMode: ColorMode;
  /** Unified background — solid or linear gradient. */
  background: ThemeBackground;
  /** @deprecated Kept optional so legacy persisted JSON still type-checks; not read on new code paths. */
  bgPrimary?: string;
  /** @deprecated Kept optional so legacy persisted JSON still type-checks; not read on new code paths. */
  bgSecondary?: string;
  /** @deprecated Kept optional so legacy persisted JSON still type-checks; not read on new code paths. */
  bgTertiary?: string;
  textPrimary: string;
  /**
   * Rich text color for the primary text — when set this takes precedence
   * over the legacy `textPrimary` hex string and unlocks gradient text via
   * background-clip:text. The legacy hex field is still written alongside
   * (using the gradient's fallback hex) so older consumers and snapshots
   * keep rendering a sane single color.
   */
  textPrimaryColor?: TextColorValue;
  /** @deprecated Hidden from the Theme UI — only `textPrimary` is user-editable. Still emitted to CSS for legacy consumers. */
  textSecondary: string;
  /** @deprecated Hidden from the Theme UI — only `textPrimary` is user-editable. Still emitted to CSS for legacy consumers. */
  textMuted: string;
  /** @deprecated Hidden from the Theme UI — only `textPrimary` is user-editable. Still emitted to CSS for legacy consumers. */
  border: string;
  /** @deprecated Brand color fields are no longer shown in the Theme UI (replaced by the per-account Swatches library). Kept for legacy CSS consumers. */
  primary: string;
  /** @deprecated See `primary`. */
  primaryHover: string;
  /** @deprecated See `primary`. */
  primaryText: string;
  /** @deprecated See `primary`. */
  secondary: string;
  /** @deprecated See `primary`. */
  secondaryHover: string;
  /** @deprecated See `primary`. */
  secondaryText: string;
  /** @deprecated See `primary`. */
  accent: string;
  visualizerBg: string;
  visualizerBgOpacity: number;
  visualizerBar: string;
  visualizerBarAlt: string;
  visualizerGlow: string;
  visualizerUseCardBg: boolean;
  visualizerBorderShow: boolean;
  visualizerBorderColor: string;
  /** Border radius — number (uniform) or per-corner `{ tl, tr, br, bl }`. */
  visualizerBorderRadius: BorderRadius;
  visualizerBlendMode: string;
  visualizerType: "equalizer" | "waveform";
  // Card settings
  cardHeadingColor: string;
  /** Rich text color for card headings — same pattern as `textPrimaryColor`. */
  cardHeadingColorRich?: TextColorValue;
  cardContentColor: string;
  /** Rich text color for card body content — same pattern as `textPrimaryColor`. */
  cardContentColorRich?: TextColorValue;
  /** @deprecated Hidden from the Theme UI (Card section now exposes only Heading + Content). Kept for legacy consumers. */
  cardMutedColor: string;
  cardBgType: "solid" | "gradient";
  cardBgColor: string;
  cardBgGradientFrom: string;
  cardBgGradientTo: string;
  cardBgGradientAngle: number;
  cardBgOpacity: number;
  /** @deprecated Page-builder UI no longer writes this — the renderer derives
   *  "has border" from `cardBorderWidth > 0`. Field kept on the type for
   *  back-compat with already-saved lobby JSON. */
  cardBorderShow: boolean;
  cardBorderType: "solid" | "gradient";
  cardBorderColor: string;
  cardBorderGradientFrom: string;
  cardBorderGradientTo: string;
  cardBorderGradientAngle: number;
  cardBorderOpacity: number;
  cardBorderWidth: string;
  // ---------------------------------------------------------------------------
  // Extended CSS3 border fields (optional, additive). Legacy consumers keep
  // reading the flat fields above; new consumers prefer these when present.
  // ---------------------------------------------------------------------------
  /** CSS `border-style` — defaults to `"solid"` for legacy themes. */
  cardBorderStyle?: BorderStyle;
  /** Per-side border widths. When set, overrides `cardBorderWidth` (uniform). */
  cardBorderSideWidths?: BorderSideWidths;
  /** Per-side border styles. When set, overrides `cardBorderStyle` (uniform). */
  cardBorderSideStyles?: BorderSideStyles;
  /** @deprecated Page-builder UI no longer writes this — border-image was
   *  removed because it doesn't compose cleanly with border-radius. Field
   *  retained on the type for back-compat with already-saved lobby JSON. */
  cardBorderImage?: BorderImage;
  /** @deprecated Page-builder UI no longer writes this — outline section was
   *  removed. Field retained on the type for back-compat. */
  cardOutline?: Outline;
  /** `box-shadow` stack — multi-layer with inset support. */
  cardBoxShadow?: BoxShadow;
  /** Border radius — number (uniform) or per-corner `{ tl, tr, br, bl }`. */
  cardBorderRadius: BorderRadius;
  /**
   * Optional composed CSS `backdrop-filter` value applied to the card surface.
   * Stored as a structured array of filter functions (see {@link BackdropFilter})
   * rather than a raw CSS string so the page-builder UI can round-trip edits.
   * Undefined / empty array means no filter. The lobby's card renderer
   * consumes this via the `--card-backdrop-filter` CSS variable emitted by
   * `generateThemeCSS`.
   */
  cardBackdropFilter?: BackdropFilter;
  /** Border radius — number (uniform) or per-corner `{ tl, tr, br, bl }`. */
  buttonBorderRadius: BorderRadius;
  /** Border radius — number (uniform) or per-corner `{ tl, tr, br, bl }`. */
  playButtonBorderRadius: BorderRadius;
  // ---------------------------------------------------------------------------
  // Button styling (base + optional state overrides).
  // ---------------------------------------------------------------------------
  // Optional so legacy persisted theme JSON (saved before this section
  // existed) still type-checks. Defaults live in defaultDarkTheme /
  // defaultLightTheme; consumers should read with `?? <default>` if they
  // need a value for an old lobby that never set these.
  /**
   * Button backgrounds are color-only (solid/gradient/swatch-ref) — they
   * never render image overlays. Typed as the inner `ThemeBackgroundColor`
   * so this stays a strict subset of the body `ThemeBackground`'s color
   * layer; the ColorPicker in the page-builder emits exactly this shape.
   */
  buttonBg?: ThemeBackgroundColor;
  buttonText?: string;
  /** Rich text color for button labels — same pattern as `textPrimaryColor`. */
  buttonTextRich?: TextColorValue;
  buttonBorderShow?: boolean;
  buttonBorderColor?: string;
  buttonBorderWidth?: string;
  /** Hover state override — when omitted the CSS layer derives `--btn-hover-bg`
   *  by swapping bg ↔ text (an "invert" hover). */
  buttonHoverBg?: ThemeBackgroundColor;
  buttonHoverText?: string;
  /** Rich hover text — see `buttonTextRich`. */
  buttonHoverTextRich?: TextColorValue;
  /** Pressed state override — when omitted falls back to a slight darken of
   *  the hover state. */
  buttonPressedBg?: ThemeBackgroundColor;
  buttonPressedText?: string;
  /** Rich pressed text — see `buttonTextRich`. */
  buttonPressedTextRich?: TextColorValue;
  /** Active state override — same fallback logic as pressed. */
  buttonActiveBg?: ThemeBackgroundColor;
  buttonActiveText?: string;
  /** Rich active text — see `buttonTextRich`. */
  buttonActiveTextRich?: TextColorValue;
}

export const defaultDarkTheme: ThemeSettings = {
  colorMode: "dark",
  background: { color: { type: "solid", color: "#030712", opacity: 100 } },
  textPrimary: "#ffffff",
  textSecondary: "#9ca3af",
  textMuted: "#6b7280",
  border: "#374151",
  primary: "#ffffff",
  primaryHover: "#e5e7eb",
  primaryText: "#111827",
  secondary: "#1f2937",
  secondaryHover: "#374151",
  secondaryText: "#ffffff",
  accent: "#ffffff",
  visualizerBg: "#111827",
  visualizerBgOpacity: 0,
  visualizerBar: "#ffffff",
  visualizerBarAlt: "#9ca3af",
  visualizerGlow: "#ffffff",
  visualizerUseCardBg: false,
  visualizerBorderShow: false,
  visualizerBorderColor: "#374151",
  visualizerBorderRadius: 8,
  visualizerBlendMode: "normal",
  visualizerType: "equalizer",
  cardHeadingColor: "#ffffff",
  cardContentColor: "#9ca3af",
  cardMutedColor: "#6b7280",
  cardBgType: "solid",
  cardBgColor: "#111827",
  cardBgGradientFrom: "#1f2937",
  cardBgGradientTo: "#111827",
  cardBgGradientAngle: 135,
  cardBgOpacity: 50,
  cardBorderShow: true,
  cardBorderType: "solid",
  cardBorderColor: "#374151",
  cardBorderGradientFrom: "#374151",
  cardBorderGradientTo: "#1f2937",
  cardBorderGradientAngle: 135,
  cardBorderOpacity: 100,
  cardBorderWidth: "1px",
  cardBorderRadius: 12,
  buttonBorderRadius: 24,
  playButtonBorderRadius: 50,
  // Button styles — dark mode: white pill on dark bg.
  buttonBg: { type: "solid", color: "#ffffff", opacity: 100 },
  buttonText: "#000000",
  buttonBorderShow: false,
  buttonBorderColor: "#374151",
  buttonBorderWidth: "1px",
  // Hover/pressed/active intentionally omitted — generateThemeCSS derives
  // sensible defaults (invert on hover, slight darken on pressed/active).
};

export const defaultLightTheme: ThemeSettings = {
  colorMode: "light",
  background: { color: { type: "solid", color: "#ffffff", opacity: 100 } },
  textPrimary: "#111827",
  textSecondary: "#4b5563",
  textMuted: "#9ca3af",
  border: "#d1d5db",
  primary: "#111827",
  primaryHover: "#374151",
  primaryText: "#ffffff",
  secondary: "#e5e7eb",
  secondaryHover: "#d1d5db",
  secondaryText: "#111827",
  accent: "#111827",
  visualizerBg: "#e5e7eb",
  visualizerBgOpacity: 0,
  visualizerBar: "#111827",
  visualizerBarAlt: "#4b5563",
  visualizerGlow: "#111827",
  visualizerUseCardBg: false,
  visualizerBorderShow: false,
  visualizerBorderColor: "#d1d5db",
  visualizerBorderRadius: 8,
  visualizerBlendMode: "normal",
  visualizerType: "equalizer",
  cardHeadingColor: "#111827",
  cardContentColor: "#4b5563",
  cardMutedColor: "#9ca3af",
  cardBgType: "solid",
  cardBgColor: "#f3f4f6",
  cardBgGradientFrom: "#e5e7eb",
  cardBgGradientTo: "#f3f4f6",
  cardBgGradientAngle: 135,
  cardBgOpacity: 50,
  cardBorderShow: true,
  cardBorderType: "solid",
  cardBorderColor: "#d1d5db",
  cardBorderGradientFrom: "#d1d5db",
  cardBorderGradientTo: "#e5e7eb",
  cardBorderGradientAngle: 135,
  cardBorderOpacity: 100,
  cardBorderWidth: "1px",
  cardBorderRadius: 12,
  buttonBorderRadius: 24,
  playButtonBorderRadius: 50,
  // Button styles — light mode: black pill on light bg.
  buttonBg: { type: "solid", color: "#000000", opacity: 100 },
  buttonText: "#ffffff",
  buttonBorderShow: false,
  buttonBorderColor: "#d1d5db",
  buttonBorderWidth: "1px",
};

export const defaultTheme: ThemeSettings = defaultDarkTheme;

export function getDefaultThemeForMode(mode: ColorMode): ThemeSettings {
  return mode === "light" ? defaultLightTheme : defaultDarkTheme;
}

// Internal helper — not exported; used by the gradient + alpha helpers below.
// Accepts 6- and 8-char hex. For 8-char (`#RRGGBBAA` — the encoding used to
// carry alpha through string-typed theme fields and saved swatches with
// opacity), the embedded alpha is multiplied with the supplied `alpha`
// parameter so callers can still apply an extra opacity multiplier on top.
function hexToRgba(hex: string, alpha: number): string {
  const m8 = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (m8) {
    const embedded = parseInt(m8[4], 16) / 255;
    return `rgba(${parseInt(m8[1], 16)}, ${parseInt(m8[2], 16)}, ${parseInt(m8[3], 16)}, ${embedded * alpha})`;
  }
  const m6 = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (m6) {
    return `rgba(${parseInt(m6[1], 16)}, ${parseInt(m6[2], 16)}, ${parseInt(m6[3], 16)}, ${alpha})`;
  }
  return `rgba(0, 0, 0, ${alpha})`;
}

// =============================================================================
// Background helpers
// =============================================================================

// -----------------------------------------------------------------------------
// Sub-normalizers — extracted so the same logic powers both the legacy
// single-variant code path AND the new layered `{ color, image }` shape.
// -----------------------------------------------------------------------------

function normalizeSolid(b: Record<string, unknown>): Solid | null {
  if (typeof b.color !== "string") return null;
  const opacity = typeof b.opacity === "number" ? b.opacity : 100;
  return { type: "solid", color: b.color, opacity };
}

function normalizeGradient(b: Record<string, unknown>): Gradient | null {
  if (!b.gradient || typeof b.gradient !== "object") return null;
  const g = b.gradient as Record<string, unknown>;
  if (!Array.isArray(g.stops)) return null;
  const stops = (g.stops as unknown[])
    .map((s, i) => {
      if (!s || typeof s !== "object") return null;
      const o = s as Record<string, unknown>;
      return {
        id: typeof o.id === "string" ? o.id : `stop-${i}`,
        position: typeof o.position === "number" ? o.position : i * 100,
        color: typeof o.color === "string" ? o.color : "#000000",
        opacity: typeof o.opacity === "number" ? o.opacity : 100,
      } as GradientStop;
    })
    .filter((s): s is GradientStop => s !== null);
  if (stops.length < 2) return null;
  const fallback =
    typeof b.fallback === "string" && b.fallback.length > 0
      ? b.fallback
      : stops[0]?.color ?? "#000000";
  if (g.kind === "radial") {
    const shape: "circle" | "ellipse" =
      g.shape === "circle" ? "circle" : "ellipse";
    return {
      type: "gradient",
      gradient: { kind: "radial", shape, stops },
      fallback,
    };
  }
  if (g.kind === "conic") {
    const angle = typeof g.angle === "number" ? g.angle : 0;
    return {
      type: "gradient",
      gradient: { kind: "conic", angle, stops },
      fallback,
    };
  }
  const angle = typeof g.angle === "number" ? g.angle : 135;
  return {
    type: "gradient",
    gradient: { kind: "linear", angle, stops },
    fallback,
  };
}

function normalizeSwatchRef(b: Record<string, unknown>): SwatchRef | null {
  if (typeof b.swatchId !== "string") return null;
  return { type: "swatch-ref", swatchId: b.swatchId };
}

function normalizeImageBackground(
  b: Record<string, unknown>
): ImageBackground | null {
  if (
    typeof b.mediaId !== "string" ||
    b.mediaId.length === 0 ||
    typeof b.mediaUrl !== "string" ||
    b.mediaUrl.length === 0
  ) {
    return null;
  }
  const size: ImageBackground["size"] =
    b.size === "contain" || b.size === "auto" ? b.size : "cover";
  const position: string =
    typeof b.position === "string" && b.position.length > 0
      ? b.position
      : "center";
  const repeat: ImageBackground["repeat"] =
    b.repeat === "repeat" || b.repeat === "repeat-x" || b.repeat === "repeat-y"
      ? b.repeat
      : "no-repeat";
  const attachment: ImageBackground["attachment"] =
    b.attachment === "fixed" ? "fixed" : "scroll";
  let overlay: ImageBackground["overlay"];
  if (b.overlay && typeof b.overlay === "object") {
    const o = b.overlay as Record<string, unknown>;
    if (typeof o.color === "string" && typeof o.opacity === "number") {
      overlay = { color: o.color, opacity: o.opacity };
    }
  }
  return {
    type: "image",
    mediaId: b.mediaId,
    mediaUrl: b.mediaUrl,
    size,
    position,
    repeat,
    attachment,
    ...(overlay ? { overlay } : {}),
  };
}

function normalizeColorPart(
  b: Record<string, unknown>
): ThemeBackgroundColor | null {
  if (b.type === "solid") return normalizeSolid(b);
  if (b.type === "gradient") return normalizeGradient(b);
  if (b.type === "swatch-ref") return normalizeSwatchRef(b);
  return null;
}

/**
 * Coerce any persisted/incoming theme shape into a normalized layered
 * `ThemeBackground` (`{ color, image? }`).
 *
 * Handles four legacy shapes plus the new one:
 *   1. Legacy single-variant `Solid`        → wrap as `{ color: solid }`.
 *   2. Legacy single-variant `Gradient`     → wrap as `{ color: gradient }`.
 *   3. Legacy single-variant `SwatchRef`    → wrap as `{ color: ref }`.
 *   4. Legacy single-variant `Image`        → pair with a synthesized default
 *      solid black color: `{ color: <black>, image: <the image> }`.
 *   5. New layered shape `{ color, image? }`→ normalize each sub-field.
 *
 * Plus the legacy `bgPrimary` hex (pre-`background` field). Anything
 * unrecognized falls back to a black solid color, no image.
 */
export function normalizeThemeBackground(
  raw: Partial<ThemeSettings> | null | undefined
): ThemeBackground {
  const fallback: ThemeBackground = {
    color: { type: "solid", color: "#030712", opacity: 100 },
  };
  if (!raw || typeof raw !== "object") return fallback;
  const bg = (raw as { background?: unknown }).background;
  if (bg && typeof bg === "object") {
    const b = bg as Record<string, unknown>;

    // ---- Legacy single-variant shapes (have a top-level `type` discriminator).
    if ("type" in b) {
      // Legacy `Image` — synthesize a default solid color underneath so the
      // image now overlays on a neutral base. Black is fine; the user can
      // change the color from the new BackgroundPicker UI.
      if (b.type === "image") {
        const image = normalizeImageBackground(b);
        if (image) {
          return {
            color: { type: "solid", color: "#000000", opacity: 100 },
            image,
          };
        }
        return fallback;
      }
      // Legacy `Solid` / `Gradient` / `SwatchRef` — wrap the value as the
      // color layer of the new shape; no image overlay.
      const colorPart = normalizeColorPart(b);
      if (colorPart) return { color: colorPart };
      return fallback;
    }

    // ---- New layered shape: `{ color: {...}, image?: {...} }`.
    if ("color" in b && b.color && typeof b.color === "object") {
      const colorPart = normalizeColorPart(b.color as Record<string, unknown>);
      if (!colorPart) return fallback;
      let image: ImageBackground | undefined;
      if (b.image && typeof b.image === "object") {
        const normalized = normalizeImageBackground(
          b.image as Record<string, unknown>
        );
        if (normalized) image = normalized;
      }
      return image ? { color: colorPart, image } : { color: colorPart };
    }
  }
  // Legacy path — old themes only had bgPrimary/bgSecondary/bgTertiary hex
  // strings. Synthesize a solid background from bgPrimary.
  const bgPrimary = (raw as { bgPrimary?: unknown }).bgPrimary;
  if (typeof bgPrimary === "string" && bgPrimary.length > 0) {
    return {
      color: { type: "solid", color: bgPrimary, opacity: 100 },
    };
  }
  return fallback;
}

// Neutral fallback used when a swatch-ref can't be resolved (e.g. swatches
// list omitted, or a dangling ref slipped through despite the delete cascade).
// Picked to read as "obviously a placeholder" rather than transparent.
const SWATCH_REF_FALLBACK = "#888888";

// Resolve a SwatchRef against the supplied swatches list. Returns null when
// the swatch isn't present so callers can apply their own fallback.
//
// Optional `drafts` map carries session-local, in-progress edits (the
// page-builder's "Swatches" editor populates it on every input change so the
// canvas previews unsaved color changes live). When a draft is present for the
// swatch id it takes precedence over the persisted swatch value. Drafts are
// never persisted — the console-side SwatchProvider clears them on save /
// cancel / popover close.
//
// A draft may itself be a SwatchRef (e.g. the user is mid-edit and the picker
// linked the swatch to another saved swatch). To avoid runaway recursion or
// accidental cycles we cap recursion to one hop: when the draft is a ref we
// resolve through the persisted swatches list on the second hop WITHOUT
// passing drafts again. A swatch's value at rest is always Solid|Gradient, so
// one extra lookup is sufficient.
export function resolveThemeSwatchRef(
  ref: SwatchRef,
  swatches: ThemeSwatch[] | undefined,
  drafts?: Map<string, Solid | Gradient | SwatchRef>
): Solid | Gradient | null {
  if (drafts) {
    const draft = drafts.get(ref.swatchId);
    if (draft) {
      if (draft.type === "swatch-ref") {
        // Second hop — no drafts so we can't cycle.
        return resolveThemeSwatchRef(draft, swatches);
      }
      return draft;
    }
  }
  if (!swatches) return null;
  const found = swatches.find((s) => s.id === ref.swatchId);
  return found ? found.value : null;
}

/**
 * Render the color layer of a `ThemeBackground` (solid / gradient / swatch-ref)
 * as a CSS string. Used standalone by button bg fields, which never carry an
 * image overlay, and as the "bottom layer" inside `backgroundToCSS`.
 *
 * `drafts` carries session-local, in-progress swatch edits — see
 * `resolveThemeSwatchRef` for the recursion-cap rule.
 */
export function colorPartToCSS(
  color: ThemeBackgroundColor,
  swatches?: ThemeSwatch[],
  drafts?: Map<string, Solid | Gradient | SwatchRef>
): string {
  if (color.type === "swatch-ref") {
    const resolved = resolveThemeSwatchRef(color, swatches, drafts);
    if (!resolved) return SWATCH_REF_FALLBACK;
    return colorPartToCSS(resolved, swatches, drafts);
  }
  if (color.type === "gradient") {
    const g = color.gradient;
    const sorted = [...g.stops].sort((a, b) => a.position - b.position);
    const parts = sorted.map(
      (s) => `${hexToRgba(s.color, (s.opacity ?? 100) / 100)} ${s.position}%`
    );
    if (g.kind === "linear") {
      return `linear-gradient(${g.angle}deg, ${parts.join(", ")})`;
    }
    if (g.kind === "radial") {
      return `radial-gradient(${g.shape} at center, ${parts.join(", ")})`;
    }
    return `conic-gradient(from ${g.angle}deg at 50% 50%, ${parts.join(", ")})`;
  }
  // solid
  const opacity = color.opacity ?? 100;
  if (opacity >= 100) return color.color;
  return hexToRgba(color.color, opacity / 100);
}

/**
 * Render a layered `ThemeBackground` (`{ color, image? }`) as a CSS string
 * suitable for the `background:` shorthand. Always emits the color layer;
 * when `bg.image` is set the image (and optional dimming overlay) are
 * stacked on top via comma-separated layers.
 *
 * CSS rule recap: in `background: a, b, c`, layer `a` is painted on top and
 * `c` on the bottom. The trailing layer here is the color, which acts as the
 * background-color and shows through any transparency / loading state in
 * the image. Layer order: overlay (top) > image > color (bottom).
 *
 * `drafts` carries session-local, in-progress swatch edits — see
 * `resolveThemeSwatchRef` for the recursion-cap rule.
 */
export function backgroundToCSS(
  bg: ThemeBackground,
  swatches?: ThemeSwatch[],
  drafts?: Map<string, Solid | Gradient | SwatchRef>
): string {
  const colorCSS = colorPartToCSS(bg.color, swatches, drafts);
  if (!bg.image) return colorCSS;
  // JSON.stringify safe-quotes the URL so embedded quotes/parens can't break
  // out of the `url(...)` token.
  const imgUrl = `url(${JSON.stringify(bg.image.mediaUrl)})`;
  const overlay = bg.image.overlay && bg.image.overlay.opacity > 0
    ? (() => {
        const rgba = hexToRgba(
          bg.image.overlay.color,
          bg.image.overlay.opacity / 100
        );
        return `linear-gradient(${rgba}, ${rgba})`;
      })()
    : null;
  const layers = [overlay, imgUrl].filter(Boolean).join(", ");
  return `${layers}, ${colorCSS}`;
}

/**
 * For places that still need a single representative solid color (e.g. card
 * background fallback). Operates on the color layer only — the image overlay
 * is ignored. For gradients, uses the user-chosen `fallback` hex; for
 * swatch-refs, resolves through the swatches list (and drafts).
 */
export function backgroundToSolidColor(
  bg: ThemeBackground,
  swatches?: ThemeSwatch[],
  drafts?: Map<string, Solid | Gradient | SwatchRef>
): string {
  return colorPartToSolidColor(bg.color, swatches, drafts);
}

/**
 * Same as `backgroundToSolidColor` but operates on a bare color part. Used by
 * button bg fields (which are typed `ThemeBackgroundColor`, no image overlay)
 * and the layered helper above.
 */
export function colorPartToSolidColor(
  color: ThemeBackgroundColor,
  swatches?: ThemeSwatch[],
  drafts?: Map<string, Solid | Gradient | SwatchRef>
): string {
  if (color.type === "swatch-ref") {
    const resolved = resolveThemeSwatchRef(color, swatches, drafts);
    if (!resolved) return SWATCH_REF_FALLBACK;
    return colorPartToSolidColor(resolved, swatches, drafts);
  }
  if (color.type === "solid") return color.color;
  return color.fallback;
}

// =============================================================================
// Text color resolvers
// -----------------------------------------------------------------------------
// `TextColorValue` is a Solid | Gradient | SwatchRef. The two helpers below
// flatten it into the CSS declarations a consumer needs to render the text:
//
//   - solid  → just a `color` declaration.
//   - gradient → a transparent foreground + a background-image + clip:text,
//                so the gradient shows through the glyphs.
//
// Both resolve swatch-refs first so a saved gradient swatch linked into a
// text field renders as a gradient text.
// =============================================================================

interface TextCSSDeclarations {
  /** The `color` declaration value. `"transparent"` for gradients. */
  color: string;
  /** The `background-image` declaration value, when applying a gradient. */
  backgroundImage?: string;
  /** Always `"text"` when `backgroundImage` is set; consumers should also
   *  apply `-webkit-background-clip: text` for Safari compatibility. */
  backgroundClip?: "text";
}

/**
 * Resolve a `TextColorValue` (or anything that walks through `SwatchRef`)
 * into a flat object of CSS declarations a consumer can spread onto a style
 * attribute or write into CSS variables. Returns `color` only for solids;
 * adds `backgroundImage` + `backgroundClip` for gradients.
 */
export function textColorToCSSDeclarations(
  value: TextColorValue | undefined,
  swatches?: ThemeSwatch[],
  drafts?: Map<string, Solid | Gradient | SwatchRef>
): TextCSSDeclarations {
  if (!value) return { color: "inherit" };
  if (value.type === "swatch-ref") {
    const resolved = resolveThemeSwatchRef(value, swatches, drafts);
    if (!resolved) return { color: SWATCH_REF_FALLBACK };
    return textColorToCSSDeclarations(resolved, swatches, drafts);
  }
  if (value.type === "solid") {
    const opacity = value.opacity ?? 100;
    return {
      color: opacity >= 100 ? value.color : hexToRgba(value.color, opacity / 100),
    };
  }
  // Gradient — render via background-clip:text. The text itself goes
  // transparent so the background gradient shows through the glyph shapes.
  const g = value.gradient;
  const sorted = [...g.stops].sort((a, b) => a.position - b.position);
  const parts = sorted.map(
    (s) => `${hexToRgba(s.color, (s.opacity ?? 100) / 100)} ${s.position}%`
  );
  let backgroundImage: string;
  if (g.kind === "linear") {
    backgroundImage = `linear-gradient(${g.angle}deg, ${parts.join(", ")})`;
  } else if (g.kind === "radial") {
    backgroundImage = `radial-gradient(${g.shape} at center, ${parts.join(", ")})`;
  } else {
    backgroundImage = `conic-gradient(from ${g.angle}deg at 50% 50%, ${parts.join(", ")})`;
  }
  return {
    color: "transparent",
    backgroundImage,
    backgroundClip: "text",
  };
}

/**
 * Flatten a `TextColorValue` down to a single hex for hex-only consumers
 * (e.g. the legacy string text fields, or a snapshot that only stores one
 * hex per text role). Resolves swatch-refs; uses the gradient's `fallback`
 * for gradient values. When `value` is undefined returns the supplied
 * fallback so callers can pass the existing legacy hex.
 */
export function textColorFallbackHex(
  value: TextColorValue | undefined,
  fallback: string,
  swatches?: ThemeSwatch[],
  drafts?: Map<string, Solid | Gradient | SwatchRef>
): string {
  if (!value) return fallback;
  if (value.type === "swatch-ref") {
    const resolved = resolveThemeSwatchRef(value, swatches, drafts);
    if (!resolved) return SWATCH_REF_FALLBACK;
    return textColorFallbackHex(resolved, fallback, swatches, drafts);
  }
  if (value.type === "solid") return value.color;
  return value.fallback;
}

export function normalizeCSSValue(
  value: string | number | undefined,
  fallback: string
): string {
  if (value === undefined || value === null || value === "") return fallback;
  const str = String(value).trim();
  if (!str) return fallback;
  if (/^[\d.]+$/.test(str)) return `${str}px`;
  return str;
}

export function getCardBgCSS(
  theme: ThemeSettings,
  swatches?: ThemeSwatch[],
  drafts?: Map<string, Solid | Gradient | SwatchRef>
): string {
  if (theme.cardBgType === "gradient") {
    const opacity = (theme.cardBgOpacity ?? 50) / 100;
    const from = hexToRgba(theme.cardBgGradientFrom, opacity);
    const to = hexToRgba(theme.cardBgGradientTo, opacity);
    return `linear-gradient(${theme.cardBgGradientAngle ?? 135}deg, ${from}, ${to})`;
  }
  // Legacy themes may still rely on bgSecondary as the card-bg fallback —
  // honour that, but also fall back to the unified background's representative
  // solid color when bgSecondary is no longer present.
  const fallback =
    theme.bgSecondary ??
    backgroundToSolidColor(theme.background, swatches, drafts);
  const hex = theme.cardBgColor || fallback;
  // When the card bg hex carries explicit alpha (8-char `#RRGGBBAA` — used to
  // pass swatch opacity through the string-typed field), it is the authority.
  // The legacy `cardBgOpacity` multiplier (no longer exposed in the UI) is
  // skipped so a 50%-alpha swatch renders as a 50%-alpha card, not 25%.
  const has8Char = /^#?[a-f\d]{8}$/i.test(hex);
  const opacity = has8Char ? 1 : (theme.cardBgOpacity ?? 50) / 100;
  return hexToRgba(hex, opacity);
}

// =============================================================================
// getCardBorderCSS
// -----------------------------------------------------------------------------
// Resolves the effective card border into a small CSS bag the canvas can
// spread onto a wrapper element. Reads the extended CSS3 fields first
// (cardBorderImage / cardBorderSideWidths / cardBorderSideStyles / cardOutline /
// cardBoxShadow) and falls back to the legacy flat fields when they're absent.
//
// Returned shape:
//   - `style`        — fallback shorthand value for `border:` (single string).
//                      Used when none of the per-side / image overrides apply.
//   - `borderImage`  — value for `border-image:` when an image / gradient
//                      border is active. The caller is responsible for setting
//                      `border: <width> solid transparent` alongside.
//   - `widths`       — per-side widths when the user has diverged from uniform.
//                      Caller spreads `borderTopWidth` / etc. directly.
//   - `styles`       — per-side styles when the user has diverged from uniform.
//   - `outline` /
//     `outlineOffset` — when `cardOutline.show` is true.
//   - `boxShadow`    — composed `box-shadow` value (or `none` when empty).
// =============================================================================
export interface CardBorderCSS {
  style: string;
  borderImage?: string;
  borderImageSlice?: number;
  borderImageWidth?: string;
  borderImageOutset?: string;
  borderImageRepeat?: BorderImageRepeat;
  widths?: BorderSideWidths;
  styles?: BorderSideStyles;
  outline?: string;
  outlineOffset?: string;
  boxShadow?: string;
}

// Internal — parse the leading numeric out of a CSS length so the renderer
// can gate "draw a border" on a positive width. Returns 0 for missing /
// non-numeric input (which is the correct "off" answer).
function cssLengthToNumber(value: string | undefined): number {
  if (!value) return 0;
  const match = String(value).trim().match(/^-?[\d.]+/);
  if (!match) return 0;
  const n = parseFloat(match[0]);
  return Number.isFinite(n) ? n : 0;
}

export function getCardBorderCSS(theme: ThemeSettings): CardBorderCSS {
  // Outline + box-shadow are independent of the border on/off state — a card
  // can be borderless yet still cast a shadow or have an outline. Resolve
  // them up front so we can attach them regardless of the border branch
  // below. (cardOutline reads stay for back-compat with already-saved themes;
  // the page-builder UI no longer writes it.)
  const outlineDecls = outlineToCSS(theme.cardOutline);
  const boxShadow = theme.cardBoxShadow && theme.cardBoxShadow.length > 0
    ? boxShadowToCSS(theme.cardBoxShadow)
    : undefined;
  const decorations: Pick<
    CardBorderCSS,
    "outline" | "outlineOffset" | "boxShadow"
  > = {
    ...(outlineDecls
      ? { outline: outlineDecls.outline, outlineOffset: outlineDecls.outlineOffset }
      : {}),
    ...(boxShadow ? { boxShadow } : {}),
  };

  // Width-based border gating — replaces the deprecated `cardBorderShow`
  // toggle. The border paints when any effective width is > 0; otherwise we
  // short-circuit to "none". Existing lobby JSON with `cardBorderShow: false`
  // and a non-zero width will now paint — that's intentional (the user
  // explicitly chose to retire the toggle).
  const sides = theme.cardBorderSideWidths;
  const anyPositiveSide = sides
    ? cssLengthToNumber(sides.top) > 0 ||
      cssLengthToNumber(sides.right) > 0 ||
      cssLengthToNumber(sides.bottom) > 0 ||
      cssLengthToNumber(sides.left) > 0
    : false;
  const positiveUniform = cssLengthToNumber(theme.cardBorderWidth) > 0;
  if (!anyPositiveSide && !positiveUniform) {
    return { style: "none", ...decorations };
  }

  const opacity = (theme.cardBorderOpacity ?? 100) / 100;
  const uniformWidth = normalizeCSSValue(theme.cardBorderWidth, "1px");
  const uniformStyle: BorderStyle = theme.cardBorderStyle ?? "solid";

  // Per-side overrides — only emitted when at least one side diverges from
  // uniform, so the canvas can keep using the simple `border:` shorthand in
  // the common case.
  const widthsDiverge =
    !!theme.cardBorderSideWidths &&
    (theme.cardBorderSideWidths.top !== uniformWidth ||
      theme.cardBorderSideWidths.right !== uniformWidth ||
      theme.cardBorderSideWidths.bottom !== uniformWidth ||
      theme.cardBorderSideWidths.left !== uniformWidth);
  const stylesDiverge =
    !!theme.cardBorderSideStyles &&
    (theme.cardBorderSideStyles.top !== uniformStyle ||
      theme.cardBorderSideStyles.right !== uniformStyle ||
      theme.cardBorderSideStyles.bottom !== uniformStyle ||
      theme.cardBorderSideStyles.left !== uniformStyle);

  const perSide: Pick<CardBorderCSS, "widths" | "styles"> = {
    ...(widthsDiverge ? { widths: theme.cardBorderSideWidths } : {}),
    ...(stylesDiverge ? { styles: theme.cardBorderSideStyles } : {}),
  };

  // --- Border-image branch (new). Takes precedence over the legacy solid /
  //     gradient color path so the user can pick an image OR a gradient any
  //     of three kinds (linear/radial/conic) AND configure slice/width/
  //     outset/repeat. The canvas pairs this with `border-style: solid` and a
  //     transparent border color so the image actually paints.
  if (theme.cardBorderImage) {
    const img = theme.cardBorderImage;
    return {
      style: `${uniformWidth} solid transparent`,
      borderImage: borderImageToCSS(img),
      borderImageSlice: img.slice,
      borderImageWidth: img.width,
      borderImageOutset: img.outset,
      borderImageRepeat: img.repeat,
      ...perSide,
      ...decorations,
    };
  }

  // --- Legacy gradient path — preserved for back-compat. The new
  //     cardBorderImage field is the recommended way to express a gradient
  //     border; this branch fires when only the legacy flat fields are set.
  if (theme.cardBorderType === "gradient") {
    const from = hexToRgba(theme.cardBorderGradientFrom, opacity);
    const to = hexToRgba(theme.cardBorderGradientTo, opacity);
    return {
      style: `${uniformWidth} solid transparent`,
      borderImage: `linear-gradient(${theme.cardBorderGradientAngle ?? 135}deg, ${from}, ${to}) 1`,
      ...perSide,
      ...decorations,
    };
  }

  // --- Uniform solid path. Honours the new `cardBorderStyle` when set,
  //     defaulting to "solid".
  return {
    style: `${uniformWidth} ${uniformStyle} ${hexToRgba(theme.cardBorderColor || theme.border, opacity)}`,
    ...perSide,
    ...decorations,
  };
}

// =============================================================================
// Color math helpers — used by the button-state CSS fallback logic to derive
// a slightly-darker variant of a hex color for the pressed/active default.
// =============================================================================

function clamp255(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function parseHexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => clamp255(n).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

/**
 * Darken a hex color by `amount` (0–1). For non-hex inputs returns the input
 * unchanged so we don't accidentally garble gradients or named colors.
 */
function darkenHex(hex: string, amount: number): string {
  const rgb = parseHexToRgb(hex);
  if (!rgb) return hex;
  const factor = 1 - amount;
  return rgbToHex(rgb.r * factor, rgb.g * factor, rgb.b * factor);
}

/**
 * Darken a `ThemeBackgroundColor` (solid / gradient / swatch-ref) by `amount`.
 * Used to derive the pressed/active button state CSS when the user hasn't
 * supplied an explicit override.
 *
 * - solid → darkens the color hex.
 * - gradient → darkens every stop AND the user-chosen `fallback` hex.
 * - swatch-ref → resolves through `swatches` + `drafts` first (falling back
 *   to a neutral solid when unresolved).
 *
 * Returns a new value; the input is never mutated.
 */
function darkenBackgroundColor(
  color: ThemeBackgroundColor,
  amount: number,
  swatches?: ThemeSwatch[],
  drafts?: Map<string, Solid | Gradient | SwatchRef>
): ThemeBackgroundColor {
  if (color.type === "swatch-ref") {
    const resolved = resolveThemeSwatchRef(color, swatches, drafts);
    if (!resolved) {
      return { type: "solid", color: darkenHex(SWATCH_REF_FALLBACK, amount), opacity: 100 };
    }
    return darkenBackgroundColor(resolved, amount, swatches, drafts);
  }
  if (color.type === "solid") {
    return { ...color, color: darkenHex(color.color, amount) };
  }
  const g = color.gradient;
  const stops = g.stops.map((s) => ({ ...s, color: darkenHex(s.color, amount) }));
  // Preserve the user-chosen fallback through darkening — it's a property of
  // the value, not of the gradient shape. We darken it too so the derived
  // pressed/active state stays internally consistent.
  const fallback = darkenHex(color.fallback, amount);
  if (g.kind === "linear") {
    return { type: "gradient", gradient: { kind: "linear", angle: g.angle, stops }, fallback };
  }
  if (g.kind === "radial") {
    return { type: "gradient", gradient: { kind: "radial", shape: g.shape, stops }, fallback };
  }
  return { type: "gradient", gradient: { kind: "conic", angle: g.angle, stops }, fallback };
}

export function generateThemeCSS(
  theme: ThemeSettings,
  swatches?: ThemeSwatch[],
  drafts?: Map<string, Solid | Gradient | SwatchRef>
): string {
  const colorScheme = theme.colorMode === "light" ? "light" : "dark";
  // Normalize defensively — `theme.background` should already be the layered
  // shape, but legacy persisted JSON may still be in a single-variant form
  // when read straight from settings without going through the normalizer.
  const bg: ThemeBackground = normalizeThemeBackground(theme);
  const bgCSS = backgroundToCSS(bg, swatches, drafts);

  // Auxiliary image-bg vars. Always emitted (with sensible defaults for the
  // non-image case) so consumer CSS doesn't have to special-case on type.
  // The layered shape exposes `bg.image` directly — no swatch-ref walk
  // required (swatches are color-only).
  const imageBg = bg.image ?? null;
  const bgSize = imageBg?.size ?? "auto";
  const bgPosition = imageBg?.position ?? "center";
  const bgRepeat = imageBg?.repeat ?? "no-repeat";
  const bgAttachment = imageBg?.attachment ?? "scroll";

  // Backdrop filter — emit as both --card-backdrop-filter (unprefixed
  // standard) and via a duplicated declaration in the lobby's CSS layer.
  // Browsers that don't support backdrop-filter (older Firefox) ignore the
  // declaration entirely. Safari still uses the -webkit- prefix so the
  // consuming `.card` rule will set both `-webkit-backdrop-filter` and
  // `backdrop-filter` to `var(--card-backdrop-filter)`.
  const cardBackdropFilterCSS = backdropFilterToCSS(theme.cardBackdropFilter);

  // -------------------------------------------------------------------------
  // Button base + derived state CSS.
  // -------------------------------------------------------------------------
  // The user only configures buttonBg / buttonText (+ optional border + state
  // overrides). When a state override is undefined we derive a sensible
  // default at emit time so the lobby's CSS can always reference the full
  // --btn-{state}-{bg|text} variable set.
  //
  //  hover defaults  → bg becomes the original text color (solid), text
  //                    becomes the original bg's representative solid color.
  //                    This produces the "invert" hover the user wants by
  //                    default.
  //  pressed/active  → 10% darker variant of the hover state.
  const btnBg: ThemeBackgroundColor =
    theme.buttonBg ?? { type: "solid", color: "#ffffff", opacity: 100 };
  const btnText = theme.buttonText ?? "#000000";
  const btnBorderShow = theme.buttonBorderShow ?? false;
  const btnBorderColor = theme.buttonBorderColor ?? theme.border;
  const btnBorderWidth = theme.buttonBorderWidth ?? "1px";

  // Hover default → swap bg and text. Bg side becomes a solid built from the
  // text hex; text side becomes the representative solid color of the base
  // bg. Both can still be overridden by the user via the Advanced (states)
  // panel.
  const hoverBg: ThemeBackgroundColor = theme.buttonHoverBg ?? {
    type: "solid",
    color: btnText,
    opacity: 100,
  };
  const hoverText =
    theme.buttonHoverText ?? colorPartToSolidColor(btnBg, swatches, drafts);

  // Pressed/active default → darken hover by ~10%.
  const pressedBg: ThemeBackgroundColor =
    theme.buttonPressedBg ??
    darkenBackgroundColor(hoverBg, 0.1, swatches, drafts);
  const pressedText = theme.buttonPressedText ?? darkenHex(hoverText, 0.1);
  const activeBg: ThemeBackgroundColor =
    theme.buttonActiveBg ??
    darkenBackgroundColor(hoverBg, 0.1, swatches, drafts);
  const activeText = theme.buttonActiveText ?? darkenHex(hoverText, 0.1);

  // Rich text fields → emit BOTH the color var and a sibling background-image
  // var. Consumers apply the gradient via:
  //   color: var(--name);
  //   background-image: var(--name-image, none);
  //   background-clip: text; -webkit-background-clip: text;
  // When the rich field is absent the color var stays the legacy hex and the
  // image var resolves to `none`, so the background-clip:text trick is a no-op.
  //
  // `legacy` is the legacy string field's value — used when the rich field is
  // unset, AND it's what we want consumers to fall back to when they can't
  // render a gradient (via `textColorFallbackHex`).
  function richTextCSS(
    rich: TextColorValue | undefined,
    legacy: string
  ): { color: string; image: string } {
    if (!rich) return { color: legacy, image: "none" };
    const decls = textColorToCSSDeclarations(rich, swatches, drafts);
    return {
      color: decls.color,
      image: decls.backgroundImage ?? "none",
    };
  }

  const textPrimaryCSS = richTextCSS(theme.textPrimaryColor, theme.textPrimary);
  const cardHeadingCSS = richTextCSS(
    theme.cardHeadingColorRich,
    theme.cardHeadingColor
  );
  const cardContentCSS = richTextCSS(
    theme.cardContentColorRich,
    theme.cardContentColor
  );
  const btnTextCSS = richTextCSS(theme.buttonTextRich, btnText);
  const btnHoverTextCSS = richTextCSS(theme.buttonHoverTextRich, hoverText);
  const btnPressedTextCSS = richTextCSS(theme.buttonPressedTextRich, pressedText);
  const btnActiveTextCSS = richTextCSS(theme.buttonActiveTextRich, activeText);

  // Emit a single --color-bg variable from the unified background. We also
  // alias the legacy --color-bg-primary / -secondary / -tertiary vars to
  // var(--color-bg) so existing lobby CSS (apps/lobby/app/app.css uses
  // --color-bg-primary on body) keeps resolving without a wider refactor.
  return [
    `color-scheme: ${colorScheme}`,
    `--color-mode: ${theme.colorMode}`,
    `--color-bg: ${bgCSS}`,
    `--color-bg-primary: var(--color-bg)`,
    `--color-bg-secondary: var(--color-bg)`,
    `--color-bg-tertiary: var(--color-bg)`,
    // Image-bg layout vars (defaults to auto/center/no-repeat for non-image
    // backgrounds so consumer rules can read them unconditionally alongside
    // `background: var(--color-bg)`).
    `--bg-size: ${bgSize}`,
    `--bg-position: ${bgPosition}`,
    `--bg-repeat: ${bgRepeat}`,
    `--bg-attachment: ${bgAttachment}`,
    // Text colors — rich-aware. The `*-image` var pairs with the color var
    // and is `none` when the field is solid/unset.
    `--color-text-primary: ${textPrimaryCSS.color}`,
    `--color-text-primary-image: ${textPrimaryCSS.image}`,
    `--color-text-secondary: ${theme.textSecondary}`,
    `--color-text-muted: ${theme.textMuted}`,
    `--color-border: ${theme.border}`,
    `--color-border-light: ${theme.border}`,
    `--color-primary: ${theme.primary}`,
    `--color-primary-hover: ${theme.primaryHover}`,
    `--color-primary-active: ${theme.primaryHover}`,
    `--color-primary-text: ${theme.primaryText}`,
    `--color-secondary: ${theme.secondary}`,
    `--color-secondary-hover: ${theme.secondaryHover}`,
    `--color-secondary-active: ${theme.secondaryHover}`,
    `--color-secondary-text: ${theme.secondaryText}`,
    `--color-accent: ${theme.accent}`,
    `--color-accent-muted: ${theme.accent}33`,
    `--color-visualizer-bar: ${theme.visualizerBar}`,
    `--color-visualizer-bar-alt: ${theme.visualizerBarAlt}`,
    `--color-visualizer-glow: ${theme.visualizerGlow}`,
    // Card backdrop-filter — composed CSS string (or `none` when empty).
    // Consumers should apply this CSS variable to BOTH `backdrop-filter` and
    // `-webkit-backdrop-filter` (Safari still uses the prefixed form). We
    // also expose a -webkit-aliased var so themed style attributes can wire
    // up both properties from a single source.
    `--card-backdrop-filter: ${cardBackdropFilterCSS}`,
    `--card-backdrop-filter-webkit: ${cardBackdropFilterCSS}`,
    // Card text — rich-aware mirrors of the legacy cardHeadingColor /
    // cardContentColor strings.
    `--card-heading-color: ${cardHeadingCSS.color}`,
    `--card-heading-color-image: ${cardHeadingCSS.image}`,
    `--card-content-color: ${cardContentCSS.color}`,
    `--card-content-color-image: ${cardContentCSS.image}`,
    // Button base — button bgs are color-only (no image overlay).
    `--btn-bg: ${colorPartToCSS(btnBg, swatches, drafts)}`,
    `--btn-text: ${btnTextCSS.color}`,
    `--btn-text-image: ${btnTextCSS.image}`,
    `--btn-border-color: ${btnBorderColor}`,
    `--btn-border-width: ${btnBorderWidth}`,
    `--btn-border-show: ${btnBorderShow ? 1 : 0}`,
    // Button states (derived when not overridden — see fallback logic above).
    `--btn-hover-bg: ${colorPartToCSS(hoverBg, swatches, drafts)}`,
    `--btn-hover-text: ${btnHoverTextCSS.color}`,
    `--btn-hover-text-image: ${btnHoverTextCSS.image}`,
    `--btn-pressed-bg: ${colorPartToCSS(pressedBg, swatches, drafts)}`,
    `--btn-pressed-text: ${btnPressedTextCSS.color}`,
    `--btn-pressed-text-image: ${btnPressedTextCSS.image}`,
    `--btn-active-bg: ${colorPartToCSS(activeBg, swatches, drafts)}`,
    `--btn-active-text: ${btnActiveTextCSS.color}`,
    `--btn-active-text-image: ${btnActiveTextCSS.image}`,
    // Border radius — emitted as full CSS strings (e.g. `12px` or
    // `8px 8px 0px 0px`) so consumers can drop them into `border-radius`
    // declarations unconditionally regardless of uniform vs per-corner mode.
    `--card-border-radius: ${borderRadiusToCSS(theme.cardBorderRadius, 12)}`,
    `--btn-border-radius: ${borderRadiusToCSS(theme.buttonBorderRadius, 24)}`,
    `--play-button-border-radius: ${borderRadiusToCSS(theme.playButtonBorderRadius, 50)}`,
    `--visualizer-border-radius: ${borderRadiusToCSS(theme.visualizerBorderRadius, 8)}`,
  ].join("; ");
}
