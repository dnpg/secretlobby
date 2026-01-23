import { useImageTransform } from "../hooks/useImageTransform.js";

const DEFAULT_WIDTHS = [320, 640, 960, 1280, 1920];

interface PictureSource {
  media: string;
  src: string;
  widths?: number[];
  sizes?: string;
}

interface PictureImageProps {
  sources: PictureSource[];
  fallback: {
    src: string;
    widths?: number[];
    sizes?: string;
  };
  alt: string;
  quality?: number;
  loading?: "lazy" | "eager";
  className?: string;
}

export function PictureImage({
  sources,
  fallback,
  alt,
  quality,
  loading = "lazy",
  className,
}: PictureImageProps) {
  const { generateSrcSet, transformUrl } = useImageTransform();

  const fallbackWidths = fallback.widths ?? DEFAULT_WIDTHS;
  const fallbackSrcSet = generateSrcSet(fallback.src, fallbackWidths, quality);
  const fallbackSrc = transformUrl(fallback.src, {
    width: fallbackWidths[fallbackWidths.length - 1],
    quality,
  });

  return (
    <picture className={className}>
      {sources.map((source) => {
        const sourceWidths = source.widths ?? DEFAULT_WIDTHS;
        const srcSet = generateSrcSet(source.src, sourceWidths, quality);
        return (
          <source
            key={source.media}
            media={source.media}
            srcSet={srcSet}
            sizes={source.sizes}
          />
        );
      })}
      <img
        src={fallbackSrc}
        srcSet={fallbackSrcSet}
        sizes={fallback.sizes}
        alt={alt}
        loading={loading}
      />
    </picture>
  );
}

export type { PictureSource, PictureImageProps };
