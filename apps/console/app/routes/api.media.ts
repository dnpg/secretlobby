import { data } from "react-router";
import type { Route } from "./+types/api.media";
import type { Media } from "@secretlobby/db";
import { createLogger, formatError } from "@secretlobby/logger";

const logger = createLogger({ service: "console:api:media" });

type MediaType = "IMAGE" | "AUDIO" | "VIDEO" | "EMBED";

export interface MediaItem {
  id: string;
  filename: string;
  key: string;
  mimeType: string;
  size: number;
  type: MediaType;
  width: number | null;
  height: number | null;
  duration: number | null;
  alt: string | null;
  hlsReady: boolean;
  waveformPeaks: unknown;
  metadata: unknown;
  provider: string | null;
  embedUrl: string | null;
  url: string;
  createdAt: string;
}

function getMediaType(mimeType: string): MediaType {
  if (mimeType.startsWith("image/")) return "IMAGE";
  if (mimeType.startsWith("audio/")) return "AUDIO";
  if (mimeType.startsWith("video/")) return "VIDEO";
  return "IMAGE";
}

function handleize(filename: string): string {
  // Remove extension
  const name = filename.replace(/\.[^/.]+$/, "");
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[^a-z0-9]+/g, "-")    // non-alphanumeric → hyphen
    .replace(/-{2,}/g, "-")         // collapse multiple hyphens
    .replace(/^-|-$/g, "")          // trim leading/trailing hyphens
    || "file";                       // fallback if nothing remains
}

function detectEmbedProvider(url: string): { provider: "YOUTUBE" | "VIMEO"; embedUrl: string } | null {
  // YouTube
  const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch) {
    return {
      provider: "YOUTUBE",
      embedUrl: `https://www.youtube.com/embed/${ytMatch[1]}`,
    };
  }

  // Vimeo
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) {
    return {
      provider: "VIMEO",
      embedUrl: `https://player.vimeo.com/video/${vimeoMatch[1]}`,
    };
  }

  return null;
}

// GET - List/search media
export async function loader({ request }: Route.LoaderArgs) {
  // Server-only imports
  const { getSession, requireUserAuth } = await import("@secretlobby/auth");
  const { getPublicUrl } = await import("@secretlobby/storage");
  const { getMediaByAccountId } = await import("~/models/queries/media.server");

  function mediaToItem(media: Media): MediaItem {
    return {
      id: media.id,
      filename: media.filename,
      key: media.key,
      mimeType: media.mimeType,
      size: media.size,
      type: media.type as MediaType,
      width: media.width,
      height: media.height,
      duration: media.duration,
      alt: media.alt,
      hlsReady: media.hlsReady,
      waveformPeaks: media.waveformPeaks,
      metadata: media.metadata,
      provider: media.provider,
      embedUrl: media.embedUrl,
      url: media.type === "EMBED" ? (media.embedUrl || "") : getPublicUrl(media.key),
      createdAt: media.createdAt.toISOString(),
    };
  }

  const { session } = await getSession(request);
  requireUserAuth(session);

  const accountId = session.currentAccountId;
  if (!accountId) {
    throw data({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const search = url.searchParams.get("search");
  const cursor = url.searchParams.get("cursor") || undefined;
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20", 10), 50);

  const typeArray = type ? type.split(",").filter(Boolean) : undefined;

  const items = await getMediaByAccountId(accountId, {
    take: limit,
    cursor,
    type: typeArray,
    search: search || undefined,
  });

  const hasMore = items.length > limit;
  const results = hasMore ? items.slice(0, limit) : items;
  const nextCursor = hasMore ? results[results.length - 1]?.id ?? null : null;

  return data({
    items: results.map(mediaToItem),
    nextCursor,
  });
}

// POST/PATCH/DELETE - Manage media
export async function action({ request }: Route.ActionArgs) {
  // Server-only imports
  const { getSession, requireUserAuth } = await import("@secretlobby/auth");
  const { uploadFile, deleteFile, getPublicUrl, generateHls, deleteHlsFiles, getMediaFolder } = await import("@secretlobby/storage");
  const sharp = (await import("sharp")).default;
  const { getMediaByIdAndAccountId } = await import("~/models/queries/media.server");
  const { createMedia, updateMediaAlt, updateMediaHls, deleteMedia } = await import("~/models/mutations/media.server");

  function mediaToItem(media: Media): MediaItem {
    return {
      id: media.id,
      filename: media.filename,
      key: media.key,
      mimeType: media.mimeType,
      size: media.size,
      type: media.type as MediaType,
      width: media.width,
      height: media.height,
      duration: media.duration,
      alt: media.alt,
      hlsReady: media.hlsReady,
      waveformPeaks: media.waveformPeaks,
      metadata: media.metadata,
      provider: media.provider,
      embedUrl: media.embedUrl,
      url: media.type === "EMBED" ? (media.embedUrl || "") : getPublicUrl(media.key),
      createdAt: media.createdAt.toISOString(),
    };
  }

  function generateHlsForMediaInBackground(mediaId: string, buffer: Buffer, mediaFolder: string) {
    (async () => {
      try {
        const result = await generateHls(buffer, mediaFolder);
        await updateMediaHls(mediaId, {
          hlsReady: true,
          waveformPeaks: result.waveformPeaks,
          duration: result.duration > 0 ? result.duration : undefined,
        });
      } catch (e) {
        logger.error(
          { mediaId, error: formatError(e) },
          "Background HLS generation failed"
        );
      }
    })();
  }

  const { session } = await getSession(request);
  requireUserAuth(session);

  const accountId = session.currentAccountId;
  if (!accountId) {
    throw data({ error: "Not authenticated" }, { status: 401 });
  }

  if (request.method === "PATCH") {
    const body = await request.json();
    const { id, alt } = body as { id: string; alt: string };

    const media = await getMediaByIdAndAccountId(id, accountId);
    if (!media) {
      throw data({ error: "Media not found" }, { status: 404 });
    }

    const updated = await updateMediaAlt(id, alt);
    return data({ item: mediaToItem(updated) });
  }

  if (request.method === "DELETE") {
    const body = await request.json();
    const { id } = body as { id: string };

    const media = await getMediaByIdAndAccountId(id, accountId);
    if (!media) {
      throw data({ error: "Media not found" }, { status: 404 });
    }

    if (media.key) {
      try {
        // For audio with HLS, delete all files in the media folder (mp3 + HLS segments)
        if (media.type === "AUDIO" && media.hlsReady) {
          await deleteHlsFiles(getMediaFolder(media.key));
        }
        await deleteFile(media.key);
      } catch {
        // Ignore delete errors - file may already be gone
      }
    }

    await deleteMedia(id);
    return data({ success: true });
  }

  // POST - Upload or Embed
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    // Embed intent
    const body = await request.json();
    const { embedUrl: rawUrl } = body as { embedUrl: string };

    if (!rawUrl) {
      throw data({ error: "embedUrl is required" }, { status: 400 });
    }

    const detected = detectEmbedProvider(rawUrl);
    if (!detected) {
      throw data({ error: "Unsupported embed URL. Only YouTube and Vimeo are supported." }, { status: 400 });
    }

    const media = await createMedia({
      accountId,
      filename: rawUrl,
      key: "",
      mimeType: "video/embed",
      size: 0,
      type: "EMBED",
      provider: detected.provider,
      embedUrl: detected.embedUrl,
    });

    return data({ item: mediaToItem(media) });
  }

  // Multipart upload
  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file || file.size === 0) {
    throw data({ error: "No file provided" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.name.split(".").pop() || "bin";
  const slug = handleize(file.name);
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const baseName = `${slug}-${suffix}`;
  const mimeType = file.type || "application/octet-stream";
  const mediaType = getMediaType(mimeType);

  // Audio files go in their own folder (for HLS segments alongside the source)
  // Non-audio files stay flat
  const key = mediaType === "AUDIO"
    ? `${accountId}/media/${baseName}/${baseName}.${ext}`
    : `${accountId}/media/${baseName}.${ext}`;

  let width: number | null = null;
  let height: number | null = null;

  if (mediaType === "IMAGE") {
    try {
      const metadata = await sharp(buffer).metadata();
      width = metadata.width ?? null;
      height = metadata.height ?? null;
    } catch {
      // Not a valid image for sharp - still store it
    }
  }

  await uploadFile(key, buffer, mimeType);

  const media = await createMedia({
    accountId,
    filename: file.name,
    key,
    mimeType,
    size: file.size,
    type: mediaType,
    width,
    height,
  });

  // For audio uploads, trigger background HLS generation
  if (mediaType === "AUDIO") {
    generateHlsForMediaInBackground(media.id, buffer, getMediaFolder(key));
  }

  return data({ item: mediaToItem(media) });
}
