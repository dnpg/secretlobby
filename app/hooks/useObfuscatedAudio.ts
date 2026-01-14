import { useCallback, useRef, useState } from "react";

// Same XOR key as server (must match!)
const XOR_KEY = [0x5A, 0x3C, 0x9F, 0x1E, 0x7B, 0xD2, 0x48, 0xA6];

function deobfuscateData(data: Uint8Array): Uint8Array {
  const result = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    result[i] = data[i] ^ XOR_KEY[i % XOR_KEY.length];
  }
  return result;
}

interface TokenData {
  token: string;
}

export function useObfuscatedAudio() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentBlobUrlRef = useRef<string | null>(null);

  // Cleanup previous blob URL
  const cleanupBlobUrl = useCallback(() => {
    if (currentBlobUrlRef.current) {
      URL.revokeObjectURL(currentBlobUrlRef.current);
      currentBlobUrlRef.current = null;
    }
  }, []);

  // Fetch token for track
  const fetchToken = useCallback(async (trackId: string): Promise<TokenData | null> => {
    try {
      const response = await fetch(`/api/token/${trackId}`);
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }, []);

  // Load a track by fetching all chunks and creating a blob URL
  const loadTrack = useCallback(async (trackId: string): Promise<string | null> => {
    // Cancel any ongoing loading
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    // Cleanup previous blob
    cleanupBlobUrl();

    setIsLoading(true);
    setError(null);
    setBlobUrl(null);

    try {
      // Get token
      const tokenData = await fetchToken(trackId);
      if (!tokenData) {
        throw new Error("Failed to get token");
      }

      const chunks: Uint8Array[] = [];
      let position = 0;
      let totalSize = 0;
      const chunkSize = 64 * 1024; // Match server chunk size

      // Fetch first chunk to get total size from Content-Range
      const firstResponse = await fetch(
        `/api/stream/${trackId}?t=${tokenData.token}`,
        {
          headers: { Range: `bytes=0-${chunkSize - 1}` },
          signal: abortControllerRef.current?.signal,
        }
      );

      if (!firstResponse.ok) {
        throw new Error("Failed to fetch audio");
      }

      // Parse total size from Content-Range header
      const contentRange = firstResponse.headers.get("Content-Range");
      if (contentRange) {
        const match = contentRange.match(/bytes \d+-\d+\/(\d+)/);
        if (match) {
          totalSize = parseInt(match[1], 10);
        }
      }

      // De-obfuscate and store first chunk
      const firstChunkData = new Uint8Array(await firstResponse.arrayBuffer());
      chunks.push(deobfuscateData(firstChunkData));
      position = firstChunkData.length;

      // Fetch remaining chunks
      while (position < totalSize) {
        // Get fresh token for each chunk (tokens expire)
        const newTokenData = await fetchToken(trackId);
        if (!newTokenData) {
          throw new Error("Failed to refresh token");
        }

        const end = Math.min(position + chunkSize - 1, totalSize - 1);

        const response = await fetch(
          `/api/stream/${trackId}?t=${newTokenData.token}`,
          {
            headers: { Range: `bytes=${position}-${end}` },
            signal: abortControllerRef.current?.signal,
          }
        );

        if (!response.ok) break;

        const chunkData = new Uint8Array(await response.arrayBuffer());
        if (chunkData.length === 0) break;

        chunks.push(deobfuscateData(chunkData));
        position += chunkData.length;
      }

      // Combine all chunks into a single blob
      const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const combined = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }

      // Create blob URL
      const blob = new Blob([combined], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);

      currentBlobUrlRef.current = url;
      setBlobUrl(url);
      setIsLoading(false);

      return url;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        // Loading was cancelled, not an error
        setIsLoading(false);
        return null;
      }
      setError(err instanceof Error ? err.message : "Failed to load track");
      setIsLoading(false);
      return null;
    }
  }, [fetchToken, cleanupBlobUrl]);

  // Cleanup on unmount
  const cleanup = useCallback(() => {
    abortControllerRef.current?.abort();
    cleanupBlobUrl();
  }, [cleanupBlobUrl]);

  return {
    loadTrack,
    cleanup,
    blobUrl,
    isLoading,
    error,
  };
}
