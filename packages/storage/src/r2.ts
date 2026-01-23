import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

function getEnvOrThrow(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

let _client: S3Client | null = null;

function getClient(): S3Client {
  if (!_client) {
    const accountId = getEnvOrThrow("R2_ACCOUNT_ID");
    _client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: getEnvOrThrow("R2_ACCESS_KEY_ID"),
        secretAccessKey: getEnvOrThrow("R2_SECRET_ACCESS_KEY"),
      },
    });
  }
  return _client;
}

function getBucket(): string {
  return getEnvOrThrow("R2_BUCKET_NAME");
}

function getPublicBaseUrl(): string {
  return getEnvOrThrow("R2_PUBLIC_URL").replace(/\/$/, "");
}

/**
 * Get the optional base prefix for all keys in the bucket.
 * Set R2_BASE_PREFIX to store files under a directory (e.g., "media" or "production/assets").
 * Leave empty or unset to store at the bucket root.
 */
function getBasePrefix(): string {
  const prefix = (process.env.R2_BASE_PREFIX || "").replace(/^\/+|\/+$/g, "");
  return prefix ? `${prefix}/` : "";
}

/**
 * Prepend the base prefix to a key.
 */
function prefixKey(key: string): string {
  return `${getBasePrefix()}${key}`;
}

/**
 * Upload a file to R2. Uses multipart upload for files larger than 5MB.
 * Returns the object key.
 */
export async function uploadFile(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string
): Promise<string> {
  const client = getClient();
  const bucket = getBucket();
  const fullKey = prefixKey(key);

  // Use multipart upload for files > 5MB
  if (body.length > 5 * 1024 * 1024) {
    const upload = new Upload({
      client,
      params: {
        Bucket: bucket,
        Key: fullKey,
        Body: body,
        ContentType: contentType,
      },
      queueSize: 4,
      partSize: 5 * 1024 * 1024,
    });

    await upload.done();
  } else {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: fullKey,
        Body: body,
        ContentType: contentType,
      })
    );
  }

  return key;
}

/**
 * Delete a file from R2.
 */
export async function deleteFile(key: string): Promise<void> {
  const client = getClient();
  await client.send(
    new DeleteObjectCommand({
      Bucket: getBucket(),
      Key: prefixKey(key),
    })
  );
}

/**
 * List files in R2 by prefix.
 * Returns an array of object keys.
 */
export async function listFiles(prefix: string): Promise<string[]> {
  const client = getClient();
  const basePrefix = getBasePrefix();
  const result = await client.send(
    new ListObjectsV2Command({
      Bucket: getBucket(),
      Prefix: `${basePrefix}${prefix}`,
    })
  );

  // Strip the base prefix from returned keys so callers see logical keys
  return (result.Contents || [])
    .map((obj) => obj.Key)
    .filter((k): k is string => !!k)
    .map((k) => (basePrefix && k.startsWith(basePrefix) ? k.slice(basePrefix.length) : k));
}

/**
 * Get the public CDN URL for a given key.
 */
export function getPublicUrl(key: string): string {
  return `${getPublicBaseUrl()}/${prefixKey(key)}`;
}

/**
 * Get file metadata (size, content type) without downloading.
 */
export async function getFileInfo(
  key: string
): Promise<{ size: number; contentType: string } | null> {
  const client = getClient();
  try {
    const result = await client.send(
      new HeadObjectCommand({
        Bucket: getBucket(),
        Key: prefixKey(key),
      })
    );
    return {
      size: result.ContentLength || 0,
      contentType: result.ContentType || "application/octet-stream",
    };
  } catch {
    return null;
  }
}

/**
 * Get a byte range of a file from R2.
 * Used for audio segment streaming.
 */
export async function getFileRange(
  key: string,
  start: number,
  end: number
): Promise<{ body: Uint8Array; contentType: string; totalSize: number } | null> {
  const client = getClient();
  try {
    const result = await client.send(
      new GetObjectCommand({
        Bucket: getBucket(),
        Key: prefixKey(key),
        Range: `bytes=${start}-${end}`,
      })
    );

    if (!result.Body) return null;

    const bytes = await result.Body.transformToByteArray();
    const totalSize = result.ContentRange
      ? parseInt(result.ContentRange.split("/")[1], 10)
      : 0;

    return {
      body: bytes,
      contentType: result.ContentType || "application/octet-stream",
      totalSize,
    };
  } catch {
    return null;
  }
}

/**
 * Get the full file content from R2.
 */
export async function getFile(
  key: string
): Promise<{ body: Uint8Array; contentType: string; size: number } | null> {
  const client = getClient();
  try {
    const result = await client.send(
      new GetObjectCommand({
        Bucket: getBucket(),
        Key: prefixKey(key),
      })
    );

    if (!result.Body) return null;

    const bytes = await result.Body.transformToByteArray();
    return {
      body: bytes,
      contentType: result.ContentType || "application/octet-stream",
      size: bytes.length,
    };
  } catch {
    return null;
  }
}
