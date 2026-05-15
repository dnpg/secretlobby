import type { CSSProperties } from "react";
import { borderRadiusToCSS } from "~/lib/theme";
import { ImageIcon } from "../../icons";
import type { ImageBlockContent, ThemeSettings } from "../../state/types";

interface ImageBlockProps {
  content: ImageBlockContent;
  theme: ThemeSettings;
}

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
  const hasResponsiveImages = content.tabletMediaUrl || content.mobileMediaUrl;

  // Both `imageBorderRadius` (block-level override) and `theme.cardBorderRadius`
  // (fallback) are a `BorderRadius` — a plain number for uniform corners or a
  // per-corner object. Route both through `borderRadiusToCSS` so the emitted
  // CSS is always valid shorthand regardless of which shape is stored.
  const borderRadius =
    content.imageBorderRadius !== undefined
      ? borderRadiusToCSS(content.imageBorderRadius)
      : borderRadiusToCSS(theme.cardBorderRadius, 12);

  const imgStyle: CSSProperties = {
    width: "100%",
    height: "auto",
    display: "block",
    borderRadius,
  };

  // Render image with picture element for responsive images
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

    if (hasResponsiveImages) {
      // Use picture element for responsive images (SEO & performance optimized).
      // The outer <picture> still inherits the natural sizing of whichever
      // <source>/<img> is selected, so applying `imgStyle` to the <img> is
      // enough — the picture element wraps it transparently.
      return (
        <picture>
          {content.mobileMediaUrl && (
            <source
              media="(max-width: 767px)"
              srcSet={content.mobileMediaUrl}
            />
          )}
          {content.tabletMediaUrl && (
            <source
              media="(max-width: 1023px)"
              srcSet={content.tabletMediaUrl}
            />
          )}
          <img
            src={content.mediaUrl}
            alt={content.alt || ""}
            style={imgStyle}
            loading="lazy"
            decoding="async"
          />
        </picture>
      );
    }

    return (
      <img
        src={content.mediaUrl}
        alt={content.alt || ""}
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

  return (
    <div className="w-full relative">
      {wrappedContent}
      {/* Indicator for responsive images in editor */}
      {hasResponsiveImages && content.mediaUrl && (
        <div className="absolute bottom-1 right-1 flex gap-1">
          {content.tabletMediaUrl && (
            <span className="px-1.5 py-0.5 text-[10px] bg-black/60 text-white rounded" title="Has tablet image">
              T
            </span>
          )}
          {content.mobileMediaUrl && (
            <span className="px-1.5 py-0.5 text-[10px] bg-black/60 text-white rounded" title="Has mobile image">
              M
            </span>
          )}
        </div>
      )}
    </div>
  );
}
