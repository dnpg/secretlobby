// =============================================================================
// SocialLinksBlockView
// -----------------------------------------------------------------------------
// Renders a Social Links block on the lobby. Delegates to the existing
// `<SocialLinks />` component (also in this package) so the icon row, gap
// behaviour, and alignment match every other social-links surface on the
// site.
//
// Caller hands us the lobby's resolved `socialLinks` settings — this view
// can't read them itself because it lives in a presentation-only package
// (no router / loader access). The editor passes them from page-builder
// context; the lobby passes them from its route loader.
//
// The block's per-instance overrides (`alignment`, `iconStyle`, `iconColor`,
// `gap`) are merged on top of the lobby's global settings. When all overrides
// are unset, this paints identically to a default `<SocialLinks />` somewhere
// else on the page.
//
// Empty-state: if the lobby has no configured links, render nothing. The
// editor's own SocialLinksBlock wrapper adds an "edit mode" placeholder
// pointing the user at the Social settings page — that's editor chrome, not
// the view's job.
// =============================================================================

import { useMemo } from "react";
import { SocialLinks, type SocialLinksSettings } from "../SocialLinks";
import type { SocialLinksBlockContent } from "./types";

export interface SocialLinksBlockViewProps {
  content: SocialLinksBlockContent;
  /** Lobby-level social settings. The block's per-instance overrides apply
   *  on top of this; fields the block leaves undefined inherit from here. */
  socialLinks: SocialLinksSettings;
}

export function SocialLinksBlockView({
  content,
  socialLinks,
}: SocialLinksBlockViewProps) {
  const merged = useMemo<SocialLinksSettings>(() => {
    return {
      ...socialLinks,
      iconAlignment: content.alignment ?? socialLinks.iconAlignment,
      iconStyle: content.iconStyle ?? socialLinks.iconStyle,
      iconColor: content.iconColor ?? socialLinks.iconColor,
      gap: content.gap ?? socialLinks.gap,
      // Strip the global title + WYSIWYG content fields — the block is the
      // icon row only; if the designer wants a heading they drop a Heading
      // block above. Mirrors the editor's SocialLinksBlock behaviour.
      title: undefined,
      contentBefore: undefined,
      contentAfter: undefined,
    };
  }, [
    socialLinks,
    content.alignment,
    content.iconStyle,
    content.iconColor,
    content.gap,
  ]);

  if (!socialLinks.links || socialLinks.links.length === 0) return null;
  return <SocialLinks settings={merged} />;
}
