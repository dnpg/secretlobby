import { useEffect, useRef, type CSSProperties } from "react";
import { useImageTransform } from "@secretlobby/ui";
import { borderRadiusToCSS } from "~/lib/theme";
import { GalleryIcon } from "../../icons";
import type {
  GalleryBlockContent,
  GalleryImage,
  ThemeSettings,
} from "../../state/types";

interface GalleryBlockProps {
  content: GalleryBlockContent;
  theme: ThemeSettings;
}

// Single width ladder for all gallery images — wide enough for slider items
// at clamp(200px, 60%, 480px) and grid/masonry cells at 50vw on tablet+. We
// don't reach for the page-builder's `state.viewport` here because galleries
// don't have per-viewport overrides like the single image block does.
const IMAGE_WIDTHS = [320, 640, 960, 1280, 1600];
const IMAGE_SIZES = "(min-width: 768px) 50vw, 100vw";

export function GalleryBlock({ content, theme }: GalleryBlockProps) {
  const { generateSrcSet, transformUrl } = useImageTransform();
  const sliderRef = useRef<HTMLDivElement>(null);

  const images = content.images ?? [];
  const style = content.style ?? "grid";
  const columns = Math.min(6, Math.max(2, content.columns ?? 3));
  const gap = content.gap ?? 8;
  const borderRadius =
    content.imageBorderRadius !== undefined
      ? borderRadiusToCSS(content.imageBorderRadius)
      : borderRadiusToCSS(theme.cardBorderRadius, 0);

  // Slider autoplay: nudge `scrollLeft` by one item width every tick, looping
  // back to 0 when we run out of room. Pauses on cleanup + when autoplay flips
  // off. We don't try to pause on user-drag (see report); the next tick simply
  // resumes from wherever the user left off.
  useEffect(() => {
    if (style !== "slider") return;
    if (!content.autoplay) return;
    if (images.length <= 1) return;
    const el = sliderRef.current;
    if (!el) return;
    const interval = Math.max(1000, content.autoplayIntervalMs ?? 4000);
    const tick = () => {
      if (!el) return;
      const firstChild = el.firstElementChild as HTMLElement | null;
      const step =
        (firstChild?.getBoundingClientRect().width ?? el.clientWidth) + gap;
      const nearEnd =
        el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
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

  if (images.length === 0) {
    return (
      <div
        className="w-full aspect-video bg-theme-tertiary flex items-center justify-center text-gray-500"
        style={{ borderRadius }}
      >
        <div className="text-center">
          <GalleryIcon className="w-8 h-8 mx-auto mb-1" />
          <span className="text-xs">Add images</span>
        </div>
      </div>
    );
  }

  // Per-image renderer — emits a real responsive <picture> with multi-width
  // srcSet so the browser can pick the right asset. Wrapped in an <a> only
  // when the image carries a linkUrl, mirroring ImageBlock's pattern.
  const renderImage = (img: GalleryImage, imgStyle: CSSProperties) => {
    if (!img.mediaUrl) {
      return (
        <div
          className="w-full aspect-video bg-theme-tertiary flex items-center justify-center text-gray-500"
          style={imgStyle}
        >
          <GalleryIcon className="w-6 h-6" />
        </div>
      );
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
    if (img.linkUrl) {
      return (
        <a
          href={img.linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block cursor-pointer"
        >
          {picture}
        </a>
      );
    }
    return picture;
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
    // CSS columns gives us masonry-style flow without any JS measurement. Each
    // item gets `break-inside: avoid` so an image never splits across columns.
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

  // Slider: horizontal flex scroller with CSS scroll-snap. Arrow buttons scroll
  // by one item width. Hidden when there are 0/1 images (no scrolling needed).
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
            onClick={(e) => {
              e.stopPropagation();
              scrollByItem(-1);
            }}
            aria-label="Previous image"
            className="absolute top-1/2 left-2 -translate-y-1/2 p-1.5 rounded-full bg-black/60 hover:bg-black/80 text-white cursor-pointer transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              scrollByItem(1);
            }}
            aria-label="Next image"
            className="absolute top-1/2 right-2 -translate-y-1/2 p-1.5 rounded-full bg-black/60 hover:bg-black/80 text-white cursor-pointer transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </>
      )}
    </div>
  );
}
