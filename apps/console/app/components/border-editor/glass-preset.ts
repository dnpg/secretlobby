import type {
  BorderImage,
  BorderSideStyles,
  BorderSideWidths,
  BorderStyle,
  BoxShadow,
  Outline,
} from "@secretlobby/theme";
import { formatHexWithAlpha } from "~/components/color-picker/utils";
import type { BorderEditorValue } from "./BorderEditor";

// =============================================================================
// Glass-mode preset
// -----------------------------------------------------------------------------
// One-click "glassmorphism" preset modelled after hype4.academy's generator:
//
//   - 1px solid white border at ~18% alpha
//   - subtle drop shadow (rgba(31, 38, 135, .37), 8px y, 32px blur)
//   - border-radius retained (we don't write radius here — it lives outside
//     BorderEditorValue and the caller controls it)
//   - corresponds with an accompanying backdrop blur + a slightly transparent
//     background; both of those live OUTSIDE the border slice, so the caller
//     wires them via a separate hook (see CardThemeFields integration).
//
// `applyGlassPresetToBorder` returns a NEW BorderEditorValue with the glass
// border applied. Existing per-side widths/styles, image, outline, and the
// rest of the box-shadow stack (if any) are CLEARED so the preset reads
// consistently — the user can rebuild on top if they want.
// =============================================================================

export interface GlassPreset {
  border: {
    show: boolean;
    style: BorderStyle;
    width: string;
    /** Hex (#RRGGBBAA) so the encoded alpha lands intact. */
    colorHex: string;
  };
  /** Targets `box-shadow` — emitted as a one-element stack. */
  shadow: BoxShadow;
  /** Suggested companion values that the parent applies outside the border
   *  slice. CardThemeFields uses these for `cardBackdropFilter` and to dim
   *  `cardBgOpacity` so the glass effect reads correctly on top of the page
   *  background. Optional consumer-side. */
  companion: {
    backdropBlurPx: number;
    /** 0–100 — the recommended card-bg opacity to pair with the preset. */
    cardBgOpacity: number;
  };
}

export const GLASS_PRESET: GlassPreset = {
  border: {
    show: true,
    style: "solid",
    width: "1px",
    // ffffff @ 18% alpha → encode as 8-char hex so the underlying string
    // field (cardBorderColor) round-trips opacity without a separate field.
    colorHex: formatHexWithAlpha("#ffffff", 18),
  },
  shadow: [
    {
      id: "glass-shadow",
      inset: false,
      x: 0,
      y: 8,
      blur: 32,
      spread: 0,
      // rgba(31, 38, 135, .37) ≈ #1F2687 @ 37% alpha
      color: formatHexWithAlpha("#1F2687", 37),
    },
  ],
  companion: {
    backdropBlurPx: 8,
    cardBgOpacity: 20,
  },
};

/**
 * Apply the glass preset to a `BorderEditorValue`. Returns a NEW value with
 * border + box-shadow rewritten. Per-side widths/styles, the border-image,
 * and the outline are cleared so the preset reads consistently. Caller is
 * responsible for the companion knobs (backdrop-filter, bg opacity).
 */
export function applyGlassPresetToBorder(
  current: BorderEditorValue
): BorderEditorValue {
  return {
    ...current,
    show: GLASS_PRESET.border.show,
    style: GLASS_PRESET.border.style,
    width: GLASS_PRESET.border.width,
    colorHex: GLASS_PRESET.border.colorHex,
    sideWidths: undefined as BorderSideWidths | undefined,
    sideStyles: undefined as BorderSideStyles | undefined,
    image: undefined as BorderImage | undefined,
    outline: current.outline ? { ...current.outline, show: false } : undefined,
    boxShadow: GLASS_PRESET.shadow,
  };
}

/**
 * Returns true when the current border looks like the glass preset — used to
 * style the glass-mode toggle as "on" without having to track a separate
 * piece of state. We compare the load-bearing fields (border width/style/
 * color + presence of the shadow + no image / outline) rather than a deep
 * equality so small user tweaks (e.g. nudging the shadow's blur) don't
 * unfairly switch the toggle off.
 */
export function isGlassPresetActive(value: BorderEditorValue): boolean {
  if (!value.show) return false;
  if (value.style !== GLASS_PRESET.border.style) return false;
  if (value.image) return false;
  if (value.sideWidths || value.sideStyles) return false;
  if (
    value.colorHex.toLowerCase() !== GLASS_PRESET.border.colorHex.toLowerCase()
  ) {
    return false;
  }
  if (value.width !== GLASS_PRESET.border.width) return false;
  if (!value.boxShadow || value.boxShadow.length !== 1) return false;
  const s = value.boxShadow[0];
  return s.blur === 32 && s.y === 8 && !s.inset;
}
