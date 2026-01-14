import { useCallback, useRef, useState } from "react";

interface StreamToken {
  token: string;
  nonce: string;
  key: string;
}

// Convert base64 to ArrayBuffer
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// Decrypt a chunk using Web Crypto API
async function decryptChunk(
  encryptedData: ArrayBuffer,
  keyBase64: string
): Promise<ArrayBuffer> {
  const data = new Uint8Array(encryptedData);

  // Extract IV (12 bytes), authTag (16 bytes), and encrypted data
  const iv = data.slice(0, 12);
  const authTag = data.slice(12, 28);
  const encrypted = data.slice(28);

  // Combine encrypted data with auth tag (Web Crypto expects them together)
  const ciphertext = new Uint8Array(encrypted.length + authTag.length);
  ciphertext.set(encrypted);
  ciphertext.set(authTag, encrypted.length);

  // Import the key
  const keyBuffer = base64ToArrayBuffer(keyBase64);
  const key = await crypto.subtle.importKey(
    "raw",
    keyBuffer,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );

  // Decrypt
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );

  return decrypted;
}

export function useEncryptedAudio() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaSourceRef = useRef<MediaSource | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);
  const tokenDataRef = useRef<StreamToken | null>(null);
  const currentTrackIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Fetch token and encryption key
  const fetchToken = useCallback(async (trackId: string): Promise<StreamToken | null> => {
    try {
      const response = await fetch(`/api/token/${trackId}`);
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }, []);

  // Fetch and decrypt a chunk
  const fetchChunk = useCallback(
    async (
      trackId: string,
      token: StreamToken,
      start: number,
      end: number
    ): Promise<ArrayBuffer | null> => {
      try {
        const response = await fetch(
          `/api/stream/${trackId}?t=${token.token}&n=${token.nonce}`,
          {
            headers: {
              Range: `bytes=${start}-${end}`,
            },
            signal: abortControllerRef.current?.signal,
          }
        );

        if (!response.ok) return null;

        const encryptedData = await response.arrayBuffer();
        return await decryptChunk(encryptedData, token.key);
      } catch {
        return null;
      }
    },
    []
  );

  // Load and stream a track
  const loadTrack = useCallback(
    async (trackId: string, audioElement: HTMLAudioElement) => {
      // Cancel any ongoing loading
      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();

      setIsLoading(true);
      setError(null);
      audioRef.current = audioElement;
      currentTrackIdRef.current = trackId;

      try {
        // Get token and key
        const tokenData = await fetchToken(trackId);
        if (!tokenData) {
          throw new Error("Failed to get stream token");
        }
        tokenDataRef.current = tokenData;

        // Create MediaSource
        const mediaSource = new MediaSource();
        mediaSourceRef.current = mediaSource;

        const objectUrl = URL.createObjectURL(mediaSource);
        audioElement.src = objectUrl;

        await new Promise<void>((resolve, reject) => {
          mediaSource.addEventListener("sourceopen", () => resolve(), { once: true });
          mediaSource.addEventListener("error", () => reject(new Error("MediaSource error")), { once: true });
        });

        // Add source buffer for MP3
        const sourceBuffer = mediaSource.addSourceBuffer("audio/mpeg");
        sourceBufferRef.current = sourceBuffer;

        // Start fetching chunks
        let position = 0;
        const chunkSize = 64 * 1024; // 64KB chunks
        let totalSize = 0;

        // Fetch first chunk to get total size
        const firstChunk = await fetchChunk(trackId, tokenData, 0, chunkSize - 1);
        if (!firstChunk) {
          throw new Error("Failed to fetch audio data");
        }

        // Append first chunk
        await appendBuffer(sourceBuffer, firstChunk);
        position = chunkSize;

        setIsLoading(false);

        // Continue fetching in background
        const fetchRemaining = async () => {
          while (position < 100 * 1024 * 1024) { // Max 100MB
            // Wait if buffer is updating
            if (sourceBuffer.updating) {
              await new Promise((r) => setTimeout(r, 100));
              continue;
            }

            // Check if we need more data
            if (audioElement.buffered.length > 0) {
              const bufferedEnd = audioElement.buffered.end(audioElement.buffered.length - 1);
              const currentTime = audioElement.currentTime;

              // If we have enough buffer ahead, pause fetching
              if (bufferedEnd - currentTime > 30) {
                await new Promise((r) => setTimeout(r, 1000));
                continue;
              }
            }

            // Fetch next chunk
            const chunk = await fetchChunk(trackId, tokenData, position, position + chunkSize - 1);
            if (!chunk || chunk.byteLength === 0) {
              // End of file
              if (!sourceBuffer.updating) {
                mediaSource.endOfStream();
              }
              break;
            }

            await appendBuffer(sourceBuffer, chunk);
            position += chunk.byteLength;

            // Small delay to prevent overwhelming
            await new Promise((r) => setTimeout(r, 50));
          }
        };

        fetchRemaining().catch(console.error);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load track");
        setIsLoading(false);
      }
    },
    [fetchToken, fetchChunk]
  );

  // Helper to append buffer with waiting
  const appendBuffer = async (sourceBuffer: SourceBuffer, data: ArrayBuffer) => {
    return new Promise<void>((resolve, reject) => {
      const handleUpdate = () => {
        sourceBuffer.removeEventListener("updateend", handleUpdate);
        sourceBuffer.removeEventListener("error", handleError);
        resolve();
      };
      const handleError = () => {
        sourceBuffer.removeEventListener("updateend", handleUpdate);
        sourceBuffer.removeEventListener("error", handleError);
        reject(new Error("Buffer append error"));
      };

      sourceBuffer.addEventListener("updateend", handleUpdate);
      sourceBuffer.addEventListener("error", handleError);
      sourceBuffer.appendBuffer(data);
    });
  };

  // Cleanup
  const cleanup = useCallback(() => {
    abortControllerRef.current?.abort();
    if (mediaSourceRef.current && mediaSourceRef.current.readyState === "open") {
      try {
        mediaSourceRef.current.endOfStream();
      } catch {}
    }
    if (audioRef.current) {
      URL.revokeObjectURL(audioRef.current.src);
      audioRef.current.src = "";
    }
  }, []);

  return {
    loadTrack,
    cleanup,
    isLoading,
    error,
  };
}
