import { useRef, useEffect } from "react";
import { BRAND_ICONS, MONO_ICONS, type SocialPlatform } from "./SocialIcons";

/**
 * Helper function to track events in both Google Analytics (gtag) and Google Tag Manager (dataLayer)
 */
function trackEvent(eventName: string, params: Record<string, any>) {
  // Track with Google Analytics (gtag)
  if (typeof (window as any).gtag === 'function') {
    (window as any).gtag('event', eventName, params);
  }

  // Track with Google Tag Manager (dataLayer)
  if (Array.isArray((window as any).dataLayer)) {
    (window as any).dataLayer.push({
      event: eventName,
      ...params,
    });
  }
}

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
  placement?: "sidebar-above" | "sidebar-below" | "above-content" | "below-content" | "above-left" | "below-left";
}

interface SocialLinksProps {
  settings: SocialLinksSettings;
  headingColor?: string;
  contentColor?: string;
}

export function SocialLinks({ settings, headingColor, contentColor }: SocialLinksProps) {
  const { links, iconStyle, iconColor, title, contentBefore, contentAfter, iconAlignment = "center" } = settings;

  const hasLinks = links && links.length > 0;
  const hasContent = title || contentBefore || contentAfter || hasLinks;

  const contentBeforeRef = useRef<HTMLDivElement>(null);
  const contentAfterRef = useRef<HTMLDivElement>(null);

  if (!hasContent) return null;

  const icons = iconStyle === "brand" ? BRAND_ICONS : MONO_ICONS;
  const monoStyle = iconStyle === "mono" && iconColor ? { color: iconColor } : undefined;

  const alignmentClass = {
    left: "justify-start",
    center: "justify-center",
    right: "justify-end",
  }[iconAlignment];

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
        <div className={`flex flex-wrap items-center ${alignmentClass}`}>
          {links.map((link) => {
            const platform = link.platform as SocialPlatform;
            const IconComponent = icons[platform];
            if (!IconComponent) return null;

            const isEmail = platform === "email";
            const href = isEmail ? `mailto:${link.url}` : link.url;

            const iconClass = platform === "instagram" ? "h-5 w-auto" : "h-6 w-auto";

            return (
              <a
                key={platform}
                href={href}
                target={isEmail ? undefined : "_blank"}
                rel={isEmail ? undefined : "noopener noreferrer"}
                className="min-w-11 min-h-11 flex items-center justify-center rounded-lg transition hover:opacity-70"
                title={getPlatformLabel(platform)}
                style={monoStyle}
                onClick={() => {
                  trackEvent('social_link_click', {
                    event_category: 'social',
                    event_label: getPlatformLabel(platform),
                    platform: platform,
                    url: link.url,
                  });
                }}
              >
                <IconComponent className={iconClass} />
              </a>
            );
          })}
        </div>
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
