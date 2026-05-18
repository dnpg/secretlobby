// =============================================================================
// Page-builder state types (compat shim)
// -----------------------------------------------------------------------------
// The canonical block / section schema now lives in
// `@secretlobby/lobby-template/blocks/types`, shared between the editor and
// the published lobby. This file is a thin re-export so the editor's 40+
// existing import sites (`from "~/components/page-builder/state/types"`) keep
// working without a sweeping import rewrite — new code should import from
// `@secretlobby/lobby-template` directly.
// =============================================================================

export type {
  Block,
  BlockContent,
  BlockType,
  BulletListBlockContent,
  CardBlockContent,
  CodeBlockBlockContent,
  CodeBlockContent,
  Column,
  DividerBlockContent,
  GalleryBlockContent,
  GalleryImage,
  GalleryStyle,
  HeadingBlockContent,
  ImageBlockContent,
  InlineDoc,
  LoginPageSettings,
  MobileLayout,
  OrderedListBlockContent,
  ParagraphBlockContent,
  PlayerBlockContent,
  PlaylistSummary,
  PlaylistTrackSummary,
  QuoteBlockContent,
  Section,
  SocialLinksBlockContent,
  StoredPageLayout,
  TableBlockContent,
  ThemeSettings,
  ViewportSize,
} from "@secretlobby/lobby-template";
export { PAGE_LAYOUT_VERSION } from "@secretlobby/lobby-template";
