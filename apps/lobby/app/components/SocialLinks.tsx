import { BRAND_ICONS, MONO_ICONS, type SocialPlatform } from "./SocialIcons";

export interface SocialLink {
  platform: string;
  url: string;
}

export interface SocialLinksSettings {
  links: SocialLink[];
  iconStyle: "brand" | "mono";
  iconColor?: string;
}

interface SocialLinksProps {
  settings: SocialLinksSettings;
}

export function SocialLinks({ settings }: SocialLinksProps) {
  const { links, iconStyle, iconColor } = settings;

  if (!links || links.length === 0) return null;

  const icons = iconStyle === "brand" ? BRAND_ICONS : MONO_ICONS;
  const monoStyle = iconStyle === "mono" && iconColor ? { color: iconColor } : undefined;

  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      {links.map((link) => {
        const platform = link.platform as SocialPlatform;
        const IconComponent = icons[platform];
        if (!IconComponent) return null;

        const isEmail = platform === "email";
        const href = isEmail ? `mailto:${link.url}` : link.url;

        return (
          <a
            key={platform}
            href={href}
            target={isEmail ? undefined : "_blank"}
            rel={isEmail ? undefined : "noopener noreferrer"}
            className="p-2 rounded-lg transition hover:opacity-70"
            title={getPlatformLabel(platform)}
            style={monoStyle}
          >
            <IconComponent className="w-5 h-5" />
          </a>
        );
      })}
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
