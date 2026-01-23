import { useImageTransform } from "../hooks/useImageTransform.js";

const DEFAULT_WIDTHS = [320, 640, 960, 1280, 1920];

interface ResponsiveImageProps
  extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  widths?: number[];
  sizes?: string;
  quality?: number;
  loading?: "lazy" | "eager";
}

export function ResponsiveImage({
  src,
  alt,
  widths = DEFAULT_WIDTHS,
  sizes,
  quality,
  loading = "lazy",
  ...rest
}: ResponsiveImageProps) {
  const { generateSrcSet, transformUrl } = useImageTransform();

  const srcSet = generateSrcSet(src, widths, quality);
  const fallbackSrc = transformUrl(src, {
    width: widths[widths.length - 1],
    quality,
  });

  return (
    <img
      src={fallbackSrc}
      srcSet={srcSet}
      sizes={sizes}
      alt={alt}
      loading={loading}
      {...rest}
    />
  );
}
