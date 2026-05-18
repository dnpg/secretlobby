// =============================================================================
// ImageBlockView
// -----------------------------------------------------------------------------
// Lobby-side renderer for the page-builder's image block. Renders a
// `<picture>` element when any responsive override is set
// (`tabletMediaUrl` / `mobileMediaUrl`); otherwise a plain `<img>`. Borders,
// border-radius, and the optional link wrapper all flow from the same data
// the editor saves, so the lobby paints exactly what the designer sees in
// the canvas.
//
// What this view does NOT do:
//   - Editor placeholder (the "Add Image" empty state). The lobby never
//     renders an unfilled image block — we return `null` so the column
//     collapses naturally.
//   - Simulated-viewport overrides. The lobby is on a real device; real
//     media queries pick the right source. The editor's preview canvas
//     wraps this view with its own simulated-viewport <source> when it
//     migrates.
//
// Border-radius and per-block border overrides fall back to the matching
// theme.image* tokens — same fallback chain the editor uses. A `none`
// border-style or zero width suppresses border paint entirely.
// =============================================================================

import type { CSSProperties } from "react";
import { useImageTransform } from "@secretlobby/ui";
import { borderRadiusToCSS, normalizeCSSValue } from "@secretlobby/theme";
import type { ImageBlockContent, ThemeSettings } from "./types";

// Default placeholder dims for legacy blocks that haven't persisted real
// media dimensions yet. Picked to roughly match a 16:9 desktop image so the
// reserved aspect-ratio is in the right neighbourhood. New picks always
// overwrite these with the real MediaItem dims captured at block-edit time.
const FALLBACK_W = 1920;
const FALLBACK_H = 1080;

// `Number.isFinite` guards against NaN from bad legacy payloads; `> 0` keeps
// the HTML width/height attribute meaningful (0 isn't a useful reservation).
function dimOrFallback(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

// Parse a CSS length to its numeric prefix — same trick CardBlock uses to
// decide whether the border has positive width. Empty / non-numeric → 0,
// which gates the border off.
function cssLengthToNum(value: string | undefined): number {
  if (!value) return 0;
  const m = String(value).trim().match(/^-?[\d.]+/);
  if (!m) return 0;
  const n = parseFloat(m[0]);
  return Number.isFinite(n) ? n : 0;
}

// Width ladders tuned to typical page-builder column widths. Kept identical
// to the editor so cached srcSet URLs hit the same CDN entries regardless of
// which surface emitted the markup.
const MOBILE_WIDTHS = [320, 480, 640, 768];
const TABLET_WIDTHS = [640, 768, 1024];
const DESKTOP_WIDTHS = [640, 960, 1280, 1600, 1920];

const MOBILE_SIZES = "100vw";
const TABLET_SIZES = "(min-width: 768px) 50vw, 100vw";
const DESKTOP_SIZES = "100vw";

export interface ImageBlockViewProps {
  content: ImageBlockContent;
  theme: ThemeSettings;
}

export function ImageBlockView({ content, theme }: ImageBlockViewProps) {
  const { generateSrcSet, transformUrl } = useImageTransform();
  const hasResponsiveImages = content.tabletMediaUrl || content.mobileMediaUrl;

  // Image-specific theme fields are the fallback layer below content
  // overrides; theme defaults set them in defaultDarkTheme / defaultLightTheme
  // so legacy lobbies without these fields persisted still get the global
  // defaults (12px radius, 0px width).
  const themeImageBorderRadius = theme.imageBorderRadius ?? 12;
  const themeImageBorderWidth = theme.imageBorderWidth ?? "0";
  const themeImageBorderColor =
    theme.imageBorderColor ?? theme.border ?? "#000000";
  const themeImageBorderStyle = theme.imageBorderStyle ?? "solid";

  // Both block-level and theme-level radii are `BorderRadius` (number for
  // uniform, `{ tl, tr, br, bl }` for per-corner). Route both through the
  // helper so the emitted CSS is always valid shorthand.
  const borderRadius = borderRadiusToCSS(
    content.imageBorderRadius ?? themeImageBorderRadius,
    12
  );

  // Effective border — each field falls back to the matching theme.image*
  // field. The border only paints when the resolved width parses to a
  // positive number AND the style isn't `none`; otherwise we drop the
  // declarations entirely so the image doesn't paint an invisible 0px border
  // that some browsers still treat as a hit-test boundary.
  const effectiveBorderWidth = normalizeCSSValue(
    content.imageBorderWidth ?? themeImageBorderWidth,
    "0"
  );
  const effectiveBorderColor =
    content.imageBorderColor ?? themeImageBorderColor;
  const effectiveBorderStyle =
    content.imageBorderStyle ?? themeImageBorderStyle;
  const hasBorder =
    effectiveBorderStyle !== "none" &&
    cssLengthToNum(effectiveBorderWidth) > 0;

  const imgStyle: CSSProperties = {
    width: "100%",
    height: "auto",
    display: "block",
    borderRadius,
    ...(hasBorder
      ? {
          borderWidth: effectiveBorderWidth,
          borderStyle: effectiveBorderStyle,
          borderColor: effectiveBorderColor,
        }
      : {}),
  };

  // No media at all — render nothing. The lobby has no edit affordance to
  // surface "click here to add an image", and the empty state shouldn't
  // reserve space on the page.
  if (!content.mediaUrl) return null;

  // Intrinsic dimensions for the <img>/<source> HTML attributes. Resolved
  // per-viewport so tablet/mobile <source> tags advertise their own aspect
  // ratios — otherwise the browser reserves desktop space for a mobile crop
  // and you still get layout shift on small screens.
  const desktopW = dimOrFallback(content.mediaWidth, FALLBACK_W);
  const desktopH = dimOrFallback(content.mediaHeight, FALLBACK_H);
  const tabletW = dimOrFallback(content.tabletMediaWidth, desktopW);
  const tabletH = dimOrFallback(content.tabletMediaHeight, desktopH);
  const mobileW = dimOrFallback(content.mobileMediaWidth, desktopW);
  const mobileH = dimOrFallback(content.mobileMediaHeight, desktopH);

  const desktopSrcSet = generateSrcSet(content.mediaUrl, DESKTOP_WIDTHS);
  const desktopSrc = transformUrl(content.mediaUrl, {
    width: DESKTOP_WIDTHS[DESKTOP_WIDTHS.length - 1],
  });

  const imageContent = hasResponsiveImages ? (
    <picture>
      {content.mobileMediaUrl && (
        <source
          media="(max-width: 767px)"
          srcSet={generateSrcSet(content.mobileMediaUrl, MOBILE_WIDTHS)}
          sizes={MOBILE_SIZES}
          width={mobileW}
          height={mobileH}
        />
      )}
      {content.tabletMediaUrl && (
        <source
          media="(min-width: 768px) and (max-width: 1023px)"
          srcSet={generateSrcSet(content.tabletMediaUrl, TABLET_WIDTHS)}
          sizes={TABLET_SIZES}
          width={tabletW}
          height={tabletH}
        />
      )}
      <img
        src={desktopSrc}
        srcSet={desktopSrcSet}
        sizes={DESKTOP_SIZES}
        alt={content.alt || ""}
        width={desktopW}
        height={desktopH}
        style={imgStyle}
        loading="lazy"
        decoding="async"
      />
    </picture>
  ) : (
    <img
      src={desktopSrc}
      srcSet={desktopSrcSet}
      sizes={DESKTOP_SIZES}
      alt={content.alt || ""}
      width={desktopW}
      height={desktopH}
      style={imgStyle}
      loading="lazy"
      decoding="async"
    />
  );

  const wrappedContent = content.linkUrl ? (
    <a
      href={content.linkUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="block w-full cursor-pointer"
    >
      {imageContent}
    </a>
  ) : (
    imageContent
  );

  return <div className="w-full relative">{wrappedContent}</div>;
}
