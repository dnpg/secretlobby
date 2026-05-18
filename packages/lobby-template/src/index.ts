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

// Per-block views — same rule as SectionView / ColumnView: view-only, no
// editor chrome, drive everything from the persisted block content + theme.
// The editor will wrap each view in an <EditableBlock> overlay (selection
// ring, drag handle, settings trigger) when its BlockRenderer migrates;
// nothing in these files cares whether they're inside the editor or the
// published lobby.
export { DividerView } from "./blocks/DividerView";
export { ImageBlockView, type ImageBlockViewProps } from "./blocks/ImageBlockView";
export {
  SocialLinksBlockView,
  type SocialLinksBlockViewProps,
} from "./blocks/SocialLinksBlockView";

// Text block views — render `InlineDoc` (Tiptap JSON) statically via the
// internal `InlineContent` walker. No Tiptap editor mounted; the rendered
// markup matches Tiptap's canonical output for the inline-only doc shape
// the editor produces.
export { HeadingView, type HeadingViewProps } from "./blocks/HeadingView";
export {
  ParagraphView,
  type ParagraphViewProps,
} from "./blocks/ParagraphView";
export { QuoteView, type QuoteViewProps } from "./blocks/QuoteView";
export {
  BulletListView,
  type BulletListViewProps,
} from "./blocks/BulletListView";
export {
  OrderedListView,
  type OrderedListViewProps,
} from "./blocks/OrderedListView";
export { CodeView, type CodeViewProps } from "./blocks/CodeView";
export {
  CodeBlockView,
  type CodeBlockViewProps,
} from "./blocks/CodeBlockView";
export { TableView, type TableViewProps } from "./blocks/TableView";
export { InlineContent, type InlineContentProps } from "./blocks/inlineDoc";

// BlockView — single-entry dispatcher. The lobby (and the editor, eventually)
// renders `<BlockView block={…} theme={…} socialLinks={…} />` and gets the
// right per-type view. Complex blocks not yet extracted (player / card /
// gallery) fall through to `renderFallback` so the host can provide its own
// renderer while the migration completes.
export { BlockView, type BlockViewProps } from "./blocks/BlockView";
export {
  PlayerBlockView,
  type PlayerBlockViewProps,
} from "./blocks/PlayerBlockView";
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
