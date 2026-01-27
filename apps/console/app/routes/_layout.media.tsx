import { useState, useEffect, useCallback, useRef } from "react";
import { useLoaderData, redirect } from "react-router";
import type { Route } from "./+types/_layout.media";
import { getSession, requireUserAuth } from "@secretlobby/auth";
import { prisma } from "@secretlobby/db";
import { getPublicUrl } from "@secretlobby/storage";
import { cn, MediaPicker, type MediaItem } from "@secretlobby/ui";

export function meta() {
  return [{ title: "Media Library - Admin" }];
}

interface LoaderMedia {
  id: string;
  filename: string;
  key: string;
  mimeType: string;
  size: number;
  type: string;
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

export async function loader({ request }: Route.LoaderArgs) {
  const { session } = await getSession(request);
  requireUserAuth(session);

  const accountId = session.currentAccountId;
  if (!accountId) {
    throw redirect("/login");
  }

  const items = await prisma.media.findMany({
    where: { accountId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const mediaItems: LoaderMedia[] = items.map((m) => ({
    id: m.id,
    filename: m.filename,
    key: m.key,
    mimeType: m.mimeType,
    size: m.size,
    type: m.type,
    width: m.width,
    height: m.height,
    duration: m.duration,
    alt: m.alt,
    hlsReady: m.hlsReady,
    waveformPeaks: m.waveformPeaks,
    metadata: m.metadata,
    provider: m.provider,
    embedUrl: m.embedUrl,
    url: m.type === "EMBED" ? (m.embedUrl || "") : getPublicUrl(m.key),
    createdAt: m.createdAt.toISOString(),
  }));

  const nextCursor = items.length === 20 ? items[items.length - 1]?.id ?? null : null;

  return { items: mediaItems, nextCursor };
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

export default function MediaLibraryPage() {
  const loaderData = useLoaderData<typeof loader>();
  const [items, setItems] = useState<MediaItem[]>(loaderData.items as MediaItem[]);
  const [nextCursor, setNextCursor] = useState<string | null>(loaderData.nextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [editingAlt, setEditingAlt] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<MediaItem | null>(null);
  const [deleteInput, setDeleteInput] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchMedia = useCallback(
    async (cursor?: string | null, append = false) => {
      setLoadingMore(true);
      try {
        const params = new URLSearchParams();
        if (typeFilter) params.set("type", typeFilter);
        if (search) params.set("search", search);
        if (cursor) params.set("cursor", cursor);
        params.set("limit", "20");

        const res = await fetch(`/api/media?${params.toString()}`);
        const json = await res.json();

        if (append) {
          setItems((prev) => [...prev, ...json.items]);
        } else {
          setItems(json.items);
        }
        setNextCursor(json.nextCursor);
      } catch {
        // Fetch error
      } finally {
        setLoadingMore(false);
      }
    },
    [typeFilter, search]
  );

  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      fetchMedia();
    }, 300);
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, [search, typeFilter, fetchMedia]);

  const handleAltSave = async (id: string, alt: string) => {
    setEditingAlt(null);
    try {
      await fetch("/api/media", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, alt }),
      });
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, alt } : item))
      );
    } catch {
      // Error
    }
  };

  const openDeleteConfirm = (item: MediaItem) => {
    setDeleteConfirm(item);
    setDeleteInput("");
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    setDeleteLoading(true);
    try {
      await fetch("/api/media", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deleteConfirm.id }),
      });
      setItems((prev) => prev.filter((item) => item.id !== deleteConfirm.id));
      setDeleteConfirm(null);
    } catch {
      // Error
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleUploadComplete = (media: MediaItem) => {
    setItems((prev) => [media, ...prev]);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Media Library</h1>
        <MediaPicker accept={undefined} tabs={["upload", "embed"]} onSelect={handleUploadComplete}>
          <button className="px-4 py-2 text-sm font-medium btn-primary rounded-lg transition cursor-pointer">
            Upload Media
          </button>
        </MediaPicker>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 px-4 py-2 bg-theme-tertiary rounded-lg border border-theme text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-4 py-2 bg-theme-tertiary rounded-lg border border-theme text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        >
          <option value="">All Types</option>
          <option value="IMAGE">Images</option>
          <option value="AUDIO">Audio</option>
          <option value="VIDEO">Video</option>
          <option value="EMBED">Embeds</option>
        </select>
      </div>

      {/* Grid */}
      {items.length === 0 ? (
        <div className="text-center py-16 text-theme-muted">
          <svg className="w-16 h-16 mx-auto mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="text-lg font-medium">No media yet</p>
          <p className="text-sm mt-1">Upload files to build your media library.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {items.map((item) => (
            <div
              key={item.id}
              className="group relative rounded-xl border border-theme overflow-hidden bg-theme-secondary"
            >
              {/* Thumbnail */}
              <div className="aspect-square flex items-center justify-center overflow-hidden bg-theme-tertiary">
                {item.type === "IMAGE" ? (
                  <img
                    src={item.url}
                    alt={item.alt || item.filename}
                    className="w-full h-full object-cover"
                  />
                ) : item.type === "AUDIO" ? (
                  <div className="flex flex-col items-center gap-2 text-theme-muted">
                    <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                    </svg>
                    <span className="text-xs">
                      {item.duration ? formatDuration(item.duration) : "Audio"}
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-theme-muted">
                    <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <span className="text-xs">{item.provider || "Video"}</span>
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="p-3 space-y-1">
                <p className="text-sm font-medium truncate" title={item.filename}>
                  {item.filename}
                </p>
                <div className="flex items-center gap-2 text-xs text-theme-muted">
                  {item.size > 0 && <span>{formatFileSize(item.size)}</span>}
                  {item.width && item.height && (
                    <span>{item.width}&times;{item.height}</span>
                  )}
                  {item.type === "AUDIO" && (
                    item.hlsReady && item.duration
                      ? <span>{formatDuration(item.duration)}</span>
                      : <span className="text-amber-400">Processing...</span>
                  )}
                </div>

                {/* Alt text */}
                {editingAlt === item.id ? (
                  <input
                    autoFocus
                    defaultValue={item.alt || ""}
                    onBlur={(e) => handleAltSave(item.id, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAltSave(item.id, (e.target as HTMLInputElement).value);
                      if (e.key === "Escape") setEditingAlt(null);
                    }}
                    className="w-full mt-1 px-2 py-1 text-xs bg-theme-tertiary rounded border border-[var(--color-accent)] focus:outline-none"
                    placeholder="Alt text..."
                  />
                ) : (
                  <button
                    onClick={() => setEditingAlt(item.id)}
                    className="text-xs text-theme-muted hover:text-theme-primary transition truncate block w-full text-left cursor-pointer"
                  >
                    {item.alt || "Add alt text..."}
                  </button>
                )}
              </div>

              {/* Delete button */}
              <button
                onClick={() => openDeleteConfirm(item)}
                className="absolute top-2 right-2 w-7 h-7 rounded-full bg-red-600/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition cursor-pointer hover:bg-red-600"
                title="Delete"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Show More */}
      {nextCursor && (
        <div className="text-center pt-4">
          <button
            onClick={() => fetchMedia(nextCursor, true)}
            disabled={loadingMore}
            className="px-6 py-2 text-sm btn-secondary rounded-lg transition cursor-pointer disabled:opacity-50"
          >
            {loadingMore ? "Loading..." : "Show More"}
          </button>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => !deleteLoading && setDeleteConfirm(null)}
          />
          <div className="relative bg-theme-secondary border border-theme rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-semibold text-red-400">Delete Media</h2>
            <p className="text-sm text-theme-secondary">
              This action cannot be undone. To confirm, type the filename below:
            </p>
            <p className="px-3 py-2 bg-theme-tertiary rounded-lg border border-theme text-sm font-mono text-theme-primary select-all cursor-text">
              {deleteConfirm.filename}
            </p>
            <input
              type="text"
              value={deleteInput}
              onChange={(e) => setDeleteInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && deleteInput === deleteConfirm.filename) {
                  confirmDelete();
                }
                if (e.key === "Escape" && !deleteLoading) {
                  setDeleteConfirm(null);
                }
              }}
              placeholder="Type filename to confirm..."
              autoFocus
              className="w-full px-4 py-2 bg-theme-tertiary rounded-lg border border-theme text-sm focus:outline-none focus:ring-2 focus:ring-red-500 placeholder:text-theme-muted"
            />
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={deleteLoading}
                className="px-4 py-2 text-sm btn-secondary rounded-lg transition cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleteInput !== deleteConfirm.filename || deleteLoading}
                className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg transition cursor-pointer hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleteLoading ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
