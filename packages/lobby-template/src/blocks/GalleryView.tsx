// =============================================================================
// GalleryView
// -----------------------------------------------------------------------------
// Lobby renderer for the page-builder's gallery block. Three layout modes:
//
//   grid    — `display: grid` with `repeat(columns, 1fr)`.
//   masonry — CSS `column-count` flow with `break-inside: avoid` items.
//   slider  — horizontal flex scroller with scroll-snap, optional autoplay
//             and arrow buttons. Autoplay nudges `scrollLeft` by one item
//             width on each tick and wraps back to 0 when it hits the end.
//
// Image rendering uses the same `useImageTransform` ladder ImageBlockView
// uses, so srcSet URLs hit the same CDN entries as standalone images. Per-
// image `linkUrl` wraps the `<picture>` in an anchor. Borders / per-image
// theme overrides aren't surfaced here — galleries are typically a row of
// uniform images, and the editor only exposes a single `imageBorderRadius`
// override on the gallery as a whole (falling back to `theme.cardBorderRadius`).
//
// Empty state: when no images are configured we render nothing. The editor's
// own GalleryBlock paints an "Add images" placeholder; the lobby has no
// edit affordance to surface so the column just collapses.
// =============================================================================

import { useEffect, useRef, type CSSProperties } from "react";
import { useImageTransform } from "@secretlobby/ui";
import { borderRadiusToCSS, type ThemeSettings } from "@secretlobby/theme";
import type { GalleryBlockContent, GalleryImage } from "./types";

const IMAGE_WIDTHS = [320, 640, 960, 1280, 1600];
const IMAGE_SIZES = "(min-width: 768px) 50vw, 100vw";

export interface GalleryViewProps {
  content: GalleryBlockContent;
  theme: ThemeSettings;
}

export function GalleryView({ content, theme }: GalleryViewProps) {
  const { generateSrcSet, transformUrl } = useImageTransform();
  const sliderRef = useRef<HTMLDivElement>(null);

  const images = Array.isArray(content.images) ? content.images : [];
  const style = content.style ?? "grid";
  const columns = Math.min(6, Math.max(2, content.columns ?? 3));
  const gap = content.gap ?? 8;
  const borderRadius =
    content.imageBorderRadius !== undefined
      ? borderRadiusToCSS(content.imageBorderRadius)
      : borderRadiusToCSS(theme.cardBorderRadius, 0);

  // Slider autoplay — see file header for the wrap behaviour. Effect must
  // run unconditionally (rules of hooks), so the inner body checks the
  // style/autoplay/images.length gates and bails early when they're off.
  useEffect(() => {
    if (style !== "slider") return;
    if (!content.autoplay) return;
    if (images.length <= 1) return;
    const el = sliderRef.current;
    if (!el) return;
    const interval = Math.max(1000, content.autoplayIntervalMs ?? 4000);
    const tick = () => {
      const firstChild = el.firstElementChild as HTMLElement | null;
      const step =
        (firstChild?.getBoundingClientRect().width ?? el.clientWidth) + gap;
      const nearEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
      if (nearEnd) {
        el.scrollTo({ left: 0, behavior: "smooth" });
      } else {
        el.scrollBy({ left: step, behavior: "smooth" });
      }
    };
    const id = window.setInterval(tick, interval);
    return () => window.clearInterval(id);
  }, [
    style,
    content.autoplay,
    content.autoplayIntervalMs,
    images.length,
    gap,
  ]);

  if (images.length === 0) return null;

  const renderImage = (img: GalleryImage, imgStyle: CSSProperties) => {
    // Per-image missing media — render a plain transparent placeholder so
    // the grid/masonry/slider layout still reserves the slot. The lobby
    // never paints a "no image" affordance the way the editor does.
    if (!img.mediaUrl) {
      return <div style={{ ...imgStyle, aspectRatio: "16/9" }} aria-hidden />;
    }
    const srcSet = generateSrcSet(img.mediaUrl, IMAGE_WIDTHS);
    const src = transformUrl(img.mediaUrl, {
      width: IMAGE_WIDTHS[IMAGE_WIDTHS.length - 1],
    });
    const picture = (
      <picture>
        <img
          src={src}
          srcSet={srcSet}
          sizes={IMAGE_SIZES}
          alt={img.alt || ""}
          style={imgStyle}
          loading="lazy"
          decoding="async"
        />
      </picture>
    );
    return img.linkUrl ? (
      <a
        href={img.linkUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block cursor-pointer"
      >
        {picture}
      </a>
    ) : (
      picture
    );
  };

  if (style === "grid") {
    const gridStyle: CSSProperties = {
      display: "grid",
      gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
      gap: `${gap}px`,
    };
    const imgStyle: CSSProperties = {
      width: "100%",
      height: "auto",
      display: "block",
      borderRadius,
    };
    return (
      <div className="w-full" style={gridStyle}>
        {images.map((img) => (
          <div key={img.id}>{renderImage(img, imgStyle)}</div>
        ))}
      </div>
    );
  }

  if (style === "masonry") {
    const columnsStyle: CSSProperties = {
      columnCount: columns,
      columnGap: `${gap}px`,
    };
    const itemStyle: CSSProperties = {
      breakInside: "avoid",
      marginBottom: `${gap}px`,
    };
    const imgStyle: CSSProperties = {
      width: "100%",
      height: "auto",
      display: "block",
      borderRadius,
    };
    return (
      <div className="w-full" style={columnsStyle}>
        {images.map((img) => (
          <div key={img.id} style={itemStyle}>
            {renderImage(img, imgStyle)}
          </div>
        ))}
      </div>
    );
  }

  // Slider mode.
  const sliderStyle: CSSProperties = {
    display: "flex",
    overflowX: "auto",
    scrollSnapType: "x mandatory",
    gap: `${gap}px`,
  };
  const itemStyle: CSSProperties = {
    flex: "0 0 auto",
    width: "clamp(200px, 60%, 480px)",
    scrollSnapAlign: "start",
  };
  const imgStyle: CSSProperties = {
    width: "100%",
    height: "auto",
    display: "block",
    borderRadius,
  };
  const showArrows = (content.showArrows ?? true) && images.length > 1;
  const scrollByItem = (dir: 1 | -1) => {
    const el = sliderRef.current;
    if (!el) return;
    const firstChild = el.firstElementChild as HTMLElement | null;
    const step =
      (firstChild?.getBoundingClientRect().width ?? el.clientWidth) + gap;
    el.scrollBy({ left: step * dir, behavior: "smooth" });
  };
  return (
    <div className="w-full relative">
      <div ref={sliderRef} style={sliderStyle} className="no-scrollbar">
        {images.map((img) => (
          <div key={img.id} style={itemStyle}>
            {renderImage(img, imgStyle)}
          </div>
        ))}
      </div>
      {showArrows && (
        <>
          <button
            type="button"
            onClick={() => scrollByItem(-1)}
            aria-label="Previous image"
            className="absolute top-1/2 left-2 -translate-y-1/2 p-1.5 rounded-full bg-black/60 hover:bg-black/80 text-white cursor-pointer transition-colors"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 19.5L8.25 12l7.5-7.5"
              />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => scrollByItem(1)}
            aria-label="Next image"
            className="absolute top-1/2 right-2 -translate-y-1/2 p-1.5 rounded-full bg-black/60 hover:bg-black/80 text-white cursor-pointer transition-colors"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8.25 4.5l7.5 7.5-7.5 7.5"
              />
            </svg>
          </button>
        </>
      )}
    </div>
  );
}
