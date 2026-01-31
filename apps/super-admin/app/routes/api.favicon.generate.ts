import { data } from "react-router";
import { prisma } from "@secretlobby/db";
import { uploadFile, getFile, deleteFile, listFiles, getPublicUrl } from "@secretlobby/storage";
import sharp from "sharp";
import pngToIco from "png-to-ico";

interface FaviconConfig {
  sourceKey?: string;
  generatedAt?: string;
  manifestName: string;
  manifestShortName: string;
  themeColor: string;
  bgColor: string;
  display: string;
}

const DEFAULT_CONFIG: FaviconConfig = {
  manifestName: "SecretLobby",
  manifestShortName: "SL",
  themeColor: "#111827",
  bgColor: "#111827",
  display: "standalone",
};

const FAVICON_SIZES = [
  { name: "favicon-16x16.png", size: 16 },
  { name: "favicon-32x32.png", size: 32 },
  { name: "apple-touch-icon.png", size: 180 },
  { name: "android-chrome-192x192.png", size: 192 },
  { name: "android-chrome-512x512.png", size: 512 },
  { name: "mstile-150x150.png", size: 150 },
];

const ICO_SIZES = [16, 32, 48];

function getConfig(raw: unknown): FaviconConfig {
  const config = (raw && typeof raw === "object" ? raw : {}) as Partial<FaviconConfig>;
  return { ...DEFAULT_CONFIG, ...config };
}

async function generateAndUploadManifest(config: FaviconConfig): Promise<void> {
  const baseUrl = getPublicUrl("system/favicons");

  const manifest = {
    name: config.manifestName,
    short_name: config.manifestShortName,
    icons: [
      {
        src: `${baseUrl}/android-chrome-192x192.png`,
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: `${baseUrl}/android-chrome-512x512.png`,
        sizes: "512x512",
        type: "image/png",
      },
    ],
    theme_color: config.themeColor,
    background_color: config.bgColor,
    display: config.display,
  };

  const manifestBuffer = Buffer.from(JSON.stringify(manifest, null, 2));
  await uploadFile("system/favicons/site.webmanifest", manifestBuffer, "application/manifest+json");
}

export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }

  const contentType = request.headers.get("content-type") || "";

  // Handle file upload
  if (contentType.includes("multipart/form-data")) {
    try {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;

      if (!file || file.size === 0) {
        return data({ error: "No file provided" }, { status: 400 });
      }

      // Validate file type
      const validTypes = ["image/png", "image/jpeg", "image/jpg", "image/svg+xml", "image/webp"];
      if (!validTypes.includes(file.type)) {
        return data({ error: "Invalid file type. Please upload a PNG, JPG, SVG, or WebP image." }, { status: 400 });
      }

      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        return data({ error: "File too large. Maximum size is 10MB." }, { status: 400 });
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const isSvg = file.type === "image/svg+xml";

      // Get image dimensions - SVGs need special handling
      let width: number;
      let height: number;
      let isSquare = true;

      try {
        if (isSvg) {
          // For SVGs, convert to PNG first to get reliable dimensions
          const pngBuffer = await sharp(buffer, { density: 300 }).png().toBuffer();
          const metadata = await sharp(pngBuffer).metadata();
          width = metadata.width || 512;
          height = metadata.height || 512;
        } else {
          const metadata = await sharp(buffer).metadata();
          if (!metadata.width || !metadata.height) {
            return data({ error: "Could not read image dimensions" }, { status: 400 });
          }
          width = metadata.width;
          height = metadata.height;
        }
        isSquare = width === height;
      } catch (err) {
        console.error("Error reading image metadata:", err);
        // For SVGs, default to assuming square if we can't read dimensions
        if (isSvg) {
          width = 512;
          height = 512;
          isSquare = true;
        } else {
          return data({ error: "Could not read image. Please ensure it's a valid image file." }, { status: 400 });
        }
      }

      // Determine extension from mime type
      const ext = isSvg ? "svg" :
                  file.type === "image/png" ? "png" :
                  file.type === "image/webp" ? "webp" : "jpg";

      const sourceKey = `system/favicon-source.${ext}`;

      // Get current settings
      const settings = await prisma.systemSettings.findUnique({
        where: { id: "default" },
      });

      const currentConfig = getConfig(settings?.faviconConfig);

      // Delete old source file if exists and different
      if (currentConfig.sourceKey && currentConfig.sourceKey !== sourceKey) {
        try {
          await deleteFile(currentConfig.sourceKey);
        } catch {
          // Ignore - file may not exist
        }
      }

      // Upload new source file
      await uploadFile(sourceKey, buffer, file.type);

      // Update settings with source key
      const newConfig: FaviconConfig = { ...currentConfig, sourceKey };
      await prisma.systemSettings.update({
        where: { id: "default" },
        data: {
          faviconConfig: newConfig as object,
        },
      });

      return data({
        success: true,
        message: "Source image uploaded",
        sourceKey,
        isSquare,
        width,
        height,
      });
    } catch (err) {
      console.error("Upload error:", err);
      return data({ error: "Failed to process upload. Please try again." }, { status: 500 });
    }
  }

  // Handle favicon generation (JSON body with intent)
  const body = await request.json().catch(() => ({}));
  const intent = (body as { intent?: string }).intent;

  if (intent === "generate") {
    // Get current settings
    const settings = await prisma.systemSettings.findUnique({
      where: { id: "default" },
    });

    const config = getConfig(settings?.faviconConfig);

    if (!config.sourceKey) {
      return data({ error: "No source image uploaded" }, { status: 400 });
    }

    // Fetch source image from R2
    const sourceFile = await getFile(config.sourceKey);
    if (!sourceFile) {
      return data({ error: "Source image not found in storage" }, { status: 404 });
    }

    // Convert source to PNG buffer for processing (handles SVG, WebP, etc.)
    let sourceBuffer: Buffer;
    try {
      sourceBuffer = await sharp(Buffer.from(sourceFile.body))
        .png()
        .toBuffer();
    } catch {
      return data({ error: "Failed to process source image" }, { status: 500 });
    }

    // Delete existing generated favicons
    try {
      const existingFiles = await listFiles("system/favicons/");
      for (const key of existingFiles) {
        await deleteFile(key);
      }
    } catch {
      // Ignore - folder may not exist
    }

    // Generate all PNG sizes
    const generatedFiles: string[] = [];

    for (const { name, size } of FAVICON_SIZES) {
      const resized = await sharp(sourceBuffer)
        .resize(size, size, { fit: "cover" })
        .png()
        .toBuffer();

      const key = `system/favicons/${name}`;
      await uploadFile(key, resized, "image/png");
      generatedFiles.push(name);
    }

    // Generate favicon.ico (multi-size ICO file)
    const icoBuffers: Buffer[] = [];
    for (const size of ICO_SIZES) {
      const resized = await sharp(sourceBuffer)
        .resize(size, size, { fit: "cover" })
        .png()
        .toBuffer();
      icoBuffers.push(resized);
    }

    const icoBuffer = await pngToIco(icoBuffers);
    await uploadFile("system/favicons/favicon.ico", icoBuffer, "image/x-icon");
    generatedFiles.push("favicon.ico");

    // Generate and upload site.webmanifest
    await generateAndUploadManifest(config);
    generatedFiles.push("site.webmanifest");

    // Update config with generation timestamp
    const generatedAt = new Date().toISOString();
    const newConfig: FaviconConfig = { ...config, generatedAt };
    await prisma.systemSettings.update({
      where: { id: "default" },
      data: {
        faviconConfig: newConfig as object,
      },
    });

    return data({
      success: true,
      message: "Favicons generated successfully",
      generatedFiles,
      generatedAt,
    });
  }

  if (intent === "updateManifest") {
    const { manifestName, manifestShortName, themeColor, bgColor, display } = body as {
      manifestName?: string;
      manifestShortName?: string;
      themeColor?: string;
      bgColor?: string;
      display?: string;
    };

    const settings = await prisma.systemSettings.findUnique({
      where: { id: "default" },
    });

    const currentConfig = getConfig(settings?.faviconConfig);
    const newConfig: FaviconConfig = {
      ...currentConfig,
      ...(manifestName !== undefined && { manifestName }),
      ...(manifestShortName !== undefined && { manifestShortName }),
      ...(themeColor !== undefined && { themeColor }),
      ...(bgColor !== undefined && { bgColor }),
      ...(display !== undefined && { display }),
    };

    await prisma.systemSettings.update({
      where: { id: "default" },
      data: {
        faviconConfig: newConfig as object,
      },
    });

    // Re-generate manifest if favicons were previously generated
    if (newConfig.generatedAt) {
      await generateAndUploadManifest(newConfig);
    }

    return data({ success: true, message: "Manifest settings updated" });
  }

  return data({ error: "Invalid intent" }, { status: 400 });
}

// GET - Return current favicon status
export async function loader() {
  const settings = await prisma.systemSettings.findUnique({
    where: { id: "default" },
  });

  const config = getConfig(settings?.faviconConfig);
  const baseUrl = config.generatedAt ? getPublicUrl("system/favicons") : null;

  return data({
    sourceKey: config.sourceKey || null,
    sourceUrl: config.sourceKey ? getPublicUrl(config.sourceKey) : null,
    generatedAt: config.generatedAt || null,
    faviconBaseUrl: baseUrl,
    manifestName: config.manifestName,
    manifestShortName: config.manifestShortName,
    themeColor: config.themeColor,
    bgColor: config.bgColor,
    display: config.display,
  });
}
