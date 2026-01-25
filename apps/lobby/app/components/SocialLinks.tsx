import { BRAND_ICONS, MONO_ICONS, type SocialPlatform } from "./SocialIcons";

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
              >
                <IconComponent className={iconClass} />
              </a>
            );
          })}
        </div>
      )}

      {contentAfter && (
        <div
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
