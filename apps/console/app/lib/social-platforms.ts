export interface SocialLink {
  platform: string;
  url: string;
}

export interface SocialLinksSettings {
  links: SocialLink[];
  iconStyle: "brand" | "mono";
  iconColor?: string;
}

export const defaultSocialLinksSettings: SocialLinksSettings = {
  links: [],
  iconStyle: "mono",
};

export const SOCIAL_PLATFORMS = [
  { id: "spotify", label: "Spotify", placeholder: "https://open.spotify.com/artist/..." },
  { id: "applemusic", label: "Apple Music", placeholder: "https://music.apple.com/artist/..." },
  { id: "youtube", label: "YouTube", placeholder: "https://youtube.com/@..." },
  { id: "youtubemusic", label: "YouTube Music", placeholder: "https://music.youtube.com/channel/..." },
  { id: "soundcloud", label: "SoundCloud", placeholder: "https://soundcloud.com/..." },
  { id: "bandcamp", label: "Bandcamp", placeholder: "https://....bandcamp.com" },
  { id: "instagram", label: "Instagram", placeholder: "https://instagram.com/..." },
  { id: "tiktok", label: "TikTok", placeholder: "https://tiktok.com/@..." },
  { id: "facebook", label: "Facebook", placeholder: "https://facebook.com/..." },
  { id: "x", label: "X (Twitter)", placeholder: "https://x.com/..." },
  { id: "tidal", label: "Tidal", placeholder: "https://tidal.com/artist/..." },
  { id: "deezer", label: "Deezer", placeholder: "https://deezer.com/artist/..." },
  { id: "amazonmusic", label: "Amazon Music", placeholder: "https://music.amazon.com/artists/..." },
  { id: "email", label: "Email", placeholder: "email@example.com" },
] as const;
