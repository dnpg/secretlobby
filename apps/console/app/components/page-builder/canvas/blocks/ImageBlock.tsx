import type { CSSProperties } from "react";
import { useImageTransform } from "@secretlobby/ui";
import { borderRadiusToCSS, normalizeCSSValue } from "~/lib/theme";
import { ImageIcon } from "../../icons";
import { usePageBuilder } from "../../state/provider";
import type { ImageBlockContent, ThemeSettings } from "../../state/types";

// Default placeholder dims for legacy blocks that haven't persisted real
// media dimensions yet. Picked to roughly match a 16:9 desktop image so the
// reserved aspect-ratio is in the right neighbourhood. New picks always
// overwrite these with the real MediaItem dims captured in
// ImageBlockSettings.
const FALLBACK_W = 1920;
const FALLBACK_H = 1080;

// `Number.isFinite` guards against NaN coming out of bad legacy payloads,
// `> 0` keeps the HTML attribute meaningful (0 isn't a useful reservation).
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

interface ImageBlockProps {
  content: ImageBlockContent;
  theme: ThemeSettings;
}

// Width ladders tuned to typical page-builder column widths.
const MOBILE_WIDTHS = [320, 480, 640, 768];
const TABLET_WIDTHS = [640, 768, 1024];
const DESKTOP_WIDTHS = [640, 960, 1280, 1600, 1920];

// `sizes` defaults: a page-builder column is full-width on mobile, often
// halves at tablet, and goes back to whatever flow on desktop.
const MOBILE_SIZES = "100vw";
const TABLET_SIZES = "(min-width: 768px) 50vw, 100vw";
const DESKTOP_SIZES = "100vw";

// Renders an image block onto the canvas. Uses a <picture> element when
// responsive overrides are present (tablet/mobile), otherwise a plain <img>.
//
// Sizing: the image always renders at width:100% / height:auto so the natural
// aspect ratio of the source decides the rendered height — no cropping, no
// fixed-height letterboxing. `display:block` removes the inline-image baseline
// gap.
//
// Border radius: defaults to the theme's `cardBorderRadius` so images visually
// match cards/players. The block content may carry an `imageBorderRadius`
// override (set in ImageBlockSettings) which, when present, wins over the
// theme value.
export function ImageBlock({ content, theme }: ImageBlockProps) {
  const { generateSrcSet, transformUrl } = useImageTransform();
  const { state } = usePageBuilder();
  const simulatedViewport = state.viewport;
  const hasResponsiveImages = content.tabletMediaUrl || content.mobileMediaUrl;

  // The canvas's "preview viewport" is just a resized container on a desktop
  // browser. <source media="(max-width: 767px)"> never matches because the
  // real browser is still 1440px wide. To honour the simulated viewport we
  // emit one extra <source> with `media="(min-width: 0px)"` — always matches,
  // first <source> wins — that points at the override for whichever viewport
  // the user is currently previewing. When the canvas is on Desktop we skip
  // this entirely and let the normal responsive sources work.
  const simulatedOverride =
    simulatedViewport === "mobile" && content.mobileMediaUrl
      ? {
          url: content.mobileMediaUrl,
          widths: MOBILE_WIDTHS,
          sizes: MOBILE_SIZES,
        }
      : simulatedViewport === "tablet" && content.tabletMediaUrl
        ? {
            url: content.tabletMediaUrl,
            widths: TABLET_WIDTHS,
            sizes: TABLET_SIZES,
          }
        : null;

  // Image-specific theme fields are the fallback layer below content
  // overrides; theme defaults set them in defaultDarkTheme / defaultLightTheme
  // so legacy lobbies without these fields persisted still get the global
  // defaults (12px radius, 0px width).
  const themeImageBorderRadius = theme.imageBorderRadius ?? 12;
  const themeImageBorderWidth = theme.imageBorderWidth ?? "0";
  const themeImageBorderColor =
    theme.imageBorderColor ?? theme.border ?? "#000000";
  const themeImageBorderStyle = theme.imageBorderStyle ?? "solid";

  // Both `imageBorderRadius` (block-level override) and
  // `theme.imageBorderRadius` (theme default) are a `BorderRadius` — a plain
  // number for uniform corners or a per-corner object. Route both through
  // `borderRadiusToCSS` so the emitted CSS is always valid shorthand
  // regardless of which shape is stored.
  const borderRadius = borderRadiusToCSS(
    content.imageBorderRadius ?? themeImageBorderRadius,
    12
  );

  // Effective border — each field falls back to the matching theme.image*
  // field (the same field-level override pattern imageBorderRadius uses).
  // The border only paints when the resolved width parses to a positive
  // number; otherwise we skip the declarations entirely (avoids an invisible
  // 0px border that still nudges hit-testing in some browsers).
  const effectiveBorderWidth = normalizeCSSValue(
    content.imageBorderWidth ?? themeImageBorderWidth,
    "0"
  );
  const effectiveBorderColor =
    content.imageBorderColor ?? themeImageBorderColor;
  const effectiveBorderStyle =
    content.imageBorderStyle ?? themeImageBorderStyle;
  // `none` border-style suppresses paint regardless of width — matches the
  // ImageBlockSettings UI rule (style=none hides width + color).
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

  // Intrinsic dimensions for the <img>/<source> HTML attributes. Resolved
  // per-viewport so tablet/mobile <source> tags advertise their own aspect
  // ratios (otherwise the browser reserves desktop space for a mobile crop
  // and you still get layout shift on small screens).
  const desktopW = dimOrFallback(content.mediaWidth, FALLBACK_W);
  const desktopH = dimOrFallback(content.mediaHeight, FALLBACK_H);
  const tabletW = dimOrFallback(content.tabletMediaWidth, desktopW);
  const tabletH = dimOrFallback(content.tabletMediaHeight, desktopH);
  const mobileW = dimOrFallback(content.mobileMediaWidth, desktopW);
  const mobileH = dimOrFallback(content.mobileMediaHeight, desktopH);

  const renderImage = () => {
    if (!content.mediaUrl) {
      return (
        <div
          className="w-full aspect-video bg-theme-tertiary flex items-center justify-center text-gray-500"
          style={{ borderRadius }}
        >
          <div className="text-center">
            <ImageIcon className="w-8 h-8 mx-auto mb-1" />
            <span className="text-xs">Add Image</span>
          </div>
        </div>
      );
    }

    // Fallback (desktop) srcSet + a high-width src so older browsers ignoring
    // srcSet still get a reasonable resolution.
    const desktopSrcSet = generateSrcSet(content.mediaUrl, DESKTOP_WIDTHS);
    const desktopSrc = transformUrl(content.mediaUrl, {
      width: DESKTOP_WIDTHS[DESKTOP_WIDTHS.length - 1],
    });

    if (hasResponsiveImages) {
      // Real responsive <picture>: each <source> carries a multi-width srcSet
      // with `w` descriptors plus a `sizes` attribute so the browser can pick
      // the right asset for the viewport/DPR. The `simulatedOverride` source
      // sits first with an always-matching media query so the canvas honours
      // the page-builder's previewed viewport (Mobile / Tablet) regardless of
      // the real browser width.
      // Each <source> declares its intrinsic width/height so the browser can
      // reserve the right aspect ratio per breakpoint before any pixel data
      // arrives. The simulated-override <source> reuses whichever viewport
      // the canvas is previewing; the real responsive sources use their own
      // tablet/mobile dims when available, or fall back to the desktop pair.
      const simulatedDims =
        simulatedViewport === "mobile"
          ? { w: mobileW, h: mobileH }
          : simulatedViewport === "tablet"
            ? { w: tabletW, h: tabletH }
            : { w: desktopW, h: desktopH };
      return (
        <picture>
          {simulatedOverride && (
            <source
              media="(min-width: 0px)"
              srcSet={generateSrcSet(
                simulatedOverride.url,
                simulatedOverride.widths
              )}
              sizes={simulatedOverride.sizes}
              width={simulatedDims.w}
              height={simulatedDims.h}
            />
          )}
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
      );
    }

    return (
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
  };

  const imageContent = renderImage();

  // Wrap with link if linkUrl is set
  const wrappedContent = content.linkUrl ? (
    <a
      href={content.linkUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="block w-full cursor-pointer"
    >
      {imageContent}
    </a>
  ) : imageContent;

  return <div className="w-full relative">{wrappedContent}</div>;
}
