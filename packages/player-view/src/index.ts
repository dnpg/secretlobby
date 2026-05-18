// =============================================================================
// @secretlobby/player-view
// -----------------------------------------------------------------------------
// PlayerView and supporting components/hooks. Hoisted out of apps/lobby so
// the page-builder canvas can render the same UI inside the editor.
// =============================================================================

export {
  PlayerView,
  playerRegionStyle,
  type Track,
  type ImageUrls,
  type AudioControls,
  type CardStyles,
  type PlayerRegionStyle,
  type TechnicalInfo,
} from "./PlayerView";
export { AudioVisualizer } from "./AudioVisualizer";
export { WaveformProgress } from "./WaveformProgress";
export { PreviewBar } from "./PreviewBar";
export { SocialLinks, type SocialLink, type SocialLinksSettings } from "./SocialLinks";
export {
  BRAND_ICONS,
  MONO_ICONS,
  type SocialPlatform,
  // Brand
  SpotifyBrand,
  AppleMusicBrand,
  YouTubeBrand,
  YouTubeMusicBrand,
  SoundCloudBrand,
  BandcampBrand,
  InstagramBrand,
  TikTokBrand,
  FacebookBrand,
  XBrand,
  TidalBrand,
  DeezerBrand,
  AmazonMusicBrand,
  EmailBrand,
  // Mono
  SpotifyMono,
  AppleMusicMono,
  YouTubeMono,
  YouTubeMusicMono,
  SoundCloudMono,
  BandcampMono,
  InstagramMono,
  TikTokMono,
  FacebookMono,
  XMono,
  TidalMono,
  DeezerMono,
  AmazonMusicMono,
  EmailMono,
} from "./SocialIcons";
export { usePcmAnalyser, type PcmAnalyser } from "./usePcmAnalyser";
export { useHlsAudio } from "./useHlsAudio";
export { useTrackPrefetcher } from "./useTrackPrefetcher";
