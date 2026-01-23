export interface TransformOptions {
  width: number;
  quality?: number;
  format?: string;
}

const PASSTHROUGH = "{url}";

function parseUrl(src: string): { origin: string; path: string } {
  try {
    const url = new URL(src);
    return {
      origin: url.origin,
      path: url.pathname.replace(/^\//, ""),
    };
  } catch {
    return { origin: "", path: src };
  }
}

export function transformUrl(
  src: string,
  options: TransformOptions,
  pattern: string
): string {
  if (!pattern || pattern === PASSTHROUGH) return src;

  const { origin, path } = parseUrl(src);
  const quality = options.quality ?? 80;
  const format = options.format ?? "auto";

  return pattern
    .replace(/\{url\}/g, src)
    .replace(/\{origin\}/g, origin)
    .replace(/\{path\}/g, path)
    .replace(/\{width\}/g, String(options.width))
    .replace(/\{quality\}/g, String(quality))
    .replace(/\{format\}/g, format);
}

export function generateSrcSet(
  src: string,
  widths: number[],
  pattern: string,
  quality?: number
): string {
  return widths
    .map((w) => {
      const url = transformUrl(src, { width: w, quality }, pattern);
      return `${url} ${w}w`;
    })
    .join(", ");
}
