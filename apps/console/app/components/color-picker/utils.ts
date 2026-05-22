import type {
  ColorValue,
  GradientStop,
  GradientValue,
  SavedSwatch,
  SolidValue,
  SwatchRefValue,
} from "./types";

// =============================================================================
// ColorPicker utilities — small pure helpers used by the popover sub-components
// and the trigger swatch button. Kept framework-free.
// =============================================================================

export function hexToRgba(hex: string, alpha: number): string {
  const cleaned = hex.replace(/^#/, "");
  if (cleaned.length !== 6) return `rgba(0,0,0,${alpha})`;
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Normalize a free-form hex input ("fff", "#FFFFFF", "ffffff") to "#rrggbb".
// Returns null when the value is unparseable so callers can keep their
// previous valid value. Accepts 3-, 6- and 8-character hex (the 8-char form
// is `#RRGGBBAA` for color-with-alpha — CSS-native, lets the underlying
// string-typed theme fields carry an opacity channel).
export function normalizeHex(input: string): string | null {
  const cleaned = input.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{3}$/.test(cleaned)) {
    return `#${cleaned[0]}${cleaned[0]}${cleaned[1]}${cleaned[1]}${cleaned[2]}${cleaned[2]}`;
  }
  if (/^[0-9a-f]{6}$/.test(cleaned)) return `#${cleaned}`;
  if (/^[0-9a-f]{8}$/.test(cleaned)) return `#${cleaned}`;
  return null;
}

// Parse a hex string into its color + opacity components.
// "#aabbcc"   → { color: "#aabbcc", opacity: 100 }
// "#aabbcc80" → { color: "#aabbcc", opacity: 50 }   (0x80 / 0xff ≈ 0.502)
// "#abc"      → { color: "#aabbcc", opacity: 100 }
// Anything else → null.
export function parseHexWithAlpha(
  input: string
): { color: string; opacity: number } | null {
  const cleaned = input.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{3}$/.test(cleaned)) {
    return {
      color: `#${cleaned[0]}${cleaned[0]}${cleaned[1]}${cleaned[1]}${cleaned[2]}${cleaned[2]}`,
      opacity: 100,
    };
  }
  if (/^[0-9a-f]{6}$/.test(cleaned)) {
    return { color: `#${cleaned}`, opacity: 100 };
  }
  if (/^[0-9a-f]{8}$/.test(cleaned)) {
    const alpha = parseInt(cleaned.slice(6, 8), 16);
    const opacity = Math.round((alpha / 255) * 100);
    return { color: `#${cleaned.slice(0, 6)}`, opacity };
  }
  return null;
}

// Encode a color + opacity pair as a hex string. Opacity 100 yields the plain
// 6-char form so legacy consumers and Figma-style displays stay unchanged.
// Anything below 100 emits the 8-char `#RRGGBBAA` form so the alpha survives
// the round trip through the string-typed theme fields.
export function formatHexWithAlpha(color: string, opacity: number): string {
  const base = color.replace(/^#/, "").toLowerCase();
  if (!/^[0-9a-f]{6}$/.test(base) && !/^[0-9a-f]{3}$/.test(base)) {
    return `#${base}`;
  }
  // Expand 3-char to 6-char so we can append a stable 2-char alpha when needed.
  const six =
    base.length === 3
      ? `${base[0]}${base[0]}${base[1]}${base[1]}${base[2]}${base[2]}`
      : base;
  const clamped = Math.max(0, Math.min(100, Math.round(opacity)));
  if (clamped >= 100) return `#${six}`;
  const alpha = Math.round((clamped / 100) * 255)
    .toString(16)
    .padStart(2, "0");
  return `#${six}${alpha}`;
}

// Strip the leading "#" so the hex input field shows the bare 6 chars (like Figma).
// Defensive against undefined / non-string inputs — older persisted gradient
// swatches don't carry the `fallback` field, and a stale tab may briefly read
// undefined before the migration normalizer runs.
export function stripHash(hex: string | undefined | null): string {
  if (typeof hex !== "string") return "";
  return hex.replace(/^#/, "").toUpperCase();
}

// Neutral fallback used when a swatch-ref points at a missing swatch (e.g.
// the swatches list hasn't loaded yet, or — defensively — a dangling ref slipped
// through despite the delete-time cascade). Picked to read as "obviously a
// placeholder" rather than transparent so the UI doesn't render an invisible
// block.
const SWATCH_REF_FALLBACK = "#888888";

// Look up a swatch-ref in a swatches list. Returns the underlying Solid/Gradient
// value, or `null` when the ref can't be resolved. Pure — no React/context.
//
// Optional `drafts` map carries session-local in-progress edits — when the
// picker's swatch editor is open we want every consumer of that swatch-ref to
// preview the unsaved value live. A draft for a given id wins over the
// persisted swatch value. Drafts are never persisted; the SwatchProvider
// clears them on save / cancel / close.
//
// Recursion cap: a draft may itself be a swatch-ref. To prevent runaway
// recursion or accidental cycles we resolve one extra hop WITHOUT passing
// drafts on. A swatch's value at rest is always Solid|Gradient, so one extra
// lookup is enough.
export function resolveSwatchRef(
  ref: SwatchRefValue,
  swatches: SavedSwatch[] | undefined,
  drafts?: Map<string, ColorValue>
): SolidValue | GradientValue | null {
  if (drafts) {
    const draft = drafts.get(ref.swatchId);
    if (draft) {
      if (draft.type === "swatch-ref") {
        // No drafts on the second hop — guards against cycles.
        return resolveSwatchRef(draft, swatches);
      }
      return draft;
    }
  }
  if (!swatches) return null;
  const found = swatches.find((s) => s.id === ref.swatchId);
  return found ? found.value : null;
}

// Render a ColorValue as a CSS string suitable for `background: ...`. When the
// value is a swatch-ref the helper looks it up in the supplied swatches list
// and emits the resolved value's CSS. Without a list (or for an unresolved
// ref) it falls back to a neutral hex — see SWATCH_REF_FALLBACK.
export function colorValueToCSS(
  value: ColorValue,
  swatches?: SavedSwatch[],
  drafts?: Map<string, ColorValue>
): string {
  // Defensive: a stale page-builder tab can briefly hand us undefined or
  // legacy-shaped data (e.g. a ThemeBackground that hasn't been re-normalized
  // through `normalizeThemeBackground` after the bg restructure). Rather than
  // crash the whole canvas, fall back to the neutral placeholder so the user
  // can still interact with the editor and trigger a reload / save.
  if (!value || typeof value !== "object" || typeof value.type !== "string") {
    return SWATCH_REF_FALLBACK;
  }
  if (value.type === "swatch-ref") {
    const resolved = resolveSwatchRef(value, swatches, drafts);
    if (!resolved) return SWATCH_REF_FALLBACK;
    return colorValueToCSS(resolved, swatches, drafts);
  }
  if (value.type === "gradient") {
    const g = value.gradient;
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
    // conic
    return `conic-gradient(from ${g.angle}deg at 50% 50%, ${parts.join(", ")})`;
  }
  const opacity = value.opacity ?? 100;
  return opacity >= 100
    ? value.color
    : hexToRgba(value.color, opacity / 100);
}

// Convert a swatch-ref back into a concrete Solid/Gradient value by cloning
// the underlying swatch's value. Used by the picker's "Unlink" button — once
// unlinked, the user can edit freely without affecting the original swatch.
// When the swatch is missing returns a default solid so the picker always has
// something editable to fall back to.
export function unlinkValue(
  value: ColorValue,
  swatches: SavedSwatch[] | undefined
): SolidValue | GradientValue {
  if (value.type !== "swatch-ref") {
    // Already a concrete value — return as-is (cloned to avoid aliasing).
    return cloneColorValue(value);
  }
  const resolved = resolveSwatchRef(value, swatches);
  if (!resolved) return defaultSolid();
  return cloneColorValue(resolved);
}

// Deep clone a Solid/Gradient. JSON round-trip is fine — these payloads are
// plain serializable shapes (numbers, strings, arrays).
export function cloneColorValue(
  value: SolidValue | GradientValue
): SolidValue | GradientValue {
  return JSON.parse(JSON.stringify(value));
}

// Build a fresh default solid value used by the type-toggle and stop init.
export function defaultSolid(): SolidValue {
  return { type: "solid", color: "#d9d9d9", opacity: 100 };
}

// When the user toggles "solid → gradient", seed two stops from the current
// solid (and a darker variant) so the gradient bar shows something usable.
// The fallback hex seeds from the source solid — the user can still change it
// later from the GradientEditor.
export function solidToGradient(solid: SolidValue): GradientValue {
  return {
    type: "gradient",
    gradient: {
      kind: "linear",
      angle: 90,
      stops: [
        { id: makeStopId(), position: 0, color: solid.color, opacity: solid.opacity },
        { id: makeStopId(), position: 100, color: "#737373", opacity: 100 },
      ],
    },
    fallback: solid.color,
  };
}

// Switch a gradient between linear / radial / conic without losing the stops.
// We preserve `angle` when both source and target carry one, and pick a sane
// default for the fields the target needs but the source lacks. The fallback
// hex is preserved across kind changes — it's a property of the *value*, not
// of the gradient kind, so swapping linear ↔ radial ↔ conic shouldn't reset
// the user's chosen fallback.
export function changeGradientKind(
  value: GradientValue,
  next: "linear" | "radial" | "conic"
): GradientValue {
  const g = value.gradient;
  if (g.kind === next) return value;
  const stops = g.stops;
  if (next === "linear") {
    const angle = "angle" in g ? g.angle : 90;
    return {
      type: "gradient",
      gradient: { kind: "linear", angle, stops },
      fallback: value.fallback,
    };
  }
  if (next === "radial") {
    return {
      type: "gradient",
      gradient: { kind: "radial", shape: "ellipse", stops },
      fallback: value.fallback,
    };
  }
  // conic
  const angle = "angle" in g ? g.angle : 0;
  return {
    type: "gradient",
    gradient: { kind: "conic", angle, stops },
    fallback: value.fallback,
  };
}

// When the user toggles "gradient → solid", land on the user-chosen fallback
// hex (it's already the "single representative color" of the gradient by
// design). Opacity resets to 100 — the fallback hex doesn't carry alpha.
export function gradientToSolid(value: GradientValue): SolidValue {
  return {
    type: "solid",
    color: value.fallback,
    opacity: 100,
  };
}

// Resolve any ColorValue down to a single hex suitable for contexts that
// can't render a gradient (a hex-only field, or — for text — a browser that
// doesn't support background-clip:text). Resolves swatch-refs first, then:
//   solid    → value.color
//   gradient → value.fallback
//   missing  → "#000000"
export function gradientFallbackHex(
  value: ColorValue,
  swatches?: SavedSwatch[]
): string {
  if (value.type === "swatch-ref") {
    const resolved = resolveSwatchRef(value, swatches);
    if (!resolved) return "#000000";
    return gradientFallbackHex(resolved, swatches);
  }
  if (value.type === "solid") return value.color;
  return value.fallback;
}

// Compact unique stop id — only needs to be unique within one gradient.
let _stopCounter = 0;
export function makeStopId(): string {
  _stopCounter += 1;
  return `s_${Date.now().toString(36)}_${_stopCounter}`;
}

// Clamp a number into [0, 100] and round to the nearest integer. Used by the
// opacity controls so typed input and the draggable `%` indicator both stay
// inside the valid percent range without exposing fractional values.
export function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}
