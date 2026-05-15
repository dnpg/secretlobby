import { MediaPicker, type MediaItem } from "@secretlobby/ui";
import {
  BorderRadiusInput,
  radiiEqual,
} from "~/components/border-radius-input";
import {
  DesktopIcon,
  ImageIcon,
  MobileIcon,
  RefreshIcon,
  TabletIcon,
} from "../../icons";
import { usePageBuilder } from "../../state/provider";
import type { ImageBlockContent } from "../../state/types";

interface ImageBlockSettingsProps {
  content: ImageBlockContent;
  onUpdate: (content: Partial<ImageBlockContent>) => void;
}

export function ImageBlockSettings({ content, onUpdate }: ImageBlockSettingsProps) {
  const { state } = usePageBuilder();
  // Theme's cardBorderRadius is a `BorderRadius` (number for uniform | per-
  // corner object). The image override is the same shape, so the picker can
  // round-trip both forms — when the user hasn't overridden anything, we
  // display the theme value in the picker.
  const themeBorderRadius = state.theme.cardBorderRadius;
  const hasBorderRadiusOverride = content.imageBorderRadius !== undefined;
  const effectiveBorderRadius = hasBorderRadiusOverride
    ? (content.imageBorderRadius as NonNullable<typeof content.imageBorderRadius>)
    : themeBorderRadius;
  // "Modified" mirrors the BlockColorOverrides convention: stored value exists
  // AND it diverges from the theme. An override that happens to deep-equal the
  // theme value isn't considered modified so the indicator stays meaningful.
  const isBorderRadiusModified =
    hasBorderRadiusOverride &&
    !radiiEqual(content.imageBorderRadius, themeBorderRadius);

  return (
    <>
      {/* Desktop Image (required) */}
      <div>
        <label className="block text-sm font-medium text-theme-primary mb-2">
          <DesktopIcon /> Desktop Image
        </label>
        {content.mediaUrl ? (
          <div className="space-y-2">
            <div className="relative aspect-video bg-theme-tertiary rounded-lg overflow-hidden">
              <img src={content.mediaUrl} alt={content.alt || ""} className="w-full h-full object-cover" />
            </div>
            <div className="flex gap-2">
              <MediaPicker
                accept={["image/*"]}
                tabs={["library", "upload"]}
                onSelect={(media: MediaItem) => onUpdate({ mediaId: media.id, mediaUrl: media.url })}
              >
                <button className="flex-1 px-3 py-2 text-xs bg-theme-tertiary border border-theme rounded-lg text-theme-secondary hover:text-theme-primary hover:bg-theme-secondary transition-colors cursor-pointer">
                  Change
                </button>
              </MediaPicker>
              <button
                onClick={() => onUpdate({ mediaId: undefined, mediaUrl: undefined })}
                className="px-3 py-2 text-xs border border-red-500/30 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <MediaPicker
            accept={["image/*"]}
            tabs={["library", "upload"]}
            onSelect={(media: MediaItem) => onUpdate({ mediaId: media.id, mediaUrl: media.url })}
          >
            <button className="w-full py-8 border-2 border-dashed border-theme rounded-lg text-theme-secondary hover:text-theme-primary hover:border-[var(--color-brand-red)]/50 transition-colors cursor-pointer flex flex-col items-center gap-2">
              <ImageIcon className="w-8 h-8" />
              <span className="text-xs">Select Image</span>
            </button>
          </MediaPicker>
        )}
      </div>

      {/* Tablet Image (optional override) */}
      <div className="pt-3 border-t border-theme">
        <label className="block text-sm font-medium text-theme-primary mb-2">
          <TabletIcon /> Tablet Override <span className="text-xs text-theme-muted font-normal">(optional)</span>
        </label>
        {content.tabletMediaUrl ? (
          <div className="space-y-2">
            <div className="relative aspect-video bg-theme-tertiary rounded-lg overflow-hidden">
              <img src={content.tabletMediaUrl} alt={content.alt || ""} className="w-full h-full object-cover" />
            </div>
            <div className="flex gap-2">
              <MediaPicker
                accept={["image/*"]}
                tabs={["library", "upload"]}
                onSelect={(media: MediaItem) => onUpdate({ tabletMediaId: media.id, tabletMediaUrl: media.url })}
              >
                <button className="flex-1 px-3 py-2 text-xs bg-theme-tertiary border border-theme rounded-lg text-theme-secondary hover:text-theme-primary hover:bg-theme-secondary transition-colors cursor-pointer">
                  Change
                </button>
              </MediaPicker>
              <button
                onClick={() => onUpdate({ tabletMediaId: undefined, tabletMediaUrl: undefined })}
                className="px-3 py-2 text-xs border border-red-500/30 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <MediaPicker
            accept={["image/*"]}
            tabs={["library", "upload"]}
            onSelect={(media: MediaItem) => onUpdate({ tabletMediaId: media.id, tabletMediaUrl: media.url })}
          >
            <button className="w-full py-4 border border-dashed border-theme rounded-lg text-theme-muted hover:text-theme-primary hover:border-[var(--color-brand-red)]/50 transition-colors cursor-pointer text-xs">
              + Add tablet image
            </button>
          </MediaPicker>
        )}
      </div>

      {/* Mobile Image (optional override) */}
      <div className="pt-3 border-t border-theme">
        <label className="block text-sm font-medium text-theme-primary mb-2">
          <MobileIcon /> Mobile Override <span className="text-xs text-theme-muted font-normal">(optional)</span>
        </label>
        {content.mobileMediaUrl ? (
          <div className="space-y-2">
            <div className="relative aspect-video bg-theme-tertiary rounded-lg overflow-hidden">
              <img src={content.mobileMediaUrl} alt={content.alt || ""} className="w-full h-full object-cover" />
            </div>
            <div className="flex gap-2">
              <MediaPicker
                accept={["image/*"]}
                tabs={["library", "upload"]}
                onSelect={(media: MediaItem) => onUpdate({ mobileMediaId: media.id, mobileMediaUrl: media.url })}
              >
                <button className="flex-1 px-3 py-2 text-xs bg-theme-tertiary border border-theme rounded-lg text-theme-secondary hover:text-theme-primary hover:bg-theme-secondary transition-colors cursor-pointer">
                  Change
                </button>
              </MediaPicker>
              <button
                onClick={() => onUpdate({ mobileMediaId: undefined, mobileMediaUrl: undefined })}
                className="px-3 py-2 text-xs border border-red-500/30 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <MediaPicker
            accept={["image/*"]}
            tabs={["library", "upload"]}
            onSelect={(media: MediaItem) => onUpdate({ mobileMediaId: media.id, mobileMediaUrl: media.url })}
          >
            <button className="w-full py-4 border border-dashed border-theme rounded-lg text-theme-muted hover:text-theme-primary hover:border-[var(--color-brand-red)]/50 transition-colors cursor-pointer text-xs">
              + Add mobile image
            </button>
          </MediaPicker>
        )}
      </div>

      {/* Alt Text */}
      <div className="pt-3 border-t border-theme">
        <label className="block text-sm font-medium text-theme-primary mb-2">Alt Text</label>
        <input
          type="text"
          value={content.alt || ""}
          onChange={(e) => onUpdate({ alt: e.target.value })}
          placeholder="Describe the image for accessibility"
          className="w-full px-3 py-2 text-sm bg-theme-tertiary border border-theme rounded-lg text-theme-primary placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-red)]"
        />
        <p className="text-xs text-theme-muted mt-1">Important for SEO and accessibility</p>
      </div>

      {/* Border Radius — defaults to the theme's cardBorderRadius. When the
          user changes it, a small red dot + reset button appear so they can
          revert to the theme value with one click. Same visual pattern as
          BlockColorOverrides. */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <label className="text-sm font-medium text-theme-primary flex items-center gap-1.5">
            <span>Border radius</span>
            {isBorderRadiusModified && (
              <span
                className="w-1.5 h-1.5 rounded-full bg-[var(--color-brand-red)] flex-shrink-0"
                aria-label="Modified from theme"
                title="Modified from theme"
              />
            )}
          </label>
          {isBorderRadiusModified && (
            <button
              type="button"
              onClick={() => onUpdate({ imageBorderRadius: undefined })}
              className="p-1 rounded text-theme-muted hover:text-theme-primary hover:bg-theme-tertiary cursor-pointer transition-colors"
              title="Reset to theme value"
              aria-label="Reset to theme value"
            >
              <RefreshIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <BorderRadiusInput
          value={effectiveBorderRadius}
          onChange={(next) => onUpdate({ imageBorderRadius: next })}
          min={0}
          max={64}
        />
      </div>

      {/* Link URL */}
      <div>
        <label className="block text-sm font-medium text-theme-primary mb-2">Link URL <span className="text-xs text-theme-muted font-normal">(optional)</span></label>
        <input
          type="text"
          value={content.linkUrl || ""}
          onChange={(e) => onUpdate({ linkUrl: e.target.value })}
          placeholder="https://..."
          className="w-full px-3 py-2 text-sm bg-theme-tertiary border border-theme rounded-lg text-theme-primary placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-red)]"
        />
      </div>
    </>
  );
}
