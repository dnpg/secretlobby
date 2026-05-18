import type {
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
  HeadingBlockContent,
  ImageBlockContent,
  InlineDoc,
  OrderedListBlockContent,
  ParagraphBlockContent,
  PlayerBlockContent,
  QuoteBlockContent,
  Section,
  SocialLinksBlockContent,
  StoredPageLayout,
  TableBlockContent,
  ViewportSize,
} from "./types";
import { PAGE_LAYOUT_VERSION } from "./types";

// Empty Tiptap inline doc: a single paragraph with no content. Every text-ish
// block seeds itself with this so the editor has a valid cursor target on
// first render. Returning a fresh object each time avoids accidentally
// sharing the same reference across multiple blocks (which would mutate
// each other on edit).
export function emptyInlineDoc(): InlineDoc {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

// Build a fresh, empty paragraph block. Columns and cards are never empty —
// when the user deletes the last block the reducer immediately pushes one of
// these back so the surface always has a "Press '/' for commands" hint.
export function createEmptyParagraphBlock(): Block {
  return createBlock("paragraph");
}

// Simple ID generator that works in all browsers.
export function generateId(prefix = "section"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// Generate equal width percentage value.
export function getEqualColumnWidth(columnCount: number): string {
  if (columnCount === 1) return "100%";
  const percent = 100 / columnCount;
  return `${percent.toFixed(2)}%`;
}

// Helper to create columns with equal widths.
// Each new column is seeded with a single empty paragraph so the surface
// always renders a "Press '/' for commands" placeholder line; the user can
// type immediately without first having to click an "Add block" affordance.
export function createColumns(count: number, _gap = "16px"): Column[] {
  const width = getEqualColumnWidth(count);
  return Array.from({ length: count }, () => ({
    id: generateId("col"),
    width,
    blocks: [createEmptyParagraphBlock()],
  }));
}

// Helper to create a new section.
export function createSection(columnCount = 1): Section {
  const gap = "16";
  return {
    id: generateId("section"),
    columns: createColumns(columnCount, gap + "px"),
    rowGap: gap,
    columnGap: gap,
    mobileLayout: "stack",
  };
}

// Default content for each block type.
export function getDefaultBlockContent(type: BlockType): BlockContent {
  switch (type) {
    case "image":
      // No defaults needed: the image renders at natural aspect ratio and the
      // border-radius inherits from the theme until the user overrides it.
      return {} as ImageBlockContent;
    case "player":
      // playlistId is intentionally empty by default — the canvas resolver
      // falls back to the lobby's default playlist when a block has no
      // playlistId set. This keeps "drop a Player block" → "it just works"
      // without requiring callers to pre-resolve a playlist id.
      return {
        playlistId: "",
        variant: "full",
        showVisualizer: true,
        showPlaylist: true,
        autoplay: false,
      } as PlayerBlockContent;
    case "card":
      // Post-overhaul: a Card is a nested container of blocks. No more
      // WYSIWYG `content` HTML; users add Heading / Paragraph / Image / etc.
      // sub-blocks via the in-card slash menu. Seeded with a single empty
      // paragraph so the card surface always shows a "Press '/' for
      // commands" line and the user can start typing right away.
      return {
        blocks: [createEmptyParagraphBlock()],
      } satisfies CardBlockContent;
    case "gallery":
      return {
        images: [],
        style: "grid",
        columns: 3,
        gap: 8,
        autoplay: false,
        autoplayIntervalMs: 4000,
        showArrows: true,
      } satisfies GalleryBlockContent;
    case "heading":
      return {
        level: 1,
        inline: emptyInlineDoc(),
      } satisfies HeadingBlockContent;
    case "paragraph":
      return { inline: emptyInlineDoc() } satisfies ParagraphBlockContent;
    case "quote":
      return { inline: emptyInlineDoc() } satisfies QuoteBlockContent;
    case "code":
      return { inline: emptyInlineDoc() } satisfies CodeBlockContent;
    case "codeBlock":
      return { text: "", language: "" } satisfies CodeBlockBlockContent;
    case "bulletList":
      return {
        items: [emptyInlineDoc()],
      } satisfies BulletListBlockContent;
    case "orderedList":
      return {
        items: [emptyInlineDoc()],
      } satisfies OrderedListBlockContent;
    case "table":
      return {
        headerRow: true,
        rows: [
          { cells: [emptyInlineDoc(), emptyInlineDoc()] },
          { cells: [emptyInlineDoc(), emptyInlineDoc()] },
        ],
      } satisfies TableBlockContent;
    case "divider":
      return {} satisfies DividerBlockContent;
    case "socialLinks":
      // No defaults — the renderer reads `state.socialLinks` from the
      // page-builder context. Optional per-block overrides (alignment /
      // iconStyle / iconColor) are written into this content by the block
      // settings panel when the user wants a different treatment than the
      // lobby-level defaults.
      return {} satisfies SocialLinksBlockContent;
  }
}

// Create a new block.
export function createBlock(type: BlockType): Block {
  return {
    id: generateId("block"),
    type,
    content: getDefaultBlockContent(type),
  };
}

// Build the default page layout used to seed the editor the first time a
// lobby is opened (i.e. when there's no saved `pageLayout` yet). Structure:
//
//   Section "Header"  — single "Container" column with an Image block
//   Section "Content" — two columns ("Left" + "Right"); Left has a Player
//                       block wired to the lobby's default playlist; Right has
//                       two preset Cards ("About us" + "More about us")
//   Section "Footer"  — single "Container" column with a default Card block
//
// All ids are freshly generated via the existing factories so the seeded
// layout looks identical to one the user could have built by hand. We avoid
// touching `getDefaultBlockContent`; preset values are applied after
// `createBlock` so other call sites still get empty defaults.
export function createDefaultPageLayout(
  defaultPlaylistId: string
): StoredPageLayout {
  // Section 1 — Header.
  // Every seeded column ends with an empty paragraph so the Notion-style
  // "Press '/' for commands" hint always renders below the last real block.
  const header = createSection(1);
  header.name = "Header";
  header.columns[0].name = "Container";
  header.columns[0].blocks = [
    createBlock("image"),
    createEmptyParagraphBlock(),
  ];

  // Section 2 — Content
  const content = createSection(2);
  content.name = "Content";
  content.columns[0].name = "Left";
  const playerBlock = createBlock("player");
  // Wire the default playlist so the Player renders something on first paint.
  (playerBlock.content as PlayerBlockContent).playlistId = defaultPlaylistId;
  content.columns[0].blocks = [playerBlock, createEmptyParagraphBlock()];

  content.columns[1].name = "Right";
  // Seed cards now hold nested blocks instead of a single HTML body. Each
  // gets a Heading sub-block (as the title row) and a Paragraph placeholder
  // so first-paint matches the old layout's visual weight.
  const aboutCard = createBlock("card");
  (aboutCard.content as CardBlockContent).title = "About us";
  (aboutCard.content as CardBlockContent).blocks = [
    createBlock("heading"),
    createBlock("paragraph"),
  ];
  const moreCard = createBlock("card");
  (moreCard.content as CardBlockContent).title = "More about us";
  (moreCard.content as CardBlockContent).blocks = [
    createBlock("heading"),
    createBlock("paragraph"),
  ];
  content.columns[1].blocks = [
    aboutCard,
    moreCard,
    createEmptyParagraphBlock(),
  ];

  // Section 3 — Footer
  const footer = createSection(1);
  footer.name = "Footer";
  footer.columns[0].name = "Container";
  footer.columns[0].blocks = [createBlock("card"), createEmptyParagraphBlock()];

  return {
    sections: [header, content, footer],
    version: PAGE_LAYOUT_VERSION,
  };
}

export const VIEWPORT_WIDTHS: Record<ViewportSize, number> = {
  desktop: 1440,
  tablet: 768,
  mobile: 375,
};

// Parse gap value - if just a number, assume px.
export function parseGapValue(value: string): string {
  if (!value || value === "0") return "0";
  const trimmed = value.trim();
  // If it's just a number, add px
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return `${trimmed}px`;
  }
  return trimmed;
}

// Helper to parse width value to percentage (for resize calculations).
export function parseWidthToPercent(width: string, totalColumns: number): number {
  const trimmed = width.trim();
  // If it's a calc() expression, extract the percentage part
  if (trimmed.startsWith("calc(")) {
    const match = trimmed.match(/calc\((\d+(?:\.\d+)?)%/);
    if (match) {
      return parseFloat(match[1]) || (100 / totalColumns);
    }
  }
  // If it's a percentage, extract the number
  if (trimmed.endsWith("%")) {
    return parseFloat(trimmed) || (100 / totalColumns);
  }
  // If it's fr units, we'll treat it as proportional
  if (trimmed.endsWith("fr")) {
    // For fr units, we need context of all columns, default to equal
    return 100 / totalColumns;
  }
  // Default to equal distribution
  return 100 / totalColumns;
}

// Normalize column percentages to sum to 100%.
export function normalizePercents(percents: number[]): number[] {
  const total = percents.reduce((sum, p) => sum + p, 0);
  if (total === 0) return percents.map(() => 100 / percents.length);
  return percents.map((p) => (p / total) * 100);
}

// Layer color families. Sections + columns share the "layout" family
// (purple/indigo); blocks use the brand red as the "content" family.
export const LAYER_COLORS = {
  section: {
    text: "text-violet-300",
    bg: "bg-violet-500/15",
    bgSelected: "bg-violet-500/25",
    border: "border-violet-500/40",
    borderSelected: "border-violet-400",
    ring: "ring-violet-400",
    accent: "bg-violet-500",
  },
  column: {
    text: "text-indigo-300",
    bg: "bg-indigo-500/10",
    bgSelected: "bg-indigo-500/20",
    border: "border-indigo-500/30",
    borderSelected: "border-indigo-400",
    ring: "ring-indigo-400",
    accent: "bg-indigo-500",
  },
  block: {
    text: "text-[var(--color-brand-red)]",
    bg: "bg-[var(--color-brand-red-muted)]",
    bgSelected: "bg-[var(--color-brand-red-muted)]",
    border: "border-[var(--color-brand-red)]/30",
    borderSelected: "border-[var(--color-brand-red)]",
    ring: "ring-[var(--color-brand-red)]",
    accent: "bg-[var(--color-brand-red)]",
  },
} as const;
