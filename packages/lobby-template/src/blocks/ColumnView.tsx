// =============================================================================
// ColumnView
// -----------------------------------------------------------------------------
// View-only column renderer. Stacks the column's blocks vertically with the
// optional `blockGap`, skips hidden columns, and delegates each block to the
// `renderBlock` render prop. Knows nothing about selection, drag/drop, or the
// editor — those live in the console's ColumnComponent wrapper.
//
// The render-prop boundary is intentional: blocks that need runtime data
// (PlayerBlock needs audio state; SocialLinksBlock needs the lobby's
// configured links) pass that data through the caller's renderBlock function,
// rather than threading every possible runtime prop through ColumnView.
//
// Two behaviours kept in lockstep with the editor's preview-mode rendering
// (BlockListSurface in apps/console) so the published lobby paints
// byte-for-byte the same layout designers see in the editor:
//   1. `blockGap` defaults to `"8"` (8px) — the editor uses the same default
//      so blocks have visible breathing room when the column hasn't set an
//      explicit gap. A previous version of this file defaulted to `"0"` and
//      blocks rendered flush, which looked wrong next to the preview.
//   2. Leading and trailing empty placeholder paragraphs are stripped. The
//      reducer auto-seeds these as a Notion-style typing affordance (a
//      always-present trailing paragraph so the user can click below the
//      last block and start typing). On the lobby they're not affordances —
//      they're just blank vertical space — so we trim them at the edges
//      the same way BlockListSurface does in preview mode. Middle empties
//      are kept intentional (the user may have left them as spacers).
// =============================================================================

import type { Block, Column, ParagraphBlockContent } from "./types";
import { parseGapValue } from "./layoutHelpers";

export interface ColumnViewProps {
  column: Column;
  /** Per-block renderer. Called for every visible block in the column.
   *  `index` is the index inside `column.blocks` (NOT after the hidden filter)
   *  so callers can map back to the persisted block ordering. */
  renderBlock: (block: Block, index: number) => React.ReactNode;
}

// Walk a Tiptap inline-doc to its concatenated text. Mirrors the helper
// BlockListSurface uses to decide whether a paragraph is "empty enough" to
// strip in preview. Anything with no text-bearing descendant is treated as
// empty even if it carries marks (italic-only of empty string, etc.).
function inlineTextContent(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as { text?: unknown; content?: unknown[] };
  if (typeof n.text === "string") return n.text;
  if (!Array.isArray(n.content)) return "";
  return n.content.map(inlineTextContent).join("");
}

function isEmptyParagraphBlock(b: Block): boolean {
  if (b.type !== "paragraph") return false;
  const inline = (b.content as ParagraphBlockContent).inline;
  return inlineTextContent(inline).length === 0;
}

export function ColumnView({ column, renderBlock }: ColumnViewProps) {
  // Hidden columns drop out of the lobby render entirely — matches the
  // editor's preview-mode behaviour. The editor's edit-mode keeps the column
  // in the canvas (dimmed) so the user can toggle it back on; that's handled
  // by the editor's ColumnComponent wrapper, not here.
  if (column.hidden === true) return null;

  const gap = parseGapValue(column.blockGap ?? "8");

  // Strip leading/trailing empty placeholder paragraphs to match the
  // editor's preview rendering — see file header for the why.
  const blocks = column.blocks;
  let start = 0;
  while (start < blocks.length && isEmptyParagraphBlock(blocks[start])) {
    start++;
  }
  let end = blocks.length;
  while (end > start && isEmptyParagraphBlock(blocks[end - 1])) {
    end--;
  }
  const visibleBlocks = blocks.slice(start, end);

  return (
    // Wrapper mirrors the editor's preview ColumnComponent (in apps/console)
    // so empty columns reserve the same vertical space and the inner flex
    // container sits at the same position. `min-h-[80px]` keeps a column
    // visually present even when it has no blocks (or only stripped
    // placeholders), matching how the editor preview paints it.
    <div className="rounded transition-all min-h-[80px] relative border border-transparent">
      <div className="relative w-full">
        <div className="flex flex-col" style={{ gap }}>
          {visibleBlocks.map((block, sliceIndex) => {
            if (block.hidden === true) return null;
            // `index` reported to renderBlock is the persisted column index
            // (NOT the sliced index) so callers can map back to the original
            // block ordering for selection / drag handlers.
            const index = start + sliceIndex;
            return <div key={block.id}>{renderBlock(block, index)}</div>;
          })}
        </div>
      </div>
    </div>
  );
}
