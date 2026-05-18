import { MediaPicker, type MediaItem } from "@secretlobby/ui";
import {
  BorderRadiusInput,
  radiiEqual,
} from "~/components/border-radius-input";
import { CssLengthInput } from "~/components/css-length-input";
import {
  DesktopIcon,
  ImageIcon,
  MobileIcon,
  RefreshIcon,
  TabletIcon,
} from "../../icons";
import { usePageBuilder } from "../../state/provider";
import type { ImageBlockContent } from "../../state/types";
import type { BorderStyle } from "~/lib/theme";
import { HexPickerRow } from "../ThemeFieldRows";

// Border styles supported by the basic image-border picker. Mirrors the
// CSS `border-style` values consumers (Card, Image) reuse. We expose the
// common subset — `hidden`, `groove`, `ridge`, `inset`, `outset` are rarely
// used in design and would noise up the dropdown.
const BORDER_STYLES: BorderStyle[] = [
  "solid",
  "dashed",
  "dotted",
  "double",
  "none",
];

interface ImageBlockSettingsProps {
  content: ImageBlockContent;
  onUpdate: (content: Partial<ImageBlockContent>) => void;
}

export function ImageBlockSettings({ content, onUpdate }: ImageBlockSettingsProps) {
  const { state } = usePageBuilder();
  // Theme's imageBorderRadius is a `BorderRadius` (number for uniform | per-
  // corner object). The block override is the same shape, so the picker can
  // round-trip both forms — when the user hasn't overridden anything, we
  // display the theme value in the picker.
  const themeBorderRadius = state.theme.imageBorderRadius ?? 12;
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

  // Border field overrides — each falls back to the matching theme.image*
  // when undefined. "Modified" means the override exists AND differs from the
  // theme so the reset button only appears when there's actually something to
  // reset to (otherwise it's a no-op).
  const themeBorderWidth = state.theme.imageBorderWidth ?? "0";
  const themeBorderColor =
    state.theme.imageBorderColor ?? state.theme.border ?? "#000000";
  const themeBorderStyle: BorderStyle = state.theme.imageBorderStyle ?? "solid";
  const effectiveBorderWidth = content.imageBorderWidth ?? themeBorderWidth;
  const effectiveBorderColor = content.imageBorderColor ?? themeBorderColor;
  const effectiveBorderStyle = content.imageBorderStyle ?? themeBorderStyle;
  // When the effective border style is `none`, the renderer paints no
  // border and the Width / Color fields are visually irrelevant — hide
  // them entirely so the panel mirrors what the user sees on the canvas.
  const borderEnabled = effectiveBorderStyle !== "none";
  const isBorderWidthModified =
    content.imageBorderWidth !== undefined &&
    content.imageBorderWidth !== themeBorderWidth;
  const isBorderColorModified =
    content.imageBorderColor !== undefined &&
    content.imageBorderColor !== themeBorderColor;
  const isBorderStyleModified =
    content.imageBorderStyle !== undefined &&
    content.imageBorderStyle !== themeBorderStyle;

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
                onSelect={(media: MediaItem) =>
                  onUpdate({
                    mediaId: media.id,
                    mediaUrl: media.url,
                    // Capture intrinsic dimensions so the renderer can stamp
                    // them onto the <img> width/height attrs and reserve
                    // layout space. `null` from MediaItem maps to undefined
                    // so the renderer's fallback kicks in.
                    mediaWidth: media.width ?? undefined,
                    mediaHeight: media.height ?? undefined,
                  })
                }
              >
                <button className="flex-1 px-3 py-2 text-xs bg-theme-tertiary border border-theme rounded-lg text-theme-secondary hover:text-theme-primary hover:bg-theme-secondary transition-colors cursor-pointer">
                  Change
                </button>
              </MediaPicker>
              <button
                onClick={() =>
                  onUpdate({
                    mediaId: undefined,
                    mediaUrl: undefined,
                    mediaWidth: undefined,
                    mediaHeight: undefined,
                  })
                }
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
            onSelect={(media: MediaItem) =>
                  onUpdate({
                    mediaId: media.id,
                    mediaUrl: media.url,
                    // Capture intrinsic dimensions so the renderer can stamp
                    // them onto the <img> width/height attrs and reserve
                    // layout space. `null` from MediaItem maps to undefined
                    // so the renderer's fallback kicks in.
                    mediaWidth: media.width ?? undefined,
                    mediaHeight: media.height ?? undefined,
                  })
                }
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
                onSelect={(media: MediaItem) =>
                  onUpdate({
                    tabletMediaId: media.id,
                    tabletMediaUrl: media.url,
                    tabletMediaWidth: media.width ?? undefined,
                    tabletMediaHeight: media.height ?? undefined,
                  })
                }
              >
                <button className="flex-1 px-3 py-2 text-xs bg-theme-tertiary border border-theme rounded-lg text-theme-secondary hover:text-theme-primary hover:bg-theme-secondary transition-colors cursor-pointer">
                  Change
                </button>
              </MediaPicker>
              <button
                onClick={() =>
                  onUpdate({
                    tabletMediaId: undefined,
                    tabletMediaUrl: undefined,
                    tabletMediaWidth: undefined,
                    tabletMediaHeight: undefined,
                  })
                }
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
            onSelect={(media: MediaItem) =>
                  onUpdate({
                    tabletMediaId: media.id,
                    tabletMediaUrl: media.url,
                    tabletMediaWidth: media.width ?? undefined,
                    tabletMediaHeight: media.height ?? undefined,
                  })
                }
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
                onSelect={(media: MediaItem) =>
                  onUpdate({
                    mobileMediaId: media.id,
                    mobileMediaUrl: media.url,
                    mobileMediaWidth: media.width ?? undefined,
                    mobileMediaHeight: media.height ?? undefined,
                  })
                }
              >
                <button className="flex-1 px-3 py-2 text-xs bg-theme-tertiary border border-theme rounded-lg text-theme-secondary hover:text-theme-primary hover:bg-theme-secondary transition-colors cursor-pointer">
                  Change
                </button>
              </MediaPicker>
              <button
                onClick={() =>
                  onUpdate({
                    mobileMediaId: undefined,
                    mobileMediaUrl: undefined,
                    mobileMediaWidth: undefined,
                    mobileMediaHeight: undefined,
                  })
                }
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
            onSelect={(media: MediaItem) =>
                  onUpdate({
                    mobileMediaId: media.id,
                    mobileMediaUrl: media.url,
                    mobileMediaWidth: media.width ?? undefined,
                    mobileMediaHeight: media.height ?? undefined,
                  })
                }
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
          max={9999}
        />
      </div>

      {/* Border — style / width / color with per-field theme override.
          Style is first because it gates the rest: when the effective style
          is `none`, width and color are visually meaningless on the canvas,
          so we collapse them out of the panel too. Each field keeps the
          Border radius row's "red dot + reset" pattern so the user can
          revert any single override independently. */}
      <div className="pt-3 border-t border-theme">
        <label className="block text-sm font-medium text-theme-primary mb-2">
          Border
        </label>

        <div className="space-y-2">
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs text-theme-muted flex items-center gap-1.5">
                <span>Style</span>
                {isBorderStyleModified && (
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-[var(--color-brand-red)] flex-shrink-0"
                    aria-label="Modified from theme"
                    title="Modified from theme"
                  />
                )}
              </label>
              {isBorderStyleModified && (
                <button
                  type="button"
                  onClick={() => onUpdate({ imageBorderStyle: undefined })}
                  className="p-1 rounded text-theme-muted hover:text-theme-primary hover:bg-theme-tertiary cursor-pointer transition-colors"
                  title="Reset to theme value"
                  aria-label="Reset border style to theme value"
                >
                  <RefreshIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <select
              value={effectiveBorderStyle}
              onChange={(e) =>
                onUpdate({ imageBorderStyle: e.target.value as BorderStyle })
              }
              className="w-full px-3 py-2 text-sm bg-theme-tertiary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-red)] cursor-pointer"
              aria-label="Image border style override"
            >
              {BORDER_STYLES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {borderEnabled && (
            <>
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs text-theme-muted flex items-center gap-1.5">
                    <span>Width</span>
                    {isBorderWidthModified && (
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-[var(--color-brand-red)] flex-shrink-0"
                        aria-label="Modified from theme"
                        title="Modified from theme"
                      />
                    )}
                  </label>
                  {isBorderWidthModified && (
                    <button
                      type="button"
                      onClick={() => onUpdate({ imageBorderWidth: undefined })}
                      className="p-1 rounded text-theme-muted hover:text-theme-primary hover:bg-theme-tertiary cursor-pointer transition-colors"
                      title="Reset to theme value"
                      aria-label="Reset border width to theme value"
                    >
                      <RefreshIcon className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <CssLengthInput
                  value={effectiveBorderWidth}
                  onChange={(next) => onUpdate({ imageBorderWidth: next })}
                  min={0}
                  max={64}
                  ariaLabel="Image border width override"
                  placeholder={themeBorderWidth}
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs text-theme-muted flex items-center gap-1.5">
                    <span>Color</span>
                    {isBorderColorModified && (
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-[var(--color-brand-red)] flex-shrink-0"
                        aria-label="Modified from theme"
                        title="Modified from theme"
                      />
                    )}
                  </label>
                  {isBorderColorModified && (
                    <button
                      type="button"
                      onClick={() => onUpdate({ imageBorderColor: undefined })}
                      className="p-1 rounded text-theme-muted hover:text-theme-primary hover:bg-theme-tertiary cursor-pointer transition-colors"
                      title="Reset to theme value"
                      aria-label="Reset border color to theme value"
                    >
                      <RefreshIcon className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <HexPickerRow
                  label="Border color"
                  value={effectiveBorderColor}
                  onChange={(next) => onUpdate({ imageBorderColor: next })}
                  renderLabel={false}
                />
              </div>
            </>
          )}
        </div>
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
