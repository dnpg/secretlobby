// Shared types for the page builder. Kept in a single file so the reducer,
// provider, and UI panels all import from one place.

import type { BorderRadius, ThemeSettings } from "~/lib/theme";

export type { ThemeSettings };

export type ViewportSize = "desktop" | "tablet" | "mobile";
export type MobileLayout = "stack" | "keep" | "slider";
export type BlockType = "image" | "player" | "card";

// Block content types ---------------------------------------------------------

export interface ImageBlockContent {
  mediaId?: string;
  mediaUrl?: string;
  alt?: string;
  aspectRatio?: string;
  // Optional per-image border-radius override. When omitted the image inherits
  // the theme's `cardBorderRadius`. Persisted on the block content so it
  // travels with the layout JSON like any other block field. Stored as a
  // `BorderRadius` (number for uniform, `{ tl, tr, br, bl }` for per-corner)
  // so the image picker can support Figma-style per-corner radii.
  imageBorderRadius?: BorderRadius;
  linkUrl?: string;
  // Responsive image overrides
  tabletMediaId?: string;
  tabletMediaUrl?: string;
  mobileMediaId?: string;
  mobileMediaUrl?: string;
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
}

// Lightweight summary of a playlist surfaced to the page builder UI. Built
// from the loader's `playlists` include + the matching tracks. Tracks here
// match the @secretlobby/player-view Track shape so PlayerBlock can hand
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
  title: string;
  content: string; // HTML content from WYSIWYG editor
  showBorder: boolean;
  backgroundColor?: string;
}

export type BlockContent =
  | ImageBlockContent
  | PlayerBlockContent
  | CardBlockContent;

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
  // Phase 5: per-block overrides for theme tokens. Optional + Partial so old
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

export const PAGE_LAYOUT_VERSION = 1;
