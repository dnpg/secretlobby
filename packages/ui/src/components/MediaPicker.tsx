import { useState, useRef, useCallback, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "../lib/utils.js";

export interface MediaItem {
  id: string;
  filename: string;
  key: string;
  mimeType: string;
  size: number;
  type: "IMAGE" | "AUDIO" | "VIDEO" | "EMBED";
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

export type MediaPickerTab = "library" | "upload" | "embed";

export interface MediaPickerProps {
  accept?: string[];
  onSelect: (media: MediaItem) => void;
  onSelectMultiple?: (media: MediaItem[]) => void;
  multiSelect?: boolean;
  apiBase?: string;
  tabs?: MediaPickerTab[];
  children: React.ReactNode;
}

interface FileUploadState {
  id: string;
  file: File;
  status: "queued" | "uploading" | "processing" | "done" | "error";
  progress: number;
  error?: string;
  result?: MediaItem;
}

const MAX_CONCURRENT = 2;

export function MediaPicker({
  accept,
  onSelect,
  onSelectMultiple,
  multiSelect = false,
  apiBase = "/api/media",
  tabs = ["library", "upload", "embed"],
  children,
}: MediaPickerProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<MediaPickerTab>(tabs[0]);
  const [selected, setSelected] = useState<Map<string, MediaItem>>(new Map());

  // Upload state (persists after dialog close)
  const [uploads, setUploads] = useState<FileUploadState[]>([]);
  const [widgetVisible, setWidgetVisible] = useState(false);
  const activeCountRef = useRef(0);
  const startedIdsRef = useRef<Set<string>>(new Set());
  const xhrsRef = useRef<Map<string, XMLHttpRequest>>(new Map());
  const multiSelectRef = useRef(multiSelect);
  multiSelectRef.current = multiSelect;

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      setOpen(isOpen);
      if (isOpen) {
        setActiveTab(tabs[0]);
        setWidgetVisible(false);
        setSelected(new Map());
      } else {
        // Show floating widget if there are active uploads when closing
        setUploads((prev) => {
          if (prev.some((u) => u.status === "queued" || u.status === "uploading" || u.status === "processing")) {
            setWidgetVisible(true);
          }
          return prev;
        });
      }
    },
    [tabs]
  );

  const handleSelect = useCallback(
    (media: MediaItem) => {
      onSelect(media);
      setOpen(false);
    },
    [onSelect]
  );

  const handleToggleSelect = useCallback((item: MediaItem) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(item.id)) {
        next.delete(item.id);
      } else {
        next.set(item.id, item);
      }
      return next;
    });
  }, []);

  const handleConfirmMultiple = useCallback(() => {
    if (onSelectMultiple && selected.size > 0) {
      onSelectMultiple(Array.from(selected.values()));
      setSelected(new Map());
      setOpen(false);
    }
  }, [onSelectMultiple, selected]);

  // --- Upload logic ---

  const startUpload = useCallback((uploadId: string, file: File) => {
    const xhr = new XMLHttpRequest();
    xhrsRef.current.set(uploadId, xhr);

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        setUploads((prev) =>
          prev.map((u) => (u.id === uploadId ? { ...u, progress: pct } : u))
        );
      }
    });

    // File data fully sent → waiting for server to process
    xhr.upload.addEventListener("load", () => {
      setUploads((prev) =>
        prev.map((u) =>
          u.id === uploadId
            ? { ...u, status: "processing" as const, progress: 100 }
            : u
        )
      );
    });

    xhr.addEventListener("load", () => {
      activeCountRef.current--;
      xhrsRef.current.delete(uploadId);
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const json = JSON.parse(xhr.responseText);
          setUploads((prev) =>
            prev.map((u) =>
              u.id === uploadId
                ? { ...u, status: "done" as const, progress: 100, result: json.item }
                : u
            )
          );
          if (!multiSelectRef.current) {
            onSelect(json.item);
          }
        } catch {
          setUploads((prev) =>
            prev.map((u) =>
              u.id === uploadId
                ? { ...u, status: "error" as const, error: "Invalid response" }
                : u
            )
          );
        }
      } else {
        let errorMsg = `Upload failed (${xhr.status})`;
        try {
          const json = JSON.parse(xhr.responseText);
          if (json.error) errorMsg = json.error;
        } catch { /* ignore */ }
        setUploads((prev) =>
          prev.map((u) =>
            u.id === uploadId
              ? { ...u, status: "error" as const, error: errorMsg }
              : u
          )
        );
      }
    });

    xhr.addEventListener("error", () => {
      activeCountRef.current--;
      xhrsRef.current.delete(uploadId);
      setUploads((prev) =>
        prev.map((u) =>
          u.id === uploadId
            ? { ...u, status: "error" as const, error: "Network error" }
            : u
        )
      );
    });

    xhr.addEventListener("abort", () => {
      activeCountRef.current--;
      xhrsRef.current.delete(uploadId);
    });

    const formData = new FormData();
    formData.append("file", file);
    xhr.open("POST", apiBase);
    xhr.send(formData);
  }, [apiBase, onSelect]);

  // Process queue
  useEffect(() => {
    const queued = uploads.filter(
      (u) => u.status === "queued" && !startedIdsRef.current.has(u.id)
    );
    const slotsAvailable = MAX_CONCURRENT - activeCountRef.current;
    if (slotsAvailable <= 0 || queued.length === 0) return;

    const toStart = queued.slice(0, slotsAvailable);

    setUploads((prev) =>
      prev.map((u) =>
        toStart.some((s) => s.id === u.id)
          ? { ...u, status: "uploading" as const, progress: 0 }
          : u
      )
    );

    for (const item of toStart) {
      startedIdsRef.current.add(item.id);
      activeCountRef.current++;
      startUpload(item.id, item.file);
    }
  }, [uploads, startUpload]);

  const addFiles = useCallback((files: FileList | File[]) => {
    const newUploads: FileUploadState[] = Array.from(files).map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      file,
      status: "queued" as const,
      progress: 0,
    }));
    setUploads((prev) => [...prev, ...newUploads]);
  }, []);

  const cancelUpload = useCallback((id: string) => {
    const xhr = xhrsRef.current.get(id);
    if (xhr) {
      xhr.abort();
      xhrsRef.current.delete(id);
    }
    startedIdsRef.current.delete(id);
    setUploads((prev) => prev.filter((u) => u.id !== id));
  }, []);

  const clearUploads = useCallback(() => {
    setUploads([]);
    startedIdsRef.current.clear();
    setWidgetVisible(false);
  }, []);

  const showTabs = tabs.length > 1;

  return (
    <>
      <Dialog.Root open={open} onOpenChange={handleOpenChange}>
        <Dialog.Trigger asChild>{children}</Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-3xl max-h-[85vh] bg-[var(--color-bg-secondary,#1f2937)] border border-[var(--color-border,#374151)] rounded-xl shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border,#374151)]">
              <Dialog.Title className="text-lg font-semibold text-[var(--color-text-primary,#ffffff)]">
                Media Library
              </Dialog.Title>
              <Dialog.Close className="text-[var(--color-text-muted,#6b7280)] hover:text-[var(--color-text-primary,#ffffff)] transition cursor-pointer text-xl leading-none">
                &times;
              </Dialog.Close>
            </div>

            {showTabs && (
              <div className="flex gap-1 px-6 pt-3 border-b border-[var(--color-border,#374151)]">
                {tabs.map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={cn(
                      "px-4 py-2 text-sm font-medium border-b-2 transition cursor-pointer capitalize",
                      activeTab === tab
                        ? "border-[var(--color-accent,#ffffff)] text-[var(--color-text-primary,#ffffff)]"
                        : "border-transparent text-[var(--color-text-muted,#6b7280)] hover:text-[var(--color-text-primary,#ffffff)]"
                    )}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-6">
              {activeTab === "library" && (
                <LibraryTab
                  apiBase={apiBase}
                  accept={accept}
                  onSelect={handleSelect}
                  multiSelect={multiSelect}
                  selected={selected}
                  onToggleSelect={handleToggleSelect}
                />
              )}
              {activeTab === "upload" && (
                <UploadTab
                  accept={accept}
                  addFiles={addFiles}
                  uploads={uploads}
                  onCancel={cancelUpload}
                />
              )}
              {activeTab === "embed" && (
                <EmbedTab apiBase={apiBase} onSelect={handleSelect} />
              )}
            </div>

            {multiSelect && selected.size > 0 && (
              <div className="px-6 py-3 border-t border-[var(--color-border,#374151)] flex items-center justify-between bg-[var(--color-bg-secondary,#1f2937)]">
                <span className="text-sm text-[var(--color-text-muted,#6b7280)]">
                  {selected.size} item{selected.size !== 1 ? "s" : ""} selected
                </span>
                <button
                  onClick={handleConfirmMultiple}
                  className="px-4 py-2 text-sm font-medium bg-[var(--color-primary,#ffffff)] text-[var(--color-primary-text,#111827)] rounded-lg transition cursor-pointer hover:opacity-90"
                >
                  Add {selected.size} item{selected.size !== 1 ? "s" : ""}
                </button>
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Floating upload progress widget - shown when dialog closed with active uploads */}
      {widgetVisible && !open && uploads.length > 0 && (
        <UploadProgressWidget
          uploads={uploads}
          onCancel={cancelUpload}
          onClear={clearUploads}
        />
      )}
    </>
  );
}

// --- Floating Upload Progress Widget ---

function UploadProgressWidget({
  uploads,
  onCancel,
  onClear,
}: {
  uploads: FileUploadState[];
  onCancel: (id: string) => void;
  onClear: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  const doneCount = uploads.filter((u) => u.status === "done").length;
  const errorCount = uploads.filter((u) => u.status === "error").length;
  const allFinished = uploads.every((u) => u.status === "done" || u.status === "error");
  const activeUploads = uploads.filter((u) => u.status === "uploading" || u.status === "queued" || u.status === "processing");

  function headerText() {
    if (allFinished) {
      return `${doneCount} uploaded${errorCount > 0 ? `, ${errorCount} failed` : ""}`;
    }
    return `Uploading ${doneCount}/${uploads.length}...`;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 bg-[var(--color-bg-secondary,#1f2937)] border border-[var(--color-border,#374151)] rounded-xl shadow-2xl overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border,#374151)] cursor-pointer"
        onClick={() => setCollapsed((c) => !c)}
      >
        <div className="flex items-center gap-2">
          {!allFinished && (
            <svg className="w-4 h-4 text-[var(--color-accent,#ffffff)] animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          {allFinished && errorCount === 0 && (
            <svg className="w-4 h-4 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )}
          {allFinished && errorCount > 0 && (
            <svg className="w-4 h-4 text-yellow-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          )}
          <span className="text-sm font-medium text-[var(--color-text-primary,#ffffff)]">
            {headerText()}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); setCollapsed((c) => !c); }}
            className="p-1 text-[var(--color-text-muted,#6b7280)] hover:text-[var(--color-text-primary,#ffffff)] transition cursor-pointer"
          >
            <svg className={cn("w-4 h-4 transition-transform", collapsed && "rotate-180")} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {allFinished && (
            <button
              onClick={(e) => { e.stopPropagation(); onClear(); }}
              className="p-1 text-[var(--color-text-muted,#6b7280)] hover:text-[var(--color-text-primary,#ffffff)] transition cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Overall progress bar */}
      {!allFinished && (
        <div className="h-1 w-full bg-[var(--color-bg-tertiary,#374151)]">
          <div
            className="h-full bg-[var(--color-accent,#ffffff)] transition-all duration-300"
            style={{
              width: `${Math.round(
                uploads.reduce((sum, u) => sum + (u.status === "done" || u.status === "processing" ? 100 : u.progress), 0) /
                uploads.length
              )}%`,
            }}
          />
        </div>
      )}

      {/* File list */}
      {!collapsed && (
        <div className="max-h-48 overflow-y-auto p-2 space-y-1">
          {[...activeUploads, ...uploads.filter((u) => u.status === "done" || u.status === "error")].map((upload) => (
            <UploadProgressItem key={upload.id} upload={upload} onCancel={onCancel} compact />
          ))}
        </div>
      )}
    </div>
  );
}

// --- Upload Tab (inside dialog) ---

function UploadTab({
  accept,
  addFiles,
  uploads,
  onCancel,
}: {
  accept?: string[];
  addFiles: (files: FileList | File[]) => void;
  uploads: FileUploadState[];
  onCancel: (id: string) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const acceptStr = accept?.join(",") || "*/*";

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  };

  const hasUploads = uploads.length > 0;
  const doneCount = uploads.filter((u) => u.status === "done").length;
  const allDone = hasUploads && uploads.every((u) => u.status === "done" || u.status === "error");

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          "border-2 border-dashed rounded-xl text-center transition cursor-pointer",
          hasUploads ? "p-6" : "p-12",
          dragOver
            ? "border-[var(--color-accent,#ffffff)] bg-[var(--color-accent,#ffffff)]/5"
            : "border-[var(--color-border,#374151)] hover:border-[var(--color-text-muted,#6b7280)]"
        )}
      >
        <div className="text-[var(--color-text-muted,#6b7280)]">
          <svg className={cn("mx-auto mb-3", hasUploads ? "w-8 h-8" : "w-12 h-12 mb-4")} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p className="text-sm font-medium text-[var(--color-text-primary,#ffffff)]">
            Drop files here or click to browse
          </p>
          <p className="text-xs mt-1">
            Multiple files supported. {accept ? accept.join(", ") : "All file types"}
          </p>
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept={acceptStr}
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            addFiles(e.target.files);
          }
          e.target.value = "";
        }}
      />

      {/* Upload queue (shown inside dialog) */}
      {hasUploads && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-[var(--color-text-muted,#6b7280)]">
              {doneCount}/{uploads.length} completed
            </p>
            {allDone && (
              <button
                onClick={() => {
                  // Clear all done/error uploads from parent
                  uploads.forEach((u) => {
                    if (u.status === "done" || u.status === "error") onCancel(u.id);
                  });
                }}
                className="text-xs text-[var(--color-text-muted,#6b7280)] hover:text-[var(--color-text-primary,#ffffff)] transition cursor-pointer"
              >
                Clear list
              </button>
            )}
          </div>
          <div className="space-y-1.5 max-h-60 overflow-y-auto">
            {uploads.map((upload) => (
              <UploadProgressItem key={upload.id} upload={upload} onCancel={onCancel} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Library Tab ---

function LibraryTab({
  apiBase,
  accept,
  onSelect,
  multiSelect,
  selected,
  onToggleSelect,
}: {
  apiBase: string;
  accept?: string[];
  onSelect: (media: MediaItem) => void;
  multiSelect?: boolean;
  selected?: Map<string, MediaItem>;
  onToggleSelect?: (item: MediaItem) => void;
}) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [editingAlt, setEditingAlt] = useState<string | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const typeFilter = accept
    ? accept
        .map((a) => {
          if (a.startsWith("image/")) return "IMAGE";
          if (a.startsWith("audio/")) return "AUDIO";
          if (a.startsWith("video/")) return "VIDEO";
          if (a === "image/*") return "IMAGE";
          if (a === "audio/*") return "AUDIO";
          if (a === "video/*") return "VIDEO";
          return null;
        })
        .filter(Boolean)
        .filter((v, i, arr) => arr.indexOf(v) === i)
        .join(",")
    : "";

  const fetchMedia = useCallback(
    async (cursor?: string | null, append = false) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (typeFilter) params.set("type", typeFilter);
        if (search) params.set("search", search);
        if (cursor) params.set("cursor", cursor);
        params.set("limit", "20");

        const res = await fetch(`${apiBase}?${params.toString()}`);
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
        setLoading(false);
      }
    },
    [apiBase, typeFilter, search]
  );

  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      fetchMedia();
    }, 300);
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, [search, fetchMedia]);

  const handleAltSave = async (id: string, alt: string) => {
    setEditingAlt(null);
    try {
      await fetch(apiBase, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, alt }),
      });
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, alt } : item))
      );
    } catch {
      // Error updating alt
    }
  };

  return (
    <div className="space-y-4">
      <input
        type="text"
        placeholder="Search by filename or alt text..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-4 py-2 bg-[var(--color-bg-tertiary,#374151)] rounded-lg border border-[var(--color-border,#374151)] text-[var(--color-text-primary,#ffffff)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent,#ffffff)] placeholder:text-[var(--color-text-muted,#6b7280)]"
      />

      {loading && items.length === 0 ? (
        <div className="text-center py-12 text-[var(--color-text-muted,#6b7280)]">
          Loading...
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-[var(--color-text-muted,#6b7280)]">
          No media found. Upload some files to get started.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {items.map((item) => (
              <MediaGridItem
                key={item.id}
                item={item}
                onSelect={multiSelect && onToggleSelect ? onToggleSelect : onSelect}
                editingAlt={editingAlt}
                onEditAlt={setEditingAlt}
                onSaveAlt={handleAltSave}
                multiSelect={multiSelect}
                isSelected={selected?.has(item.id)}
              />
            ))}
          </div>
          {nextCursor && (
            <div className="text-center pt-4">
              <button
                onClick={() => fetchMedia(nextCursor, true)}
                disabled={loading}
                className="px-4 py-2 text-sm bg-[var(--color-bg-tertiary,#374151)] text-[var(--color-text-primary,#ffffff)] rounded-lg border border-[var(--color-border,#374151)] hover:bg-[var(--color-bg-primary,#111827)] transition cursor-pointer disabled:opacity-50"
              >
                {loading ? "Loading..." : "Show More"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MediaGridItem({
  item,
  onSelect,
  editingAlt,
  onEditAlt,
  onSaveAlt,
  multiSelect,
  isSelected,
}: {
  item: MediaItem;
  onSelect: (media: MediaItem) => void;
  editingAlt: string | null;
  onEditAlt: (id: string | null) => void;
  onSaveAlt: (id: string, alt: string) => void;
  multiSelect?: boolean;
  isSelected?: boolean;
}) {
  const altInputRef = useRef<HTMLInputElement>(null);
  const isEditingThis = editingAlt === item.id;

  return (
    <div className={cn(
      "group relative rounded-lg border overflow-hidden bg-[var(--color-bg-tertiary,#374151)]",
      isSelected
        ? "border-[var(--color-accent,#ffffff)] ring-2 ring-[var(--color-accent,#ffffff)]"
        : "border-[var(--color-border,#374151)]"
    )}>
      <button
        onClick={() => onSelect(item)}
        className="w-full aspect-square flex items-center justify-center overflow-hidden cursor-pointer relative"
      >
        {multiSelect && (
          <div className={cn(
            "absolute top-2 left-2 z-10 w-5 h-5 rounded border-2 flex items-center justify-center transition",
            isSelected
              ? "bg-[var(--color-accent,#ffffff)] border-[var(--color-accent,#ffffff)]"
              : "border-white/70 bg-black/30"
          )}>
            {isSelected && (
              <svg className="w-3 h-3 text-[var(--color-primary-text,#111827)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
        )}
        {item.type === "IMAGE" ? (
          <img
            src={item.url}
            alt={item.alt || item.filename}
            className="w-full h-full object-cover"
          />
        ) : item.type === "AUDIO" ? (
          <div className="flex flex-col items-center gap-1 text-[var(--color-text-muted,#6b7280)]">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
            <span className="text-xs">{item.duration ? formatDuration(item.duration) : "Audio"}</span>
          </div>
        ) : item.type === "VIDEO" || item.type === "EMBED" ? (
          <div className="flex flex-col items-center gap-1 text-[var(--color-text-muted,#6b7280)]">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <span className="text-xs">{item.provider || "Video"}</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1 text-[var(--color-text-muted,#6b7280)]">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            <span className="text-xs">File</span>
          </div>
        )}
      </button>

      <div className="px-2 py-1.5 border-t border-[var(--color-border,#374151)]">
        <p className="text-xs text-[var(--color-text-primary,#ffffff)] truncate" title={item.filename}>
          {item.filename}
        </p>
        {isEditingThis ? (
          <input
            ref={altInputRef}
            autoFocus
            defaultValue={item.alt || ""}
            onBlur={(e) => onSaveAlt(item.id, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onSaveAlt(item.id, (e.target as HTMLInputElement).value);
              } else if (e.key === "Escape") {
                onEditAlt(null);
              }
            }}
            className="w-full mt-0.5 px-1 py-0.5 text-xs bg-[var(--color-bg-primary,#111827)] rounded border border-[var(--color-accent,#ffffff)] text-[var(--color-text-primary,#ffffff)] focus:outline-none"
            placeholder="Alt text..."
          />
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEditAlt(item.id);
            }}
            className="w-full text-left mt-0.5 text-xs text-[var(--color-text-muted,#6b7280)] hover:text-[var(--color-text-primary,#ffffff)] transition truncate cursor-pointer"
            title="Click to edit alt text"
          >
            {item.alt || "Add alt text..."}
          </button>
        )}
      </div>
    </div>
  );
}

// --- Upload Progress Item ---

function UploadProgressItem({
  upload,
  onCancel,
  compact,
}: {
  upload: FileUploadState;
  onCancel: (id: string) => void;
  compact?: boolean;
}) {
  return (
    <div className={cn(
      "flex items-center gap-2 rounded-lg bg-[var(--color-bg-tertiary,#374151)] border border-[var(--color-border,#374151)]",
      compact ? "px-2.5 py-1.5" : "px-3 py-2"
    )}>
      {/* Status icon */}
      <div className="flex-shrink-0 w-4 h-4">
        {upload.status === "queued" && (
          <svg className="w-4 h-4 text-[var(--color-text-muted,#6b7280)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )}
        {upload.status === "uploading" && (
          <svg className="w-4 h-4 text-[var(--color-accent,#ffffff)] animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {upload.status === "processing" && (
          <svg className="w-4 h-4 text-[var(--color-accent,#ffffff)] animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {upload.status === "done" && (
          <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        )}
        {upload.status === "error" && (
          <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        )}
      </div>

      {/* File info + progress */}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-[var(--color-text-primary,#ffffff)] truncate">
          {upload.file.name}
        </p>
        {(upload.status === "uploading" || upload.status === "processing") && (
          <div className="mt-1 w-full h-1 rounded-full bg-[var(--color-bg-primary,#111827)] overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--color-accent,#ffffff)] transition-all duration-200"
              style={{ width: `${upload.progress}%` }}
            />
          </div>
        )}
        {upload.status === "error" && (
          <p className="text-xs text-red-400 mt-0.5 truncate">{upload.error}</p>
        )}
      </div>

      {/* Size / progress % */}
      <div className="flex-shrink-0 text-xs text-[var(--color-text-muted,#6b7280)]">
        {upload.status === "uploading" || upload.status === "processing"
          ? `${upload.progress}%`
          : upload.status === "queued"
            ? formatBytes(upload.file.size)
            : ""}
      </div>

      {/* Cancel/Remove button */}
      {(upload.status === "queued" || upload.status === "uploading") && (
        <button
          onClick={() => onCancel(upload.id)}
          className="flex-shrink-0 p-1 text-[var(--color-text-muted,#6b7280)] hover:text-red-400 transition cursor-pointer"
          title={upload.status === "uploading" ? "Cancel upload" : "Remove from queue"}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

// --- Embed Tab ---

function EmbedTab({
  apiBase,
  onSelect,
}: {
  apiBase: string;
  onSelect: (media: MediaItem) => void;
}) {
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const detected = url.match(/youtube\.com|youtu\.be/)
    ? "YouTube"
    : url.match(/vimeo\.com/)
      ? "Vimeo"
      : null;

  const handleSubmit = async () => {
    if (!url.trim()) return;
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ embedUrl: url }),
      });

      if (!res.ok) {
        const json = await res.json();
        setError(json.error || "Failed to add embed");
        return;
      }

      const json = await res.json();
      onSelect(json.item);
    } catch {
      setError("Failed to add embed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-[var(--color-text-primary,#ffffff)] mb-2">
          Video URL
        </label>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
          className="w-full px-4 py-2 bg-[var(--color-bg-tertiary,#374151)] rounded-lg border border-[var(--color-border,#374151)] text-[var(--color-text-primary,#ffffff)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent,#ffffff)] placeholder:text-[var(--color-text-muted,#6b7280)]"
        />
      </div>

      {detected && (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-green-500/20 text-green-400 border border-green-500/40">
          {detected} detected
        </div>
      )}

      <div className="text-xs text-[var(--color-text-muted,#6b7280)] space-y-1">
        <p>Supported providers:</p>
        <ul className="list-disc list-inside">
          <li>YouTube (youtube.com, youtu.be)</li>
          <li>Vimeo (vimeo.com)</li>
        </ul>
      </div>

      <button
        onClick={handleSubmit}
        disabled={!detected || saving}
        className="px-4 py-2 text-sm font-medium bg-[var(--color-primary,#ffffff)] text-[var(--color-primary-text,#111827)] rounded-lg transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
      >
        {saving ? "Adding..." : "Add Embed"}
      </button>
    </div>
  );
}
