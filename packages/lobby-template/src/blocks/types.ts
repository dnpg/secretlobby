// =============================================================================
// Canonical block / section types for the lobby template.
// -----------------------------------------------------------------------------
// Both the editor (apps/console) and the published lobby (apps/lobby) import
// these. Keeping them here means the persisted layout JSON has ONE source of
// truth for its shape — the editor saves it, the lobby renders it, neither
// app forks the schema.
//
// Imports must stay scoped to other workspace packages — no `~/lib/*` paths,
// no console-only helpers. Theme primitives come from `@secretlobby/theme`;
// rich-text inline doc shape comes from Tiptap (a runtime dep of any text
// renderer using `generateHTML`).
// =============================================================================

import type { JSONContent } from "@tiptap/core";
import type {
  BorderRadius,
  BorderStyle,
  BoxPadding,
  ThemeSettings,
} from "@secretlobby/theme";
import type { LoginPageSettings } from "../LoginPanel";

// Re-export so consumers that previously pulled these via the page-builder
// types module keep working without reaching for a second import.
export type { ThemeSettings, LoginPageSettings };

export type ViewportSize = "desktop" | "tablet" | "mobile";
export type MobileLayout = "stack" | "keep" | "slider";
export type BlockType =
  | "image"
  | "player"
  | "card"
  | "gallery"
  | "heading"
  | "paragraph"
  | "bulletList"
  | "orderedList"
  | "quote"
  | "code"
  | "codeBlock"
  | "table"
  | "divider"
  | "socialLinks";
export type GalleryStyle = "slider" | "grid" | "masonry";

// `JSONContent` from Tiptap is the inline-only doc used by every text-ish
// block to store rich-text content (marks, paragraphs, text nodes).
export type InlineDoc = JSONContent;

// Block content types ---------------------------------------------------------

export interface ImageBlockContent {
  mediaId?: string;
  mediaUrl?: string;
  alt?: string;
  aspectRatio?: string;
  // Intrinsic pixel dimensions of the media. ImageBlock writes these to the
  // <img> width/height HTML attributes on EVERY render — the browser uses
  // them to reserve layout space before the image loads, which kills
  // cumulative layout shift. Captured from MediaItem.{width,height} when the
  // user picks an image in ImageBlockSettings. Optional only because legacy
  // persisted blocks (pre-this-field) may not carry them; the renderer falls
  // back to a sensible aspect-ratio default so the attribute is always
  // present.
  mediaWidth?: number;
  mediaHeight?: number;
  // Optional per-image border-radius override. When omitted the image inherits
  // the theme's `cardBorderRadius`. Persisted on the block content so it
  // travels with the layout JSON like any other block field. Stored as a
  // `BorderRadius` (number for uniform, `{ tl, tr, br, bl }` for per-corner)
  // so the image picker can support Figma-style per-corner radii.
  imageBorderRadius?: BorderRadius;
  // Optional per-image border overrides (width/color/style). Each falls back
  // to the matching theme card-border field when undefined, mirroring the
  // `imageBorderRadius` ↔ `theme.cardBorderRadius` pattern. The border is
  // only painted when the effective width > 0 — same gating as cards.
  imageBorderWidth?: string;
  imageBorderColor?: string;
  imageBorderStyle?: BorderStyle;
  linkUrl?: string;
  // Responsive image overrides
  tabletMediaId?: string;
  tabletMediaUrl?: string;
  tabletMediaWidth?: number;
  tabletMediaHeight?: number;
  mobileMediaId?: string;
  mobileMediaUrl?: string;
  mobileMediaWidth?: number;
  mobileMediaHeight?: number;
}

export interface PlayerBlockContent {
  // Phase 6: which playlist this player block renders. Required after Phase 6;
  // older persisted layouts without this field are migrated to the lobby's
  // default playlist by `parseStoredPageLayout` in the route loader.
  playlistId: string;
  variant: "full" | "compact" | "minimal";
  showVisualizer: boolean;
  showPlaylist: boolean;
  autoplay: boolean;
  // Optional track id within `playlistId` to start playback on. Only honored
  // when `autoplay === true`; with no value the block falls back to the
  // first track in the playlist. Cleared when the block's playlist changes
  // because the previously-picked track wouldn't exist in the new playlist.
  autoplayTrackId?: string;
}

// Lightweight summary of a playlist surfaced to the page builder UI. Built
// from the loader's `playlists` include + the matching tracks. Tracks here
// match the @secretlobby/lobby-template Track shape so PlayerBlock can hand
// them straight to <PlayerView />.
export interface PlaylistTrackSummary {
  id: string;
  title: string;
  artist: string | null;
  duration: number | null;
  hlsReady: boolean;
  waveformPeaks: number[] | null;
}

export interface PlaylistSummary {
  id: string;
  name: string;
  isDefault: boolean;
  position: number;
  tracks: PlaylistTrackSummary[];
}

export interface CardBlockContent {
  /** Optional card title. The recommended pattern for a "title row" inside a
   *  card is now a Heading sub-block at index 0 — keep this field nullable so
   *  legacy persisted cards with a `title` don't blow up during
   *  deserialization. */
  title?: string;
  /** Per-card inner padding override. `number` applies the same value to all
   *  four sides; `{ top, right, bottom, left }` lets the user pick per-side
   *  values. Defaults to `16` (matches the legacy `p-4` Tailwind class the
   *  card used before this field was introduced). */
  padding?: BoxPadding;
  /** Nested blocks rendered inside the card. The slash menu inside a card
   *  excludes `player` / `card` / `gallery` — only text + image are allowed.
   *  Cross-container moves (card ↔ column, card ↔ card) aren't supported in
   *  this pass; the BlockListSurface inside CardBlock owns reordering. */
  blocks: Block[];
  /** @deprecated Pre-overhaul WYSIWYG HTML body. Migrated to nested
   *  Paragraph / Heading blocks by `parseStoredPageLayout` at load time. New
   *  layouts never write this field; kept on the type so older persisted
   *  payloads still deserialize without TypeScript widening to `any`. */
  content?: string;
  /** @deprecated Pre-overhaul "show border" toggle. The card now derives its
   *  border state from the theme's `cardBorderWidth` / per-side widths
   *  (positive width = visible). Kept for back-compat on stored JSON. */
  showBorder?: boolean;
  /** @deprecated Pre-overhaul inline background override. Per-block bg now
   *  flows through `block.themeOverrides.cardBg` (gradient-aware). Kept for
   *  back-compat on stored JSON. */
  backgroundColor?: string;
}

// Single image record inside a gallery. `id` is a stable client-generated
// uuid so dnd-kit + delete-by-id work without depending on array position.
export interface GalleryImage {
  id: string;
  mediaId?: string;
  mediaUrl?: string;
  alt?: string;
  linkUrl?: string;
}

export interface GalleryBlockContent {
  images: GalleryImage[];
  style: GalleryStyle;
  columns?: number; // 2..6; only meaningful for grid + masonry; ignored by slider
  gap?: number; // px; default 8
  imageBorderRadius?: BorderRadius;
  autoplay?: boolean; // slider only; default false
  autoplayIntervalMs?: number; // slider only; default 4000
  showArrows?: boolean; // slider only; default true
}

// Text-ish blocks store an inline-only Tiptap doc (marks, paragraphs, text).
// No block-level children — the page-builder column owns block structure.

export interface HeadingBlockContent {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  inline: InlineDoc;
}

export interface ParagraphBlockContent {
  inline: InlineDoc;
  align?: "left" | "center" | "right";
  // Optional per-paragraph font-size override. Stored as a CSS length
  // string ("18px", "1.25rem", etc.). When unset the paragraph inherits the
  // global `--text-base-size` emitted by the theme — see ThemeSettings.
  fontSize?: string;
}

export interface QuoteBlockContent {
  inline: InlineDoc;
  align?: "left" | "center" | "right";
}

// Inline-styled "code" chunk — renders the text inside a single `code` mark
// (visually a single styled line). Distinct from `CodeBlockBlockContent`
// which is a full `<pre><code>` multi-line block with a language.
export interface CodeBlockContent {
  inline: InlineDoc;
}

export interface CodeBlockBlockContent {
  language?: string;
  text: string;
}

export interface BulletListBlockContent {
  items: InlineDoc[];
}

export interface OrderedListBlockContent {
  items: InlineDoc[];
}

export interface TableBlockContent {
  rows: { cells: InlineDoc[] }[];
  headerRow: boolean;
}

// Empty marker — the divider has no per-instance content (it inherits the
// border color from the theme). Kept as an interface so the discriminated
// union stays consistent.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface DividerBlockContent {}

// Social Links block — renders the lobby's globally-configured social media
// links (Instagram, Facebook, etc.) using the shared SocialLinks renderer
// from `@secretlobby/lobby-template`. The block carries optional overrides so
// users can place multiple Social Links blocks with different visual
// treatments (e.g. brand-color icons on a hero, mono icons in a footer)
// without changing the lobby-level settings every time. All fields default
// to whatever's set on `state.socialLinks`.
export interface SocialLinksBlockContent {
  alignment?: "left" | "center" | "right";
  iconStyle?: "brand" | "mono";
  /** Mono-mode tint. Ignored when iconStyle is "brand". */
  iconColor?: string;
  /** Gap between icon buttons as a CSS length string (e.g. `"8px"`). When
   *  undefined, the block inherits the lobby's `socialLinks.gap` setting
   *  (or no gap when that's also unset). */
  gap?: string;
}

export type BlockContent =
  | ImageBlockContent
  | PlayerBlockContent
  | CardBlockContent
  | GalleryBlockContent
  | HeadingBlockContent
  | ParagraphBlockContent
  | QuoteBlockContent
  | CodeBlockContent
  | CodeBlockBlockContent
  | BulletListBlockContent
  | OrderedListBlockContent
  | TableBlockContent
  | DividerBlockContent
  | SocialLinksBlockContent;

export interface Block {
  id: string;
  type: BlockType;
  // user-editable layer name; defaults to "Image N" / "Player N" / "Card N" in UI
  name?: string;
  content: BlockContent;
  mobileHidden?: boolean;
  // When true, the block is dimmed in edit mode and skipped entirely in
  // preview/published mode. Persisted in the layout JSON so old layouts
  // without this field deserialize fine (treated as visible).
  hidden?: boolean;
  // Universal spacing override — CSS length string (e.g. `"16px"`, `"1rem"`)
  // applied to the block's wrapper as `margin-bottom`. Defaults to `0` (no
  // gap) so persisted layouts without the field render identically. Stored
  // at Block level (not BlockContent) because every block type supports it
  // and the value isn't relevant to the inner content's shape.
  marginBottom?: string;
  // Per-block overrides for theme tokens. Optional + Partial so old
  // persisted layouts deserialize fine and clearing the object reverts to the
  // global theme.
  themeOverrides?: Partial<ThemeSettings>;
}

export interface Column {
  id: string;
  // user-editable layer name; defaults to "Column N" in UI
  name?: string;
  width: string; // Desktop width e.g., "50%", "33.33%"
  tabletWidth?: string; // Tablet override (optional)
  blocks: Block[]; // Blocks inside this column
  blockGap?: string; // Gap between blocks (numbers default to px)
  // When true, the column is dimmed in edit mode and skipped entirely in
  // preview/published mode.
  hidden?: boolean;
}

export interface Section {
  id: string;
  name?: string; // user-editable layer name; defaults to "Section N" in UI
  columns: Column[];
  rowGap: string; // e.g., "16", "1rem", "10%"
  columnGap: string;
  mobileLayout: MobileLayout;
  mobileColumns?: 1 | 2; // Only used when mobileLayout is "keep"
  // When true, the section is dimmed in edit mode and skipped entirely in
  // preview/published mode.
  hidden?: boolean;
}

// Persistence wrapper around the sections list. We version the payload so we
// can migrate stored layouts later without breaking older lobbies.
export interface StoredPageLayout {
  sections: Section[];
  version: number;
}

// Bumped to 2 when the page-builder became the source of truth for the lobby
// content (banner / about / technical info / social links used to render from
// fixed lobby fields + legacy settings keys; now they live inside the layout's
// section/column/block tree). Layouts persisted before this bump have either
// no `version` field or `version: 1` — the editor loader migrates them on
// read; see `migrateLobbyToV2` in apps/console.
export const PAGE_LAYOUT_VERSION = 2;
