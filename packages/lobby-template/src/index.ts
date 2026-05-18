// =============================================================================
// @secretlobby/lobby-template
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
export { LogoutButton, type LogoutButtonProps } from "./LogoutButton";
export {
  LoginPanel,
  type LoginPanelProps,
  type LoginPageSettings,
} from "./LoginPanel";
export {
  LoginAutoplayToggle,
  type LoginAutoplayToggleProps,
} from "./LoginAutoplayToggle";

// Layout views — pure, view-only renderers for the page-builder's section /
// column primitives. The lobby uses these directly to render
// `pageLayout.sections`; the editor will compose them and add its selection /
// drag / resize chrome on top in a follow-up pass.
export { SectionView, type SectionViewProps } from "./blocks/SectionView";
export { ColumnView, type ColumnViewProps } from "./blocks/ColumnView";
export {
  VIEWPORT_WIDTHS,
  parseGapValue,
  parseWidthToPercent,
  normalizePercents,
} from "./blocks/layoutHelpers";

// Page-builder block schema — the shape both the editor saves and the lobby
// renders. New consumers should import from here; the editor's old
// `state/types` module re-exports these for back-compat.
export {
  PAGE_LAYOUT_VERSION,
  type Block,
  type BlockContent,
  type BlockType,
  type BulletListBlockContent,
  type CardBlockContent,
  type CodeBlockBlockContent,
  type CodeBlockContent,
  type Column,
  type DividerBlockContent,
  type GalleryBlockContent,
  type GalleryImage,
  type GalleryStyle,
  type HeadingBlockContent,
  type ImageBlockContent,
  type InlineDoc,
  type MobileLayout,
  type OrderedListBlockContent,
  type ParagraphBlockContent,
  type PlayerBlockContent,
  type PlaylistSummary,
  type PlaylistTrackSummary,
  type QuoteBlockContent,
  type Section,
  type SocialLinksBlockContent,
  type StoredPageLayout,
  type TableBlockContent,
  type ThemeSettings,
  type ViewportSize,
} from "./blocks/types";
