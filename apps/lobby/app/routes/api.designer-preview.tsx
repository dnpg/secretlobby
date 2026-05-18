import { useRef, useState, useEffect } from "react";
import { Form, useLoaderData, useActionData } from "react-router";
import type { Route } from "./+types/api.designer-preview";
import { prisma } from "@secretlobby/db";
import { validateDesignerToken, type DesignerPage } from "@secretlobby/auth";
import { getPublicUrl } from "@secretlobby/storage";
import {
  PlayerView,
  useHlsAudio,
  useTrackPrefetcher,
  type Track,
  type ImageUrls,
  type SocialLinksSettings,
} from "@secretlobby/player-view";
import { ResponsiveImage } from "@secretlobby/ui";

interface LoginPageSettings {
  title: string;
  description: string;
  logoType: "svg" | "image" | null;
  logoSvg: string;
  logoImage: string;
  logoMaxWidth: number;
  bgColor: string;
  panelBgColor: string;
  panelBorderColor: string;
  textColor: string;
  buttonLabel: string;
}

const defaultLoginPageSettings: LoginPageSettings = {
  title: "",
  description: "",
  logoType: null,
  logoSvg: "",
  logoImage: "",
  logoMaxWidth: 50,
  bgColor: "#111827",
  panelBgColor: "#1f2937",
  panelBorderColor: "#374151",
  textColor: "#ffffff",
  buttonLabel: "Enter Lobby",
};

interface GradientStop {
  id: string;
  position: number;
  color: string;
  opacity: number;
}
type SwatchRef = { type: "swatch-ref"; swatchId: string };
type ImageBackground = {
  type: "image";
  mediaId: string;
  mediaUrl: string;
  size: "cover" | "contain" | "auto";
  position: string;
  repeat: "no-repeat" | "repeat" | "repeat-x" | "repeat-y";
  overlay?: { color: string; opacity: number };
};
// Mirror of @secretlobby/theme.ThemeBackground — layered shape with a
// required color base and an optional image overlay.
type ThemeBackgroundColor =
  | { type: "solid"; color: string; opacity: number }
  | { type: "gradient"; gradient: { kind: "linear"; angle: number; stops: GradientStop[] } }
  | SwatchRef;
type ThemeBackground = {
  color: ThemeBackgroundColor;
  image?: ImageBackground;
};

// Structural shape for resolving swatch-refs in the persisted theme JSON.
interface AccountSwatch {
  id: string;
  value:
    | { type: "solid"; color: string; opacity: number }
    | { type: "gradient"; gradient: { kind: "linear"; angle: number; stops: GradientStop[] } };
}

const SWATCH_REF_FALLBACK_HEX = "#888888";

function resolveBgSwatchRef(
  ref: SwatchRef,
  swatches: AccountSwatch[] | undefined
):
  | { type: "solid"; color: string; opacity: number }
  | { type: "gradient"; gradient: { kind: "linear"; angle: number; stops: GradientStop[] } }
  | null {
  if (!swatches) return null;
  const found = swatches.find((s) => s.id === ref.swatchId);
  return found ? (found.value as
    | { type: "solid"; color: string; opacity: number }
    | { type: "gradient"; gradient: { kind: "linear"; angle: number; stops: GradientStop[] } }
  ) : null;
}

// Narrowed text-color value — mirror of @secretlobby/theme.TextColorValue.
type TextColorValue =
  | { type: "solid"; color: string; opacity: number }
  | {
      type: "gradient";
      gradient: {
        kind: "linear";
        angle: number;
        stops: GradientStop[];
      };
      fallback: string;
    }
  | SwatchRef;

// Border radius — mirror of @secretlobby/theme.BorderRadius. Kept inline so
// this file stays free of cross-package deps.
interface RadiusCorners {
  tl: number;
  tr: number;
  br: number;
  bl: number;
}
type BorderRadius = number | RadiusCorners;

function borderRadiusToCSS(
  r: BorderRadius | undefined | null,
  fallback = 0
): string {
  if (r === undefined || r === null) return `${fallback}px`;
  if (typeof r === "number") return `${r}px`;
  return `${r.tl}px ${r.tr}px ${r.br}px ${r.bl}px`;
}

function normalizeBorderRadius(raw: unknown): BorderRadius {
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

interface ThemeSettings {
  background?: ThemeBackground;
  /** @deprecated legacy */
  bgPrimary?: string;
  /** @deprecated legacy */
  bgSecondary?: string;
  /** @deprecated legacy */
  bgTertiary?: string;
  textPrimary: string;
  /** Rich text color — takes precedence over `textPrimary` when set. */
  textPrimaryColor?: TextColorValue;
  textSecondary: string;
  textMuted: string;
  border: string;
  primary: string;
  primaryHover: string;
  primaryText: string;
  secondary: string;
  secondaryHover: string;
  secondaryText: string;
  accent: string;
  visualizerBg: string;
  visualizerBgOpacity: number;
  visualizerBar: string;
  visualizerBarAlt: string;
  visualizerGlow: string;
  visualizerUseCardBg: boolean;
  visualizerBorderShow: boolean;
  visualizerBorderColor: string;
  visualizerBorderRadius: BorderRadius;
  visualizerBlendMode: string;
  visualizerType: "equalizer" | "waveform";
  cardHeadingColor: string;
  /** Rich heading color — takes precedence over `cardHeadingColor` when set. */
  cardHeadingColorRich?: TextColorValue;
  cardContentColor: string;
  /** Rich content color — takes precedence over `cardContentColor` when set. */
  cardContentColorRich?: TextColorValue;
  cardMutedColor: string;
  cardBgType: "solid" | "gradient";
  cardBgColor: string;
  cardBgGradientFrom: string;
  cardBgGradientTo: string;
  cardBgGradientAngle: number;
  cardBgOpacity: number;
  cardBorderShow: boolean;
  cardBorderType: "solid" | "gradient";
  cardBorderColor: string;
  cardBorderGradientFrom: string;
  cardBorderGradientTo: string;
  cardBorderGradientAngle: number;
  cardBorderOpacity: number;
  cardBorderWidth: string;
  cardBorderRadius: BorderRadius;
  /** Optional composed `backdrop-filter` for the card surface — see
   *  @secretlobby/theme.BackdropFilter. Stored as a structured array of
   *  filter functions, not a raw CSS string. */
  cardBackdropFilter?: unknown[];
  buttonBorderRadius: BorderRadius;
  playButtonBorderRadius: BorderRadius;
  // Optional button styling — kept optional so legacy persisted theme JSON
  // still type-checks. Buttons are color-only (no image overlay).
  buttonBg?: ThemeBackgroundColor;
  buttonText?: string;
  buttonTextRich?: TextColorValue;
  buttonBorderShow?: boolean;
  buttonBorderColor?: string;
  buttonBorderWidth?: string;
  /** Border style — `"none"` collapses the border regardless of width/color.
   *  When absent the CSS layer falls back to the legacy `buttonBorderShow`
   *  boolean (true → "solid", false → "none"). */
  buttonBorderStyle?: string;
  buttonHoverBg?: ThemeBackgroundColor;
  buttonHoverText?: string;
  buttonHoverTextRich?: TextColorValue;
  buttonPressedBg?: ThemeBackgroundColor;
  buttonPressedText?: string;
  buttonPressedTextRich?: TextColorValue;
  buttonActiveBg?: ThemeBackgroundColor;
  buttonActiveText?: string;
  buttonActiveTextRich?: TextColorValue;
}

const defaultTheme: ThemeSettings = {
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
};

function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    return `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, ${alpha})`;
  }
  return `rgba(0, 0, 0, ${alpha})`;
}

// Coerce a possibly-legacy theme JSON into the new layered ThemeBackground.
// Handles four legacy single-variant shapes plus the new layered shape.
function resolveBackground(theme: ThemeSettings): ThemeBackground {
  const bg = theme.background as unknown;
  if (bg && typeof bg === "object") {
    const b = bg as Record<string, unknown>;
    if ("type" in b) {
      if (b.type === "image") {
        return {
          color: { type: "solid", color: "#000000", opacity: 100 },
          image: b as unknown as ImageBackground,
        };
      }
      return { color: b as unknown as ThemeBackgroundColor };
    }
    if ("color" in b) {
      return b as unknown as ThemeBackground;
    }
  }
  if (theme.bgPrimary) {
    return { color: { type: "solid", color: theme.bgPrimary, opacity: 100 } };
  }
  return { color: { type: "solid", color: "#030712", opacity: 100 } };
}

function colorPartToCSS(
  color: ThemeBackgroundColor,
  swatches?: AccountSwatch[]
): string {
  if (color.type === "swatch-ref") {
    const resolved = resolveBgSwatchRef(color, swatches);
    if (!resolved) return SWATCH_REF_FALLBACK_HEX;
    return colorPartToCSS(resolved, swatches);
  }
  if (color.type === "gradient") {
    const stops = [...color.gradient.stops].sort((a, b) => a.position - b.position);
    const parts = stops.map(
      (s) => `${hexToRgba(s.color, (s.opacity ?? 100) / 100)} ${s.position}%`
    );
    return `linear-gradient(${color.gradient.angle}deg, ${parts.join(", ")})`;
  }
  const opacity = color.opacity ?? 100;
  return opacity >= 100 ? color.color : hexToRgba(color.color, opacity / 100);
}

/**
 * Render a layered ThemeBackground (`{ color, image? }`) as a CSS string.
 * Stack order: overlay (top) > image > color (bottom).
 */
function backgroundToCSS(
  bg: ThemeBackground,
  swatches?: AccountSwatch[]
): string {
  const colorCSS = colorPartToCSS(bg.color, swatches);
  if (!bg.image) return colorCSS;
  const imgUrl = `url(${JSON.stringify(bg.image.mediaUrl)})`;
  const overlay = bg.image.overlay && bg.image.overlay.opacity > 0
    ? (() => {
        const rgba = hexToRgba(bg.image.overlay.color, bg.image.overlay.opacity / 100);
        return `linear-gradient(${rgba}, ${rgba})`;
      })()
    : null;
  const layers = [overlay, imgUrl].filter(Boolean).join(", ");
  return `${layers}, ${colorCSS}`;
}

function colorPartFirstColor(
  color: ThemeBackgroundColor,
  swatches?: AccountSwatch[]
): string {
  if (color.type === "swatch-ref") {
    const resolved = resolveBgSwatchRef(color, swatches);
    if (!resolved) return SWATCH_REF_FALLBACK_HEX;
    return colorPartFirstColor(resolved, swatches);
  }
  return color.type === "solid" ? color.color : color.gradient.stops[0]?.color ?? "#000000";
}

function getCardBgCSS(
  theme: ThemeSettings,
  swatches?: AccountSwatch[]
): string {
  const opacity = (theme.cardBgOpacity ?? 50) / 100;
  if (theme.cardBgType === "gradient") {
    const from = hexToRgba(theme.cardBgGradientFrom, opacity);
    const to = hexToRgba(theme.cardBgGradientTo, opacity);
    return `linear-gradient(${theme.cardBgGradientAngle ?? 135}deg, ${from}, ${to})`;
  }
  const fallback =
    theme.bgSecondary ??
    colorPartFirstColor(resolveBackground(theme).color, swatches);
  return hexToRgba(theme.cardBgColor || fallback, opacity);
}

function getBodyBgCSS(
  theme: ThemeSettings,
  swatches?: AccountSwatch[]
): string {
  if (theme.cardBgType === "gradient") {
    return `linear-gradient(${theme.cardBgGradientAngle ?? 135}deg, ${theme.cardBgGradientFrom}, ${theme.cardBgGradientTo})`;
  }
  return backgroundToCSS(resolveBackground(theme), swatches);
}

interface CardStyles {
  bg: string;
  bgIsGradient: boolean;
  borderType: "none" | "solid" | "gradient";
  borderSolid: string;
  borderGradient: string;
  borderWidth: string;
  headingColor: string;
  contentColor: string;
  mutedColor: string;
  visualizerUseCardBg: boolean;
  visualizerBorderShow: boolean;
  visualizerBorderColor: string;
  visualizerBorderRadius: BorderRadius;
  visualizerBlendMode: string;
  visualizerType: "equalizer" | "waveform";
  cardBorderRadius: BorderRadius;
  buttonBorderRadius: BorderRadius;
  playButtonBorderRadius: BorderRadius;
}

function normalizeCSSValue(value: string | undefined, fallback: string): string {
  if (value === undefined || value === null || value === "") return fallback;
  const str = String(value).trim();
  if (!str) return fallback;
  if (/^[\d.]+$/.test(str)) return `${str}px`;
  return str;
}

function computeCardStyles(
  theme: ThemeSettings,
  swatches?: AccountSwatch[]
): CardStyles {
  const bg = getCardBgCSS(theme, swatches);
  const borderWidth = normalizeCSSValue(theme.cardBorderWidth, "1px");
  const opacity = (theme.cardBorderOpacity ?? 100) / 100;

  let borderType: "none" | "solid" | "gradient" = "none";
  let borderSolid = "";
  let borderGradient = "";

  if (theme.cardBorderShow) {
    if (theme.cardBorderType === "gradient") {
      borderType = "gradient";
      const from = hexToRgba(theme.cardBorderGradientFrom, opacity);
      const to = hexToRgba(theme.cardBorderGradientTo, opacity);
      borderGradient = `linear-gradient(${theme.cardBorderGradientAngle ?? 135}deg, ${from}, ${to})`;
    } else {
      borderType = "solid";
      borderSolid = `${borderWidth} solid ${hexToRgba(theme.cardBorderColor || theme.border, opacity)}`;
    }
  }

  return {
    bg,
    bgIsGradient: theme.cardBgType === "gradient",
    borderType,
    borderSolid,
    borderGradient,
    borderWidth,
    headingColor: theme.cardHeadingColor || theme.textPrimary,
    contentColor: theme.cardContentColor || theme.textSecondary,
    mutedColor: theme.cardMutedColor || theme.textMuted,
    visualizerUseCardBg: theme.visualizerUseCardBg ?? false,
    visualizerBorderShow: theme.visualizerBorderShow ?? false,
    visualizerBorderColor: theme.visualizerBorderColor || theme.border,
    visualizerBorderRadius: normalizeBorderRadius(theme.visualizerBorderRadius ?? 8),
    visualizerBlendMode: theme.visualizerBlendMode || "normal",
    visualizerType: theme.visualizerType || "equalizer",
    cardBorderRadius: normalizeBorderRadius(theme.cardBorderRadius ?? 12),
    buttonBorderRadius: normalizeBorderRadius(theme.buttonBorderRadius ?? 24),
    playButtonBorderRadius: normalizeBorderRadius(theme.playButtonBorderRadius ?? 50),
  };
}

// Button state derivation helpers — mirror @secretlobby/theme so the designer
// preview emits the same --btn-* CSS variables as the live lobby.
function darkenHexBtn(hex: string, amount: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return hex;
  const r = parseInt(result[1], 16) * (1 - amount);
  const g = parseInt(result[2], 16) * (1 - amount);
  const b = parseInt(result[3], 16) * (1 - amount);
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

function darkenColorPartBtn(
  color: ThemeBackgroundColor,
  amount: number,
  swatches?: AccountSwatch[]
): ThemeBackgroundColor {
  if (color.type === "swatch-ref") {
    const resolved = resolveBgSwatchRef(color, swatches);
    if (!resolved) {
      return { type: "solid", color: darkenHexBtn(SWATCH_REF_FALLBACK_HEX, amount), opacity: 100 };
    }
    return darkenColorPartBtn(resolved, amount, swatches);
  }
  if (color.type === "solid") return { ...color, color: darkenHexBtn(color.color, amount) };
  const stops = color.gradient.stops.map((s) => ({ ...s, color: darkenHexBtn(s.color, amount) }));
  return { type: "gradient", gradient: { kind: "linear", angle: color.gradient.angle, stops } };
}

// Resolve a TextColorValue into the {color, image} pair used by the lobby's
// gradient-text vars. Same logic as `_index.tsx#richTextCSSVars` — kept inline
// for module isolation.
function richTextCSSVars(
  rich: TextColorValue | undefined,
  legacy: string,
  swatches?: AccountSwatch[]
): { color: string; image: string } {
  if (!rich) return { color: legacy, image: "none" };
  if (rich.type === "swatch-ref") {
    const resolved = resolveBgSwatchRef(rich, swatches);
    if (!resolved) return { color: SWATCH_REF_FALLBACK_HEX, image: "none" };
    return richTextCSSVars(resolved as TextColorValue, legacy, swatches);
  }
  if (rich.type === "solid") {
    const opacity = rich.opacity ?? 100;
    return {
      color: opacity >= 100 ? rich.color : hexToRgba(rich.color, opacity / 100),
      image: "none",
    };
  }
  const stops = [...rich.gradient.stops].sort((a, b) => a.position - b.position);
  const parts = stops.map(
    (s) => `${hexToRgba(s.color, (s.opacity ?? 100) / 100)} ${s.position}%`
  );
  return {
    color: "transparent",
    image: `linear-gradient(${rich.gradient.angle}deg, ${parts.join(", ")})`,
  };
}

function generateThemeCSSVars(
  theme: ThemeSettings,
  swatches?: AccountSwatch[]
): Record<string, string> {
  const resolvedBg = resolveBackground(theme);
  const bgCSS = backgroundToCSS(resolvedBg, swatches);
  // Image-bg layout vars.
  const imageBgVars = resolvedBg.image ?? null;
  const bgSize = imageBgVars?.size ?? "auto";
  const bgPosition = imageBgVars?.position ?? "center";
  const bgRepeat = imageBgVars?.repeat ?? "no-repeat";

  // Button base + derived state vars. See @secretlobby/theme.generateThemeCSS
  // for the canonical implementation.
  const btnBg: ThemeBackgroundColor = theme.buttonBg ?? { type: "solid", color: "#ffffff", opacity: 100 };
  const btnText = theme.buttonText ?? "#000000";
  const btnBorderShow = theme.buttonBorderShow ?? false;
  const btnBorderColor = theme.buttonBorderColor ?? theme.border;
  const btnBorderWidth = theme.buttonBorderWidth ?? "1px";
  const btnBorderStyle =
    theme.buttonBorderStyle ?? (btnBorderShow ? "solid" : "none");
  const hoverBg: ThemeBackgroundColor = theme.buttonHoverBg ?? { type: "solid", color: btnText, opacity: 100 };
  const hoverText = theme.buttonHoverText ?? colorPartFirstColor(btnBg, swatches);
  const pressedBg: ThemeBackgroundColor = theme.buttonPressedBg ?? darkenColorPartBtn(hoverBg, 0.1, swatches);
  const pressedText = theme.buttonPressedText ?? darkenHexBtn(hoverText, 0.1);
  const activeBg: ThemeBackgroundColor = theme.buttonActiveBg ?? darkenColorPartBtn(hoverBg, 0.1, swatches);
  const activeText = theme.buttonActiveText ?? darkenHexBtn(hoverText, 0.1);

  // Rich text vars — see _index.tsx for the full rationale. Mirror its
  // emission so designer-preview and the live lobby render gradient text
  // identically.
  const textPrimaryCSS = richTextCSSVars(
    theme.textPrimaryColor,
    theme.textPrimary,
    swatches
  );
  const btnTextCSS = richTextCSSVars(theme.buttonTextRich, btnText, swatches);
  const btnHoverTextCSS = richTextCSSVars(
    theme.buttonHoverTextRich,
    hoverText,
    swatches
  );
  const btnPressedTextCSS = richTextCSSVars(
    theme.buttonPressedTextRich,
    pressedText,
    swatches
  );
  const btnActiveTextCSS = richTextCSSVars(
    theme.buttonActiveTextRich,
    activeText,
    swatches
  );
  const cardHeadingCSS = richTextCSSVars(
    theme.cardHeadingColorRich,
    theme.cardHeadingColor,
    swatches
  );
  const cardContentCSS = richTextCSSVars(
    theme.cardContentColorRich,
    theme.cardContentColor,
    swatches
  );

  return {
    "--color-bg": bgCSS,
    "--color-bg-primary": "var(--color-bg)",
    "--color-bg-secondary": "var(--color-bg)",
    "--color-bg-tertiary": "var(--color-bg)",
    "--bg-size": bgSize,
    "--bg-position": bgPosition,
    "--bg-repeat": bgRepeat,
    "--color-text-primary": textPrimaryCSS.color,
    "--color-text-primary-image": textPrimaryCSS.image,
    "--color-text-secondary": theme.textSecondary,
    "--color-text-muted": theme.textMuted,
    "--color-border": theme.border,
    "--color-primary": theme.primary,
    "--color-primary-hover": theme.primaryHover,
    "--color-primary-text": theme.primaryText,
    "--color-secondary": theme.secondary,
    "--color-secondary-hover": theme.secondaryHover,
    "--color-secondary-text": theme.secondaryText,
    "--color-accent": theme.accent,
    "--color-visualizer-bg": theme.visualizerBg,
    "--color-visualizer-bg-opacity": String(theme.visualizerBgOpacity / 100),
    "--color-visualizer-bar": theme.visualizerBar,
    "--color-visualizer-bar-alt": theme.visualizerBarAlt,
    "--color-visualizer-glow": theme.visualizerGlow,
    // Card text — rich-aware mirrors of the legacy hex strings.
    "--card-heading-color": cardHeadingCSS.color,
    "--card-heading-color-image": cardHeadingCSS.image,
    "--card-content-color": cardContentCSS.color,
    "--card-content-color-image": cardContentCSS.image,
    // Button base (color-only — no image overlay).
    "--btn-bg": colorPartToCSS(btnBg, swatches),
    "--btn-text": btnTextCSS.color,
    "--btn-text-image": btnTextCSS.image,
    "--btn-border-color": btnBorderColor,
    "--btn-border-width": btnBorderWidth,
    "--btn-border-style": btnBorderStyle,
    "--btn-border-show": btnBorderStyle !== "none" ? "1" : "0",
    // Button states.
    "--btn-hover-bg": colorPartToCSS(hoverBg, swatches),
    "--btn-hover-text": btnHoverTextCSS.color,
    "--btn-hover-text-image": btnHoverTextCSS.image,
    "--btn-pressed-bg": colorPartToCSS(pressedBg, swatches),
    "--btn-pressed-text": btnPressedTextCSS.color,
    "--btn-pressed-text-image": btnPressedTextCSS.image,
    "--btn-active-bg": colorPartToCSS(activeBg, swatches),
    "--btn-active-text": btnActiveTextCSS.color,
    "--btn-active-text-image": btnActiveTextCSS.image,
  };
}

export function headers() {
  // Allow framing from console domain
  // Include local development domains and production
  const frameAncestors = "'self' http://*.secretlobby.local http://localhost:* http://127.0.0.1:* https://*.secretlobby.co";

  return {
    "Content-Security-Policy": `frame-ancestors ${frameAncestors}`,
    // X-Frame-Options is ignored when CSP frame-ancestors is present in modern browsers
  };
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const page = url.searchParams.get("page") as DesignerPage | null;

  // Validate required parameters
  if (!token || !page) {
    throw new Response("Missing token or page parameter", { status: 400 });
  }

  if (page !== "lobby" && page !== "login") {
    throw new Response("Invalid page parameter", { status: 400 });
  }

  // Extract lobbyId from the URL path (tenant resolution)
  // The URL will be like: https://account.domain.com/api/designer-preview?token=...&page=...
  // Or: https://account.domain.com/lobby-slug/api/designer-preview?token=...&page=...

  // First, we need to determine the lobbyId from the token itself
  // We'll do a preliminary parse to extract the lobbyId, then validate fully

  // Parse token payload to get lobbyId (before full validation)
  let expectedLobbyId: string;
  try {
    const [payloadBase64] = token.split(".");
    const payloadStr = Buffer.from(payloadBase64, "base64url").toString("utf-8");
    const payload = JSON.parse(payloadStr);
    expectedLobbyId = payload.lobbyId;
  } catch {
    throw new Response("Invalid token format", { status: 403 });
  }

  // Now validate the token fully
  const validation = validateDesignerToken(token, expectedLobbyId, page);
  if (!validation.valid) {
    throw new Response(validation.error || "Invalid token", { status: 403 });
  }

  const { lobbyId, accountId } = validation;

  // Fetch the lobby with all required data
  const lobby = await prisma.lobby.findUnique({
    where: { id: lobbyId },
    include: {
      account: true,
      backgroundMedia: true,
      backgroundMediaDark: true,
      bannerMedia: true,
      bannerMediaDark: true,
      profileMedia: true,
      profileMediaDark: true,
      tracks: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          title: true,
          artist: true,
          duration: true,
          position: true,
          filename: true,
          hlsReady: true,
          waveformPeaks: true,
          media: {
            select: {
              key: true,
              duration: true,
              hlsReady: true,
              waveformPeaks: true,
            },
          },
        },
      },
    },
  });

  if (!lobby) {
    throw new Response("Lobby not found", { status: 404 });
  }

  // Verify the token's accountId matches the lobby's accountId
  if (lobby.accountId !== accountId) {
    throw new Response("Unauthorized", { status: 403 });
  }

  // Extract per-lobby settings
  let loginPageSettings: LoginPageSettings = defaultLoginPageSettings;
  let loginLogoImageUrl: string | null = null;
  let themeSettings: ThemeSettings = defaultTheme;
  let socialLinksSettings: SocialLinksSettings | null = null;
  let technicalInfo: { title: string; content: string } | null = null;

  // Read per-lobby settings from lobby.settings
  if (lobby.settings && typeof lobby.settings === "object") {
    const lobbySettings = lobby.settings as Record<string, unknown>;
    if (lobbySettings.loginPage && typeof lobbySettings.loginPage === "object") {
      loginPageSettings = { ...defaultLoginPageSettings, ...(lobbySettings.loginPage as Partial<LoginPageSettings>) };
    }
    if (lobbySettings.theme && typeof lobbySettings.theme === "object") {
      themeSettings = { ...defaultTheme, ...(lobbySettings.theme as Partial<ThemeSettings>) };
    }
    if (lobbySettings.socialLinks && typeof lobbySettings.socialLinks === "object") {
      socialLinksSettings = lobbySettings.socialLinks as SocialLinksSettings;
    }
    if (lobbySettings.technicalInfo && typeof lobbySettings.technicalInfo === "object") {
      const ti = lobbySettings.technicalInfo as { title?: string; content?: string };
      if (ti.title || ti.content) {
        technicalInfo = { title: ti.title || "", content: ti.content || "" };
      }
    }
  }

  // Fallback: check account-level settings for legacy data
  if (lobby.account.settings && typeof lobby.account.settings === "object") {
    const accountSettings = lobby.account.settings as Record<string, unknown>;
    // Fallback: if lobby doesn't have loginPage, check account-level settings (legacy)
    if (loginPageSettings === defaultLoginPageSettings && accountSettings.loginPage && typeof accountSettings.loginPage === "object") {
      loginPageSettings = { ...defaultLoginPageSettings, ...(accountSettings.loginPage as Partial<LoginPageSettings>) };
    }
    // Fallback: if lobby doesn't have theme, check account-level settings (legacy)
    if (themeSettings === defaultTheme && accountSettings.theme && typeof accountSettings.theme === "object") {
      themeSettings = { ...defaultTheme, ...(accountSettings.theme as Partial<ThemeSettings>) };
    }
    // Fallback: if lobby doesn't have social links, check account-level settings (legacy)
    if (!socialLinksSettings && accountSettings.socialLinks && typeof accountSettings.socialLinks === "object") {
      socialLinksSettings = accountSettings.socialLinks as SocialLinksSettings;
    }
    // Fallback: if lobby doesn't have technicalInfo, check account-level settings (legacy)
    if (!technicalInfo && accountSettings.technicalInfo && typeof accountSettings.technicalInfo === "object") {
      const ti = accountSettings.technicalInfo as { title?: string; content?: string };
      if (ti.title || ti.content) {
        technicalInfo = { title: ti.title || "", content: ti.content || "" };
      }
    }
  }

  if (loginPageSettings.logoType === "image" && loginPageSettings.logoImage) {
    loginLogoImageUrl = getPublicUrl(loginPageSettings.logoImage);
  }

  // Resolve `swatch-ref` entries in the persisted theme JSON against the
  // owning account's swatch library. Same shape and treatment as the public
  // lobby renderer so a designer preview matches what visitors see.
  const accountSwatchRows = await prisma.swatch.findMany({
    where: { accountId: lobby.accountId },
    select: { id: true, value: true },
  });
  const accountSwatches: AccountSwatch[] = accountSwatchRows.map((r) => ({
    id: r.id,
    value: r.value as AccountSwatch["value"],
  }));

  const themeVars = generateThemeCSSVars(themeSettings, accountSwatches);
  const cardStyles = computeCardStyles(themeSettings, accountSwatches);
  const bodyBg = getBodyBgCSS(themeSettings, accountSwatches);

  // Helper: resolve a Media record to its public URL
  function mediaUrl(media: { key: string; type: string; embedUrl: string | null } | null | undefined): string | null {
    if (!media) return null;
    return media.type === "EMBED" ? (media.embedUrl || null) : getPublicUrl(media.key);
  }

  const imageUrls: ImageUrls = {
    background: mediaUrl(lobby.backgroundMedia as any),
    backgroundDark: mediaUrl(lobby.backgroundMediaDark as any),
    banner: mediaUrl(lobby.bannerMedia as any),
    bannerDark: mediaUrl(lobby.bannerMediaDark as any),
    profile: mediaUrl(lobby.profileMedia as any),
    profileDark: mediaUrl(lobby.profileMediaDark as any),
  };

  // Normalize tracks
  const tracks = lobby.tracks.map((t) => ({
    id: t.id,
    title: t.title,
    artist: t.artist,
    duration: t.media?.duration ?? t.duration,
    position: t.position,
    filename: t.media?.key ?? t.filename,
    hlsReady: t.media?.hlsReady ?? t.hlsReady,
    waveformPeaks: t.media?.waveformPeaks ?? t.waveformPeaks,
  }));

  // Get autoplay track from lobby settings
  const lobbySettingsObj = (lobby.settings as Record<string, unknown>) || {};
  const autoplayTrackId = (lobbySettingsObj.autoplayTrackId as string) || null;

  return {
    page,
    lobby: {
      id: lobby.id,
      title: lobby.title,
      description: lobby.description,
    },
    account: {
      name: lobby.account.name,
      slug: lobby.account.slug,
    },
    imageUrls,
    tracks,
    autoplayTrackId,
    loginPageSettings,
    loginLogoImageUrl,
    themeVars,
    cardStyles,
    bodyBg,
    socialLinksSettings,
    technicalInfo,
    isDesignerMode: true,
  };
}

export default function DesignerPreview() {
  const data = useLoaderData<typeof loader>();

  // Audio state
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioHook = useHlsAudio(audioRef);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const loadedTrackRef = useRef<string | null>(null);

  // Apply body background from theme settings
  useEffect(() => {
    const bg = data.bodyBg;
    if (bg.startsWith("linear-gradient")) {
      document.body.style.background = bg;
    } else {
      document.body.style.backgroundColor = bg;
    }
    return () => {
      document.body.style.background = "";
      document.body.style.backgroundColor = "";
    };
  }, [data.bodyBg]);

  const tracks: Track[] = data.tracks as Track[];

  // Prefetch the next track
  useTrackPrefetcher({ tracks, currentTrackId: activeTrackId, isPlaying });

  // Load initial track (for lobby page preview)
  const autoplayTrack = data.autoplayTrackId
    ? tracks.find((t) => t.id === data.autoplayTrackId)
    : null;
  const initialTrack = autoplayTrack || tracks[0];
  const initialTrackId = initialTrack?.id;

  useEffect(() => {
    if (!initialTrackId || data.page === "login") return;

    if (loadedTrackRef.current !== initialTrackId) {
      loadedTrackRef.current = initialTrackId;
      const hlsOpts = initialTrack ? {
        hlsReady: (initialTrack as { hlsReady?: boolean }).hlsReady ?? false,
        duration: initialTrack.duration,
        waveformPeaks: (initialTrack as { waveformPeaks?: number[] | null }).waveformPeaks ?? null,
      } : undefined;
      audioHook.loadTrack(initialTrackId, undefined, hlsOpts);
    }
  }, [initialTrackId, data.page]);

  const { lobby, account, imageUrls, loginPageSettings, loginLogoImageUrl, cardStyles, socialLinksSettings, technicalInfo } = data;

  const lp = loginPageSettings;
  const bandName = lobby?.title || account?.name;
  const bandDescription = lobby?.description;

  // Render login page preview
  if (data.page === "login") {
    return (
      <main
        className="min-h-dvh flex items-center justify-center overflow-hidden"
        style={{ backgroundColor: lp.bgColor }}
      >
        <div className="w-full max-w-md p-8">
          <div
            className="rounded-2xl p-8 shadow-2xl border"
            style={{
              backgroundColor: lp.panelBgColor,
              borderColor: lp.panelBorderColor,
            }}
          >
            <div className="text-center mb-8">
              {lp.logoType === "image" && loginLogoImageUrl && (
                <div className="flex justify-center mb-4 w-full">
                  <ResponsiveImage
                    src={loginLogoImageUrl}
                    alt={lp.title || "Logo"}
                    widths={[200, 400, 600, 800]}
                    sizes={`(min-width: 448px) ${Math.round(384 * (lp.logoMaxWidth || 50) / 100)}px, calc((100vw - 64px) * ${(lp.logoMaxWidth || 50) / 100})`}
                    className="object-contain"
                    style={{ maxWidth: `${lp.logoMaxWidth || 50}%` }}
                  />
                </div>
              )}
              {lp.title && (
                <h1 className="text-2xl font-bold" style={{ color: lp.textColor }}>
                  {lp.title}
                </h1>
              )}
              {lp.description && (
                <p className="mt-2" style={{ color: lp.textColor, opacity: 0.7 }}>
                  {lp.description}
                </p>
              )}
            </div>

            {/* Designer mode notice */}
            <div className="mb-6 text-blue-400 text-sm text-center bg-blue-500/10 py-3 px-4 rounded-lg">
              Designer Preview Mode - Login disabled
            </div>

            <div className="space-y-4">
              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium mb-1"
                  style={{ color: lp.textColor, opacity: 0.85 }}
                >
                  Password
                </label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  placeholder="Enter the password"
                  disabled
                  className="w-full px-4 py-3 rounded-lg border focus:outline-none opacity-60 cursor-not-allowed"
                  style={{
                    backgroundColor: "#ffffff",
                    borderColor: lp.panelBorderColor,
                    color: "#111827",
                  }}
                />
              </div>
              <button
                type="button"
                disabled
                className="w-full py-3 px-4 bg-blue-600 text-white font-semibold rounded-lg opacity-60 cursor-not-allowed"
              >
                {lp.buttonLabel || "Enter Lobby"}
              </button>
            </div>
          </div>
        </div>
        <audio ref={audioRef} style={{ display: "none" }} aria-hidden="true" />
      </main>
    );
  }

  // Render lobby page preview
  return (
    <main style={data.themeVars as React.CSSProperties}>
      <PlayerView
        tracks={tracks}
        imageUrls={imageUrls}
        bandName={bandName}
        bandDescription={bandDescription}
        audio={{
          audioRef,
          loadTrack: audioHook.loadTrack,
          isLoading: audioHook.isLoading,
          isSeeking: audioHook.isSeeking,
          loadingProgress: audioHook.loadingProgress,
          isReady: audioHook.isReady,
          seekTo: audioHook.seekTo,
          cancelAutoPlay: audioHook.cancelAutoPlay,
          estimatedDuration: audioHook.estimatedDuration,
          isAllSegmentsCached: audioHook.isAllSegmentsCached,
          blobTimeOffset: audioHook.blobTimeOffset,
          blobHasLastSegment: audioHook.blobHasLastSegment,
          isBlobMode: audioHook.isBlobMode,
          waveformPeaks: audioHook.waveformPeaks,
          isSafari: audioHook.isSafari,
          isExtendingBlobRef: audioHook.isExtendingBlobRef,
          lastSaneTimeRef: audioHook.lastSaneTimeRef,
        }}
        isPlaying={isPlaying}
        onPlayingChange={setIsPlaying}
        onTrackChange={setActiveTrackId}
        cardStyles={cardStyles}
        socialLinksSettings={socialLinksSettings}
        technicalInfo={technicalInfo}
        initialTrackId={data.autoplayTrackId}
        csrfToken=""
        isDesignerMode={true}
      />
      <audio ref={audioRef} style={{ display: "none" }} aria-hidden="true" />
    </main>
  );
}
