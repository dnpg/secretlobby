import { useRef, useEffect } from "react";
import { BRAND_ICONS, MONO_ICONS, type SocialPlatform } from "./SocialIcons";
import { trackEvent } from "./analytics";

export interface SocialLink {
  platform: string;
  url: string;
}

export interface SocialLinksSettings {
  links: SocialLink[];
  iconStyle: "brand" | "mono";
  iconColor?: string;
  title?: string;
  contentBefore?: string;
  contentAfter?: string;
  iconAlignment?: "left" | "center" | "right";
  /**
   * Gap between icon buttons as a CSS length string (e.g. `"8px"`,
   * `"0.5rem"`). Stored as a string — same shape as `cardBorderWidth` and
   * other length theme fields — so the page-builder's `CssLengthInput` can
   * round-trip it without coercing px-only. Applied as `gap` on the flex
   * `<nav>`, so the spacing stays symmetric when icons wrap onto multiple
   * lines. Undefined / empty string falls back to the legacy tight pack.
   */
  gap?: string;
  placement?: "sidebar-above" | "sidebar-below" | "above-content" | "below-content" | "above-left" | "below-left";
}

interface SocialLinksProps {
  settings: SocialLinksSettings;
  headingColor?: string;
  contentColor?: string;
}

export function SocialLinks({ settings, headingColor, contentColor }: SocialLinksProps) {
  const { links, iconStyle, iconColor, title, contentBefore, contentAfter, iconAlignment = "center", gap } = settings;

  const hasLinks = links && links.length > 0;
  const hasContent = title || contentBefore || contentAfter || hasLinks;

  const contentBeforeRef = useRef<HTMLDivElement>(null);
  const contentAfterRef = useRef<HTMLDivElement>(null);

  // Track clicks on custom links in WYSIWYG content
  useEffect(() => {
    const handleLinkClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest('a');
      if (link && link.href) {
        trackEvent('wysiwyg_link_click', {
          event_category: 'content',
          event_label: link.textContent || 'Unknown',
          url: link.href,
          section: 'social_links',
        });
      }
    };

    const beforeEl = contentBeforeRef.current;
    const afterEl = contentAfterRef.current;

    if (beforeEl) {
      beforeEl.addEventListener('click', handleLinkClick);
    }
    if (afterEl) {
      afterEl.addEventListener('click', handleLinkClick);
    }

    return () => {
      if (beforeEl) {
        beforeEl.removeEventListener('click', handleLinkClick);
      }
      if (afterEl) {
        afterEl.removeEventListener('click', handleLinkClick);
      }
    };
  }, [contentBefore, contentAfter]);

  if (!hasContent) return null;

  const icons = iconStyle === "brand" ? BRAND_ICONS : MONO_ICONS;
  const monoStyle = iconStyle === "mono" && iconColor ? { color: iconColor } : undefined;

  const alignmentClass = {
    left: "justify-start",
    center: "justify-center",
    right: "justify-end",
  }[iconAlignment];

  return (
    <div className="space-y-3">
      {title && (
        <h3 className="text-lg font-semibold" style={{ color: headingColor }}>
          {title}
        </h3>
      )}

      {contentBefore && (
        <div
          ref={contentBeforeRef}
          className="text-sm prose-content"
          style={{ color: contentColor }}
          dangerouslySetInnerHTML={{ __html: contentBefore }}
        />
      )}

      {hasLinks && (
        <nav
          aria-label="Social media links"
          className={`flex flex-wrap items-center ${alignmentClass}`}
          // Apply the gap only when the consumer provides a non-empty CSS
          // length string. Leaving `style` undefined for legacy settings
          // keeps their current tight-packed rendering exactly the same.
          // NOTE: the per-icon `<a>` keeps `min-w-11 min-h-11` (44px) below
          // — gap controls spacing between buttons, never their size.
          style={
            typeof gap === "string" && gap.trim() !== ""
              ? { gap }
              : undefined
          }
        >
          {links.map((link) => {
            const platform = link.platform as SocialPlatform;
            const IconComponent = icons[platform];
            if (!IconComponent) return null;

            const isEmail = platform === "email";
            const href = isEmail ? `mailto:${link.url}` : link.url;
            const label = getPlatformLabel(platform);
            const accessibleLabel = isEmail
              ? `Send email to ${link.url}`
              : `Visit our ${label} page (opens in new tab)`;

            const iconClass = platform === "instagram" ? "h-5 w-auto" : "h-6 w-auto";

            return (
              <a
                key={platform}
                href={href}
                target={isEmail ? undefined : "_blank"}
                rel={isEmail ? undefined : "noopener noreferrer"}
                // 44px minimum tap target on BOTH axes (`min-w-11` /
                // `min-h-11` = 2.75rem at the default 16px root). Required
                // — do not drop below 44px; consumers (including the
                // page-builder SocialLinks block) rely on this floor.
                className="min-w-11 min-h-11 flex items-center justify-center rounded-lg transition hover:opacity-70 focus-visible:ring-2 focus-visible:ring-offset-2 cursor-pointer"
                aria-label={accessibleLabel}
                style={monoStyle}
                onClick={() => {
                  trackEvent('social_link_click', {
                    event_category: 'social',
                    event_label: label,
                    platform: platform,
                    url: link.url,
                  });
                }}
              >
                <IconComponent className={iconClass} aria-hidden="true" />
              </a>
            );
          })}
        </nav>
      )}

      {contentAfter && (
        <div
          ref={contentAfterRef}
          className="text-sm prose-content"
          style={{ color: contentColor }}
          dangerouslySetInnerHTML={{ __html: contentAfter }}
        />
      )}
    </div>
  );
}

function getPlatformLabel(platform: SocialPlatform): string {
  const labels: Record<SocialPlatform, string> = {
    spotify: "Spotify",
    applemusic: "Apple Music",
    youtube: "YouTube",
    youtubemusic: "YouTube Music",
    soundcloud: "SoundCloud",
    bandcamp: "Bandcamp",
    instagram: "Instagram",
    tiktok: "TikTok",
    facebook: "Facebook",
    x: "X (Twitter)",
    tidal: "Tidal",
    deezer: "Deezer",
    amazonmusic: "Amazon Music",
    email: "Email",
  };
  return labels[platform] || platform;
}
