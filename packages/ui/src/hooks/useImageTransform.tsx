import { createContext, useContext, useMemo } from "react";
import {
  transformUrl as baseTransformUrl,
  generateSrcSet as baseGenerateSrcSet,
  type TransformOptions,
} from "../lib/image-transform.js";

interface ImageTransformContextValue {
  pattern: string;
  quality: number;
}

const ImageTransformContext = createContext<ImageTransformContextValue>({
  pattern: "{url}",
  quality: 80,
});

interface ImageTransformProviderProps {
  pattern: string;
  quality?: number;
  children: React.ReactNode;
}

export function ImageTransformProvider({
  pattern,
  quality = 80,
  children,
}: ImageTransformProviderProps) {
  const value = useMemo(() => ({ pattern, quality }), [pattern, quality]);
  return (
    <ImageTransformContext.Provider value={value}>
      {children}
    </ImageTransformContext.Provider>
  );
}

export function useImageTransform() {
  const { pattern, quality: defaultQuality } =
    useContext(ImageTransformContext);

  return useMemo(
    () => ({
      transformUrl(src: string, options: TransformOptions) {
        return baseTransformUrl(
          src,
          { ...options, quality: options.quality ?? defaultQuality },
          pattern
        );
      },
      generateSrcSet(src: string, widths: number[], quality?: number) {
        return baseGenerateSrcSet(
          src,
          widths,
          pattern,
          quality ?? defaultQuality
        );
      },
    }),
    [pattern, defaultQuality]
  );
}
