import { Link } from "react-router";
import { CssLengthInput } from "~/components/css-length-input";
import { RefreshIcon } from "../../icons";
import { usePageBuilder } from "../../state/provider";
import type {
  BlockContent,
  SocialLinksBlockContent,
} from "../../state/types";
import { HexPickerRow } from "../ThemeFieldRows";

interface SocialLinksBlockSettingsProps {
  content: SocialLinksBlockContent;
  onUpdate: (content: Partial<BlockContent>) => void;
}

// Per-instance overrides for the SocialLinks block. The link list itself
// lives on the lobby's Social settings page — this panel only governs how
// THIS particular block renders the links (alignment, icon style, mono
// tint). Every field is optional; when unset, the block inherits the
// lobby-level default (the same value the lobby home page uses).

const ALIGN_OPTIONS = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
] as const;

const STYLE_OPTIONS = [
  { value: "brand", label: "Brand" },
  { value: "mono", label: "Mono" },
] as const;

export function SocialLinksBlockSettings({
  content,
  onUpdate,
}: SocialLinksBlockSettingsProps) {
  const { state } = usePageBuilder();
  const settings = state.socialLinks;
  const linkCount = settings.links?.length ?? 0;

  const effectiveAlignment = content.alignment ?? settings.iconAlignment ?? "center";
  const effectiveStyle = content.iconStyle ?? settings.iconStyle ?? "mono";
  const effectiveColor = content.iconColor ?? settings.iconColor ?? "#000000";
  // Gap is a CSS length string (e.g. "8px") — same shape as cardBorderWidth.
  // Empty/unset falls back to "0" so the CssLengthInput always renders a
  // numeric value the user can scrub.
  const effectiveGap = content.gap ?? settings.gap ?? "0";

  return (
    <div className="space-y-4">
      {/* Link list summary — the user manages the actual list on the lobby's
          Social settings page, so we just surface the count + a deep link.
          Removes any confusion about whether the block carries its own list. */}
      <div className="text-xs text-theme-secondary leading-relaxed">
        {linkCount > 0
          ? `Showing ${linkCount} link${linkCount === 1 ? "" : "s"} from lobby settings.`
          : "No links configured yet."}
        {" "}
        <Link
          to="../social"
          relative="route"
          className="text-[var(--color-brand-red)] underline cursor-pointer"
        >
          Edit links
        </Link>
      </div>

      {/* Alignment override */}
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs text-theme-muted flex items-center gap-1.5">
            <span>Alignment</span>
            {content.alignment !== undefined && (
              <span
                className="w-1.5 h-1.5 rounded-full bg-[var(--color-brand-red)] flex-shrink-0"
                aria-label="Overrides the lobby setting"
                title="Overrides the lobby setting"
              />
            )}
          </label>
          {content.alignment !== undefined && (
            <button
              type="button"
              onClick={() =>
                onUpdate({ alignment: undefined } as Partial<BlockContent>)
              }
              className="p-1 rounded text-theme-muted hover:text-theme-primary hover:bg-theme-tertiary cursor-pointer"
              title="Reset to lobby setting"
              aria-label="Reset alignment to lobby setting"
            >
              <RefreshIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="flex gap-1">
          {ALIGN_OPTIONS.map((opt) => {
            const active = effectiveAlignment === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() =>
                  onUpdate({ alignment: opt.value } as Partial<BlockContent>)
                }
                className={
                  active
                    ? "flex-1 px-2 py-1 rounded text-xs bg-[var(--color-brand-red)] text-white cursor-pointer"
                    : "flex-1 px-2 py-1 rounded text-xs border border-theme text-theme-secondary hover:text-theme-primary cursor-pointer"
                }
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Icon style override */}
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs text-theme-muted flex items-center gap-1.5">
            <span>Icon style</span>
            {content.iconStyle !== undefined && (
              <span
                className="w-1.5 h-1.5 rounded-full bg-[var(--color-brand-red)] flex-shrink-0"
                aria-label="Overrides the lobby setting"
                title="Overrides the lobby setting"
              />
            )}
          </label>
          {content.iconStyle !== undefined && (
            <button
              type="button"
              onClick={() =>
                onUpdate({ iconStyle: undefined } as Partial<BlockContent>)
              }
              className="p-1 rounded text-theme-muted hover:text-theme-primary hover:bg-theme-tertiary cursor-pointer"
              title="Reset to lobby setting"
              aria-label="Reset icon style to lobby setting"
            >
              <RefreshIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="flex gap-1">
          {STYLE_OPTIONS.map((opt) => {
            const active = effectiveStyle === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() =>
                  onUpdate({ iconStyle: opt.value } as Partial<BlockContent>)
                }
                className={
                  active
                    ? "flex-1 px-2 py-1 rounded text-xs bg-[var(--color-brand-red)] text-white cursor-pointer"
                    : "flex-1 px-2 py-1 rounded text-xs border border-theme text-theme-secondary hover:text-theme-primary cursor-pointer"
                }
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Gap override — spacing between icon buttons. 0 packs them flush
          (the legacy look); larger values give the row room to breathe.
          Persisted as a number in pixels. */}
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs text-theme-muted flex items-center gap-1.5">
            <span>Gap</span>
            {content.gap !== undefined && (
              <span
                className="w-1.5 h-1.5 rounded-full bg-[var(--color-brand-red)] flex-shrink-0"
                aria-label="Overrides the lobby setting"
                title="Overrides the lobby setting"
              />
            )}
          </label>
          {content.gap !== undefined && (
            <button
              type="button"
              onClick={() =>
                onUpdate({ gap: undefined } as Partial<BlockContent>)
              }
              className="p-1 rounded text-theme-muted hover:text-theme-primary hover:bg-theme-tertiary cursor-pointer"
              title="Reset to lobby setting"
              aria-label="Reset gap to lobby setting"
            >
              <RefreshIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <CssLengthInput
          value={effectiveGap}
          onChange={(next) =>
            onUpdate({ gap: next } as Partial<BlockContent>)
          }
          min={0}
          max={64}
          ariaLabel="Gap between social icons"
          placeholder={settings.gap ?? "0"}
        />
      </div>

      {/* Mono tint — only relevant when the effective icon style is mono.
          Hidden for brand-style icons because brand SVGs hard-code their own
          colors and the tint has no visible effect. */}
      {effectiveStyle === "mono" && (
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs text-theme-muted flex items-center gap-1.5">
              <span>Icon color</span>
              {content.iconColor !== undefined && (
                <span
                  className="w-1.5 h-1.5 rounded-full bg-[var(--color-brand-red)] flex-shrink-0"
                  aria-label="Overrides the lobby setting"
                  title="Overrides the lobby setting"
                />
              )}
            </label>
            {content.iconColor !== undefined && (
              <button
                type="button"
                onClick={() =>
                  onUpdate({ iconColor: undefined } as Partial<BlockContent>)
                }
                className="p-1 rounded text-theme-muted hover:text-theme-primary hover:bg-theme-tertiary cursor-pointer"
                title="Reset to lobby setting"
                aria-label="Reset icon color to lobby setting"
              >
                <RefreshIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <HexPickerRow
            label="Icon color"
            value={effectiveColor}
            onChange={(v) =>
              onUpdate({ iconColor: v } as Partial<BlockContent>)
            }
            renderLabel={false}
          />
        </div>
      )}
    </div>
  );
}
