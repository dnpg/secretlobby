import { useMemo } from "react";
import {
  SocialLinks,
  type SocialLinksSettings,
} from "@secretlobby/lobby-template";
import { usePageBuilder } from "../../state/provider";
import type { SocialLinksBlockContent } from "../../state/types";

interface SocialLinksBlockProps {
  content: SocialLinksBlockContent;
}

// Renders the lobby's globally-configured social media links via the shared
// `<SocialLinks />` component from `@secretlobby/lobby-template` — same nav +
// anchor + icon markup the lobby home page uses, so the page-builder preview
// and the published lobby render identically.
//
// Data flow:
//   - The link list (`{ platform, url }[]`) is read from `state.socialLinks`,
//     which the loader fetches via `getLobbySocialLinksSettings`. The block
//     never writes back; mutating links still happens on
//     `/lobby/{id}/social`.
//   - The block content carries optional per-instance overrides
//     (`alignment`, `iconStyle`, `iconColor`). Each falls back to whatever's
//     on the lobby settings, so multiple Social Links blocks can have
//     different visual treatments without changing the global config.
//
// Empty-state UX: when no links are configured, the underlying SocialLinks
// returns `null`. We render a small placeholder card in edit mode only so
// the user knows the block exists and how to populate it; preview/published
// modes stay clean (no link → no DOM).
export function SocialLinksBlock({ content }: SocialLinksBlockProps) {
  const { state } = usePageBuilder();
  const isEditing = state.mode === "edit";

  const mergedSettings = useMemo<SocialLinksSettings>(() => {
    const base = state.socialLinks;
    return {
      ...base,
      // Override one field at a time so the user can configure just
      // alignment (for example) and inherit everything else. `undefined`
      // means "use the lobby setting" — spreading `base` first preserves
      // the original values when the override is unset.
      iconAlignment: content.alignment ?? base.iconAlignment,
      iconStyle: content.iconStyle ?? base.iconStyle,
      iconColor: content.iconColor ?? base.iconColor,
      gap: content.gap ?? base.gap,
      // The block surface is for the icon row only. Strip the global title
      // + WYSIWYG content fields so the block stays focused on the row of
      // social icons the user dragged onto the canvas — they can drop a
      // separate Heading / Paragraph block above if they want a title.
      title: undefined,
      contentBefore: undefined,
      contentAfter: undefined,
    };
  }, [
    state.socialLinks,
    content.alignment,
    content.iconStyle,
    content.iconColor,
    content.gap,
  ]);

  const hasLinks =
    !!state.socialLinks.links && state.socialLinks.links.length > 0;

  if (!hasLinks) {
    if (!isEditing) return null;
    return (
      <div className="w-full p-4 rounded-lg border border-dashed border-theme text-center">
        <p className="text-sm text-theme-secondary">No social links yet</p>
        <p className="text-xs text-theme-muted mt-1">
          Add links on the lobby's Social settings page.
        </p>
      </div>
    );
  }

  return <SocialLinks settings={mergedSettings} />;
}
