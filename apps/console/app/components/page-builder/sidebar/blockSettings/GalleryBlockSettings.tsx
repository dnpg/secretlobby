import { useMemo } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { cn, MediaPicker, type MediaItem } from "@secretlobby/ui";
import { BorderRadiusInput } from "~/components/border-radius-input";
import { DragHandleIcon, GalleryIcon, TrashIcon } from "../../icons";
import { usePageBuilder } from "../../state/provider";
import type {
  GalleryBlockContent,
  GalleryImage,
  GalleryStyle,
} from "../../state/types";

interface GalleryBlockSettingsProps {
  blockId: string;
  content: GalleryBlockContent;
  onUpdate: (content: Partial<GalleryBlockContent>) => void;
}

const STYLE_OPTIONS: { value: GalleryStyle; label: string }[] = [
  { value: "slider", label: "Slider" },
  { value: "grid", label: "Grid" },
  { value: "masonry", label: "Masonry" },
];

// Polyfill — crypto.randomUUID exists everywhere current Console targets, but
// we keep a fallback so unit/JSDOM environments don't blow up.
function freshId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `img-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function GalleryBlockSettings({
  blockId,
  content,
  onUpdate,
}: GalleryBlockSettingsProps) {
  const { state } = usePageBuilder();
  const images = content.images ?? [];
  const style = content.style ?? "grid";

  // Border-radius defaults: when the user hasn't picked one, reflect the
  // theme's cardBorderRadius in the picker so the canvas matches what they
  // see. Mirrors ImageBlockSettings exactly.
  const themeBorderRadius = state.theme.cardBorderRadius;
  const effectiveBorderRadius =
    content.imageBorderRadius !== undefined
      ? content.imageBorderRadius
      : themeBorderRadius;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const imageIds = useMemo(() => images.map((i) => i.id), [images]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = imageIds.indexOf(active.id as string);
    const newIndex = imageIds.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;
    onUpdate({ images: arrayMove(images, oldIndex, newIndex) });
  };

  const updateImage = (id: string, patch: Partial<GalleryImage>) => {
    onUpdate({
      images: images.map((img) => (img.id === id ? { ...img, ...patch } : img)),
    });
  };

  const deleteImage = (id: string) => {
    onUpdate({ images: images.filter((img) => img.id !== id) });
  };

  const appendMedia = (media: MediaItem[]) => {
    const fresh: GalleryImage[] = media.map((m) => ({
      id: freshId(),
      mediaId: m.id,
      mediaUrl: m.url,
      alt: m.alt ?? undefined,
    }));
    onUpdate({ images: [...images, ...fresh] });
  };

  const showColumns = style === "grid" || style === "masonry";
  const showSliderOpts = style === "slider";

  return (
    <>
      {/* Layout style */}
      <div>
        <label className="block text-sm font-medium text-theme-primary mb-2">
          Layout
        </label>
        <div className="flex gap-2">
          {STYLE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onUpdate({ style: opt.value })}
              className={cn(
                "flex-1 px-2 py-2 text-xs rounded-lg border transition-colors cursor-pointer capitalize",
                style === opt.value
                  ? "bg-[var(--color-brand-red-muted)] border-[var(--color-brand-red)] text-[var(--color-brand-red)]"
                  : "border-theme text-theme-secondary hover:bg-theme-tertiary"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Columns (grid + masonry only) */}
      {showColumns && (
        <div>
          <label
            htmlFor={`gallery-${blockId}-columns`}
            className="block text-sm font-medium text-theme-primary mb-2"
          >
            Columns
          </label>
          <input
            id={`gallery-${blockId}-columns`}
            type="number"
            min={2}
            max={6}
            value={content.columns ?? 3}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              if (Number.isNaN(n)) return;
              onUpdate({ columns: Math.min(6, Math.max(2, n)) });
            }}
            className="w-full px-3 py-2 text-sm bg-theme-tertiary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-red)]"
          />
        </div>
      )}

      {/* Gap */}
      <div>
        <label
          htmlFor={`gallery-${blockId}-gap`}
          className="block text-sm font-medium text-theme-primary mb-2"
        >
          Gap <span className="text-xs text-theme-muted font-normal">px</span>
        </label>
        <input
          id={`gallery-${blockId}-gap`}
          type="number"
          min={0}
          max={64}
          value={content.gap ?? 8}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10);
            if (Number.isNaN(n)) return;
            onUpdate({ gap: Math.min(64, Math.max(0, n)) });
          }}
          className="w-full px-3 py-2 text-sm bg-theme-tertiary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-red)]"
        />
      </div>

      {/* Image border radius */}
      <div>
        <label className="block text-sm font-medium text-theme-primary mb-2">
          Image border radius
        </label>
        <BorderRadiusInput
          value={effectiveBorderRadius}
          onChange={(next) => onUpdate({ imageBorderRadius: next })}
          min={0}
          max={9999}
        />
      </div>

      {/* Slider-only options */}
      {showSliderOpts && (
        <div className="pt-3 border-t border-theme space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={content.autoplay ?? false}
              onChange={(e) => onUpdate({ autoplay: e.target.checked })}
              className="accent-[var(--color-brand-red)]"
            />
            <span className="text-sm text-theme-secondary">Autoplay</span>
          </label>
          {content.autoplay && (
            <div>
              <label
                htmlFor={`gallery-${blockId}-interval`}
                className="block text-xs text-theme-muted mb-1"
              >
                Interval (ms)
              </label>
              <input
                id={`gallery-${blockId}-interval`}
                type="number"
                min={1000}
                max={15000}
                step={500}
                value={content.autoplayIntervalMs ?? 4000}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  if (Number.isNaN(n)) return;
                  onUpdate({
                    autoplayIntervalMs: Math.min(15000, Math.max(1000, n)),
                  });
                }}
                className="w-full px-3 py-2 text-sm bg-theme-tertiary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-red)]"
              />
            </div>
          )}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={content.showArrows ?? true}
              onChange={(e) => onUpdate({ showArrows: e.target.checked })}
              className="accent-[var(--color-brand-red)]"
            />
            <span className="text-sm text-theme-secondary">Show arrows</span>
          </label>
        </div>
      )}

      {/* Image list */}
      <div className="pt-3 border-t border-theme">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-theme-primary">
            Images
            <span className="ml-1 text-xs text-theme-muted font-normal">
              ({images.length})
            </span>
          </label>
        </div>

        {images.length === 0 ? (
          <p className="text-xs text-theme-muted mb-2">No images yet.</p>
        ) : (
          <DndContext
            id={`gallery-${blockId}`}
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={imageIds}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {images.map((img) => (
                  <SortableImageRow
                    key={img.id}
                    image={img}
                    onUpdate={(patch) => updateImage(img.id, patch)}
                    onDelete={() => deleteImage(img.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        <div className="mt-2">
          <MediaPicker
            accept={["image/*"]}
            tabs={["library", "upload"]}
            multiSelect
            onSelect={(media) => appendMedia([media])}
            onSelectMultiple={(media) => appendMedia(media)}
          >
            <button className="w-full py-4 border-2 border-dashed border-theme rounded-lg text-theme-secondary hover:text-theme-primary hover:border-[var(--color-brand-red)]/50 transition-colors cursor-pointer flex flex-col items-center gap-1.5">
              <GalleryIcon className="w-6 h-6" />
              <span className="text-xs">Add images</span>
            </button>
          </MediaPicker>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// SortableImageRow — single row in the gallery image list. Mirrors the dnd-kit
// setup used for blocks in LeftRail: drag handle owns the listeners, the rest
// of the row is regular inputs / buttons.
// ---------------------------------------------------------------------------
interface SortableImageRowProps {
  image: GalleryImage;
  onUpdate: (patch: Partial<GalleryImage>) => void;
  onDelete: () => void;
}

function SortableImageRow({
  image,
  onUpdate,
  onDelete,
}: SortableImageRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: image.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 30 : undefined,
    opacity: isDragging ? 0.85 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-start gap-2 p-2 border border-theme rounded-lg bg-theme-tertiary"
    >
      <button
        type="button"
        aria-label="Drag to reorder image"
        title="Drag to reorder"
        className={cn(
          "p-0.5 mt-1 rounded text-theme-muted hover:text-theme-primary flex-shrink-0 cursor-grab active:cursor-grabbing touch-none",
          isDragging && "cursor-grabbing"
        )}
        {...attributes}
        {...listeners}
      >
        <DragHandleIcon className="w-3.5 h-3.5" />
      </button>

      <div className="w-8 h-8 flex-shrink-0 rounded bg-theme-secondary overflow-hidden">
        {image.mediaUrl ? (
          <img
            src={image.mediaUrl}
            alt={image.alt || ""}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-theme-muted">
            <GalleryIcon className="w-4 h-4" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 space-y-1.5">
        <input
          type="text"
          value={image.alt || ""}
          onChange={(e) => onUpdate({ alt: e.target.value })}
          placeholder="Alt text"
          className="w-full px-2 py-1 text-xs bg-theme-secondary border border-theme rounded text-theme-primary placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-red)]"
        />
        <input
          type="text"
          value={image.linkUrl || ""}
          onChange={(e) => onUpdate({ linkUrl: e.target.value })}
          placeholder="Link URL (optional)"
          className="w-full px-2 py-1 text-xs bg-theme-secondary border border-theme rounded text-theme-primary placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-red)]"
        />
      </div>

      <button
        type="button"
        onClick={onDelete}
        aria-label="Delete image"
        title="Delete image"
        className="p-1 mt-0.5 rounded text-theme-muted hover:text-red-400 cursor-pointer flex-shrink-0"
      >
        <TrashIcon />
      </button>
    </div>
  );
}
