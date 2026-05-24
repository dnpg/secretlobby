import { readFile } from "fs/promises";
import { join } from "path";
import { prisma } from "@secretlobby/db";

export interface Track {
  id: string;
  title: string;
  artist: string;
  filename: string;
}

export type ColorMode = "dark" | "light" | "system";

// Background value — unified solid|gradient (see @secretlobby/theme).
export interface GradientStop {
  id: string;
  position: number;
  color: string;
  opacity: number;
}

export interface LinearGradient {
  kind: "linear";
  angle: number;
  stops: GradientStop[];
}

// Mirror of @secretlobby/theme.SwatchRef — kept structural so this file stays
// boundary-free of cross-package deps.
export interface SwatchRef {
  type: "swatch-ref";
  swatchId: string;
}

// Mirror of @secretlobby/theme.ImageBackground.
export interface ImageBackground {
  type: "image";
  mediaId: string;
  mediaUrl: string;
  size: "cover" | "contain" | "auto";
  position: string;
  repeat: "no-repeat" | "repeat" | "repeat-x" | "repeat-y";
  overlay?: { color: string; opacity: number };
}

// Mirror of @secretlobby/theme.ThemeBackground — restructured as a layered
// `{ color, image? }` shape so the color is always present and an image
// can optionally overlay on top.
export type ThemeBackgroundColor =
  | { type: "solid"; color: string; opacity: number }
  | { type: "gradient"; gradient: LinearGradient }
  | SwatchRef;

export interface ThemeBackground {
  color: ThemeBackgroundColor;
  image?: ImageBackground;
}

// Structural shape matching @secretlobby/theme.ThemeSwatch — used to resolve
// swatch-refs in the theme JSON. We require `value` to be a concrete
// Solid/Gradient (no nested refs).
export interface AccountSwatch {
  id: string;
  value:
    | { type: "solid"; color: string; opacity: number }
    | { type: "gradient"; gradient: LinearGradient };
}

// Backdrop filter — mirror of @secretlobby/theme.BackdropFilter so this file
// stays type-aligned with the persisted theme JSON. Kept structural (no
// import) to preserve the no-cross-package-deps boundary this file has.
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

// Border radius — mirrors @secretlobby/theme.BorderRadius. Number = uniform;
// object = per-corner {tl,tr,br,bl}. Kept structural so this file stays free
// of cross-package imports (mirroring how other types here are duplicated).
export interface RadiusCorners {
  tl: number;
  tr: number;
  br: number;
  bl: number;
}
export type BorderRadius = number | RadiusCorners;

/** Render a BorderRadius value as a CSS string. Mirror of the package helper. */
export function borderRadiusToCSS(
  r: BorderRadius | undefined | null,
  fallback = 0
): string {
  if (r === undefined || r === null) return `${fallback}px`;
  if (typeof r === "number") return `${r}px`;
  return `${r.tl}px ${r.tr}px ${r.br}px ${r.bl}px`;
}

/** Coerce a persisted radius value (legacy number or new object) into a
 *  BorderRadius. Anything else (string, missing) falls back to 0. */
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

export interface ThemeSettings {
  colorMode: ColorMode;
  background: ThemeBackground;
  /** @deprecated kept optional for legacy persisted JSON. */
  bgPrimary?: string;
  /** @deprecated kept optional for legacy persisted JSON. */
  bgSecondary?: string;
  /** @deprecated kept optional for legacy persisted JSON. */
  bgTertiary?: string;
  textPrimary: string;
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
  visualizerBar: string;
  visualizerBarAlt: string;
  visualizerGlow: string;
  /** Card background — legacy hex + opacity pair. The lobby renders cards
   *  via `buildCardStyles` from `@secretlobby/theme`, which reads these
   *  fields. Optional so old persisted JSON still type-checks. */
  cardBgColor?: string;
  cardBgOpacity?: number;
  /** Optional composed `backdrop-filter` for the card surface (see
   *  @secretlobby/theme). Undefined / empty means no filter. */
  cardBackdropFilter?: BackdropFilter;
  /** Playlist region container — glass-blur treatment mirroring cards. */
  playlistContainerEnabled?: boolean;
  playlistBg?: ThemeBackgroundColor;
  playlistBackdropFilter?: BackdropFilter;
  // Border radius fields — number (uniform) or per-corner object. Optional so
  // legacy persisted JSON without these still type-checks; readers should
  // normalize via `normalizeBorderRadius` and fall back to a sensible default.
  cardBorderRadius?: BorderRadius;
  buttonBorderRadius?: BorderRadius;
  playButtonBorderRadius?: BorderRadius;
  playButtonBg?: ThemeBackgroundColor;
  playButtonIconColor?: string;
  visualizerBorderRadius?: BorderRadius;
  // Button base styling — optional so legacy persisted JSON still type-checks.
  // Buttons are color-only (no image overlay) — `ThemeBackgroundColor` is the
  // tightest type that mirrors what `ColorPicker` actually emits.
  buttonBg?: ThemeBackgroundColor;
  buttonText?: string;
  buttonBorderShow?: boolean;
  buttonBorderColor?: string;
  buttonBorderWidth?: string;
  /** Border style — mirrors `imageBorderStyle`. When absent the CSS layer
   *  falls back to `buttonBorderShow` (true → "solid", false → "none"). */
  buttonBorderStyle?: string;
  buttonHoverBg?: ThemeBackgroundColor;
  buttonHoverText?: string;
  buttonPressedBg?: ThemeBackgroundColor;
  buttonPressedText?: string;
  buttonActiveBg?: ThemeBackgroundColor;
  buttonActiveText?: string;
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
  visualizerBar: "#ffffff",
  visualizerBarAlt: "#9ca3af",
  visualizerGlow: "#ffffff",
  cardBgColor: "#000000",
  cardBgOpacity: 50,
  cardBackdropFilter: [{ id: "default-blur", kind: "blur" as const, px: 8 }],
  playlistContainerEnabled: true,
  playlistBg: { type: "solid" as const, color: "#000000", opacity: 50 },
  playlistBackdropFilter: [{ id: "default-blur", kind: "blur" as const, px: 8 }],
  buttonBorderRadius: 24,
  playButtonBorderRadius: 9999,
  playButtonBg: { type: "solid" as const, color: "#ffffff", opacity: 100 },
  playButtonIconColor: "#000000",
  buttonBg: { type: "solid" as const, color: "#ffffff", opacity: 100 },
  buttonText: "#000000",
  buttonBorderShow: false,
  buttonBorderColor: "#374151",
  buttonBorderWidth: "1px",
  buttonBorderStyle: "none",
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
  visualizerBar: "#111827",
  visualizerBarAlt: "#4b5563",
  visualizerGlow: "#111827",
  cardBgColor: "#000000",
  cardBgOpacity: 50,
  cardBackdropFilter: [{ id: "default-blur", kind: "blur" as const, px: 8 }],
  playlistContainerEnabled: true,
  playlistBg: { type: "solid" as const, color: "#000000", opacity: 50 },
  playlistBackdropFilter: [{ id: "default-blur", kind: "blur" as const, px: 8 }],
  buttonBorderRadius: 24,
  playButtonBorderRadius: 9999,
  playButtonBg: { type: "solid" as const, color: "#ffffff", opacity: 100 },
  playButtonIconColor: "#000000",
  buttonBg: { type: "solid" as const, color: "#000000", opacity: 100 },
  buttonText: "#ffffff",
  buttonBorderShow: false,
  buttonBorderColor: "#d1d5db",
  buttonBorderWidth: "1px",
  buttonBorderStyle: "none",
};

export const defaultTheme: ThemeSettings = defaultDarkTheme;

function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    return `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, ${alpha})`;
  }
  return `rgba(0, 0, 0, ${alpha})`;
}

// -----------------------------------------------------------------------------
// Sub-normalizers — mirrors the helpers in @secretlobby/theme.
// -----------------------------------------------------------------------------

function normalizeImageRecord(
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
    ...(overlay ? { overlay } : {}),
  };
}

function normalizeColorPartRecord(
  b: Record<string, unknown>
): ThemeBackgroundColor | null {
  if (b.type === "swatch-ref" && typeof b.swatchId === "string") {
    return { type: "swatch-ref", swatchId: b.swatchId };
  }
  if (b.type === "solid" && typeof b.color === "string") {
    const opacity = typeof b.opacity === "number" ? b.opacity : 100;
    return { type: "solid", color: b.color, opacity };
  }
  if (b.type === "gradient" && b.gradient && typeof b.gradient === "object") {
    const g = b.gradient as Record<string, unknown>;
    if (g.kind === "linear" && Array.isArray(g.stops)) {
      const angle = typeof g.angle === "number" ? g.angle : 135;
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
      if (stops.length >= 2) {
        return { type: "gradient", gradient: { kind: "linear", angle, stops } };
      }
    }
  }
  return null;
}

/**
 * Coerce any persisted/incoming theme shape into a layered ThemeBackground
 * (`{ color, image? }`). Handles four legacy single-variant shapes
 * (solid / gradient / swatch-ref / image) plus the new layered shape.
 * Legacy single-variant `image` is paired with a default solid black color
 * underneath so the image now overlays on a neutral base.
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

    // Legacy single-variant shapes (have a top-level `type` discriminator).
    if ("type" in b) {
      if (b.type === "image") {
        const image = normalizeImageRecord(b);
        if (image) {
          return {
            color: { type: "solid", color: "#000000", opacity: 100 },
            image,
          };
        }
        return fallback;
      }
      const colorPart = normalizeColorPartRecord(b);
      if (colorPart) return { color: colorPart };
      return fallback;
    }

    // New layered shape: { color, image? }.
    if ("color" in b && b.color && typeof b.color === "object") {
      const colorPart = normalizeColorPartRecord(
        b.color as Record<string, unknown>
      );
      if (!colorPart) return fallback;
      let image: ImageBackground | undefined;
      if (b.image && typeof b.image === "object") {
        const normalized = normalizeImageRecord(
          b.image as Record<string, unknown>
        );
        if (normalized) image = normalized;
      }
      return image ? { color: colorPart, image } : { color: colorPart };
    }
  }
  const bgPrimary = (raw as { bgPrimary?: unknown }).bgPrimary;
  if (typeof bgPrimary === "string" && bgPrimary.length > 0) {
    return { color: { type: "solid", color: bgPrimary, opacity: 100 } };
  }
  return fallback;
}

// Neutral fallback for an unresolved swatch-ref. Matches the package-level
// helper in @secretlobby/theme.
const SWATCH_REF_FALLBACK_LOCAL = "#888888";

function resolveSwatchRefLocal(
  ref: SwatchRef,
  swatches: AccountSwatch[] | undefined
): { type: "solid"; color: string; opacity: number } | { type: "gradient"; gradient: LinearGradient } | null {
  if (!swatches) return null;
  const found = swatches.find((s) => s.id === ref.swatchId);
  return found ? found.value : null;
}

/** Render the color layer of a ThemeBackground as a CSS string. */
export function colorPartToCSS(
  color: ThemeBackgroundColor,
  swatches?: AccountSwatch[]
): string {
  if (color.type === "swatch-ref") {
    const resolved = resolveSwatchRefLocal(color, swatches);
    if (!resolved) return SWATCH_REF_FALLBACK_LOCAL;
    return colorPartToCSS(resolved, swatches);
  }
  if (color.type === "gradient") {
    const stops = [...color.gradient.stops].sort((a, b) => a.position - b.position);
    const parts = stops.map(
      (s) => `${hexToRgba(s.color, (s.opacity ?? 100) / 100)} ${s.position}%`
    );
    return `linear-gradient(${color.gradient.angle}deg, ${parts.join(", ")})`;
  }
  // solid
  const opacity = color.opacity ?? 100;
  if (opacity >= 100) return color.color;
  return hexToRgba(color.color, opacity / 100);
}

/**
 * Render a layered ThemeBackground (`{ color, image? }`) as a CSS string for
 * the `background:` shorthand. Stack order: overlay (top) > image > color
 * (bottom). The trailing color layer acts as `background-color` and shows
 * through any transparency in the image.
 */
export function backgroundToCSS(
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

export interface SiteContent {
  background: string;
  backgroundDark?: string;
  banner: string;
  bannerDark?: string;
  profilePic?: string;
  profilePicDark?: string;
  bandName?: string;
  bandDescription?: string;
  playlist: Track[];
  sitePassword?: string;
  theme?: ThemeSettings;
  allowUserColorMode?: boolean;
}

const CONTENT_PATH = join(process.cwd(), "content", "site.json");

export async function getSiteContent(): Promise<SiteContent> {
  try {
    const content = await readFile(CONTENT_PATH, "utf-8");
    return JSON.parse(content);
  } catch {
    return {
      background: "default-bg.jpg",
      banner: "default-banner.png",
      profilePic: "",
      bandName: "",
      bandDescription: "",
      playlist: [],
    };
  }
}

export async function getSitePassword(): Promise<string> {
  const content = await getSiteContent();
  return content.sitePassword || process.env.SITE_PASSWORD || "";
}

export async function getThemeSettings(): Promise<ThemeSettings> {
  const content = await getSiteContent();
  const theme = (content.theme || defaultTheme) as ThemeSettings;
  if (!theme.colorMode) {
    theme.colorMode = "dark";
  }
  // Migrate legacy bgPrimary/bgSecondary/bgTertiary at read time.
  theme.background = normalizeThemeBackground(theme);
  // Coerce border-radius fields — accepts both legacy number JSON and new
  // per-corner object JSON. Default-mode `defaultTheme` doesn't set these, so
  // a missing field stays `undefined` here for consumers' own defaults.
  if ((theme as Record<string, unknown>).cardBorderRadius !== undefined) {
    theme.cardBorderRadius = normalizeBorderRadius(
      (theme as Record<string, unknown>).cardBorderRadius
    );
  }
  if ((theme as Record<string, unknown>).buttonBorderRadius !== undefined) {
    theme.buttonBorderRadius = normalizeBorderRadius(
      (theme as Record<string, unknown>).buttonBorderRadius
    );
  }
  if ((theme as Record<string, unknown>).playButtonBorderRadius !== undefined) {
    theme.playButtonBorderRadius = normalizeBorderRadius(
      (theme as Record<string, unknown>).playButtonBorderRadius
    );
  }
  if ((theme as Record<string, unknown>).visualizerBorderRadius !== undefined) {
    theme.visualizerBorderRadius = normalizeBorderRadius(
      (theme as Record<string, unknown>).visualizerBorderRadius
    );
  }
  return theme;
}

// Small color helpers used to derive button hover/pressed defaults.
function clamp255(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function parseHexToRgbLocal(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  };
}

function rgbToHexLocal(r: number, g: number, b: number): string {
  const h = (n: number) => clamp255(n).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

function darkenHexLocal(hex: string, amount: number): string {
  const rgb = parseHexToRgbLocal(hex);
  if (!rgb) return hex;
  const factor = 1 - amount;
  return rgbToHexLocal(rgb.r * factor, rgb.g * factor, rgb.b * factor);
}

function darkenColorPartLocal(
  color: ThemeBackgroundColor,
  amount: number,
  swatches?: AccountSwatch[]
): ThemeBackgroundColor {
  if (color.type === "swatch-ref") {
    const resolved = resolveSwatchRefLocal(color, swatches);
    if (!resolved) {
      return { type: "solid", color: darkenHexLocal(SWATCH_REF_FALLBACK_LOCAL, amount), opacity: 100 };
    }
    return darkenColorPartLocal(resolved, amount, swatches);
  }
  if (color.type === "solid") {
    return { ...color, color: darkenHexLocal(color.color, amount) };
  }
  const g = color.gradient;
  const stops = g.stops.map((s) => ({ ...s, color: darkenHexLocal(s.color, amount) }));
  return { type: "gradient", gradient: { kind: "linear", angle: g.angle, stops } };
}

function colorPartFirstColorLocal(
  color: ThemeBackgroundColor,
  swatches?: AccountSwatch[]
): string {
  if (color.type === "swatch-ref") {
    const resolved = resolveSwatchRefLocal(color, swatches);
    if (!resolved) return SWATCH_REF_FALLBACK_LOCAL;
    return colorPartFirstColorLocal(resolved, swatches);
  }
  return color.type === "solid" ? color.color : color.gradient.stops[0]?.color ?? "#000000";
}

export function generateThemeCSS(
  theme: ThemeSettings,
  swatches?: AccountSwatch[]
): string {
  const colorScheme = theme.colorMode === "light" ? "light" : "dark";
  const bg = normalizeThemeBackground(theme);
  const bgCSS = backgroundToCSS(bg, swatches);

  // Image-bg layout vars (auto/center/no-repeat defaults for non-image bg).
  const imageBgLocal = bg.image ?? null;
  const bgSize = imageBgLocal?.size ?? "auto";
  const bgPosition = imageBgLocal?.position ?? "center";
  const bgRepeat = imageBgLocal?.repeat ?? "no-repeat";

  // Button CSS — base + derived hover/pressed/active when overrides absent.
  const btnBg: ThemeBackgroundColor = theme.buttonBg ?? { type: "solid", color: "#ffffff", opacity: 100 };
  const btnText = theme.buttonText ?? "#000000";
  const btnBorderShow = theme.buttonBorderShow ?? false;
  const btnBorderColor = theme.buttonBorderColor ?? theme.border;
  const btnBorderWidth = theme.buttonBorderWidth ?? "1px";
  // Effective border style: prefer `buttonBorderStyle`, else fall back to the
  // legacy `buttonBorderShow` boolean (true → "solid", false → "none").
  const btnBorderStyle =
    theme.buttonBorderStyle ?? (btnBorderShow ? "solid" : "none");
  const hoverBg: ThemeBackgroundColor = theme.buttonHoverBg ?? { type: "solid", color: btnText, opacity: 100 };
  const hoverText = theme.buttonHoverText ?? colorPartFirstColorLocal(btnBg, swatches);
  const pressedBg: ThemeBackgroundColor = theme.buttonPressedBg ?? darkenColorPartLocal(hoverBg, 0.1, swatches);
  const pressedText = theme.buttonPressedText ?? darkenHexLocal(hoverText, 0.1);
  const activeBg: ThemeBackgroundColor = theme.buttonActiveBg ?? darkenColorPartLocal(hoverBg, 0.1, swatches);
  const activeText = theme.buttonActiveText ?? darkenHexLocal(hoverText, 0.1);

  // Unified --color-bg. Legacy --color-bg-primary/-secondary/-tertiary are
  // aliased to var(--color-bg) so existing CSS keeps working.
  return [
    `color-scheme: ${colorScheme}`,
    `--color-mode: ${theme.colorMode}`,
    `--color-bg: ${bgCSS}`,
    `--color-bg-primary: var(--color-bg)`,
    `--color-bg-secondary: var(--color-bg)`,
    `--color-bg-tertiary: var(--color-bg)`,
    `--bg-size: ${bgSize}`,
    `--bg-position: ${bgPosition}`,
    `--bg-repeat: ${bgRepeat}`,
    `--color-text-primary: ${theme.textPrimary}`,
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
    // Button base (color-only — no image overlay).
    `--btn-bg: ${colorPartToCSS(btnBg, swatches)}`,
    `--btn-text: ${btnText}`,
    `--btn-border-color: ${btnBorderColor}`,
    `--btn-border-width: ${btnBorderWidth}`,
    `--btn-border-style: ${btnBorderStyle}`,
    `--btn-border-show: ${btnBorderStyle !== "none" ? 1 : 0}`,
    // Button states.
    `--btn-hover-bg: ${colorPartToCSS(hoverBg, swatches)}`,
    `--btn-hover-text: ${hoverText}`,
    `--btn-pressed-bg: ${colorPartToCSS(pressedBg, swatches)}`,
    `--btn-pressed-text: ${pressedText}`,
    `--btn-active-bg: ${colorPartToCSS(activeBg, swatches)}`,
    `--btn-active-text: ${activeText}`,
  ].join("; ");
}

export async function getAllowUserColorMode(): Promise<boolean> {
  const content = await getSiteContent();
  return content.allowUserColorMode !== false;
}

/**
 * Fetch the account's swatch library — used to resolve `swatch-ref` entries in
 * the persisted theme JSON at SSR time. Mirrors the console's
 * `listSwatchesByAccount` query but lives here so the lobby app doesn't need
 * a cross-app import.
 *
 * Returns a structurally-typed `AccountSwatch[]` so the value column's
 * runtime shape (validated implicitly by the type cast) can flow straight
 * into `backgroundToCSS` / `generateThemeCSS`. Swatch values are stored as
 * concrete Solid/Gradient JSON — no nesting.
 */
export async function getSwatchesByAccountId(
  accountId: string
): Promise<AccountSwatch[]> {
  const rows = await prisma.swatch.findMany({
    where: { accountId },
    select: { id: true, value: true },
  });
  return rows.map((r) => ({
    id: r.id,
    value: r.value as AccountSwatch["value"],
  }));
}
