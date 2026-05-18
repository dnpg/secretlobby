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
// =============================================================================

import type { Block, Column } from "./types";
import { parseGapValue } from "./layoutHelpers";

export interface ColumnViewProps {
  column: Column;
  /** Per-block renderer. Called for every visible block in the column.
   *  `index` is the index inside `column.blocks` (NOT after the hidden filter)
   *  so callers can map back to the persisted block ordering. */
  renderBlock: (block: Block, index: number) => React.ReactNode;
}

export function ColumnView({ column, renderBlock }: ColumnViewProps) {
  // Hidden columns drop out of the lobby render entirely — matches the
  // editor's preview-mode behaviour. The editor's edit-mode keeps the column
  // in the canvas (dimmed) so the user can toggle it back on; that's handled
  // by the editor's ColumnComponent wrapper, not here.
  if (column.hidden === true) return null;

  const gap = parseGapValue(column.blockGap ?? "0");
  return (
    <div className="flex flex-col" style={{ gap }}>
      {column.blocks.map((block, index) =>
        block.hidden === true ? null : (
          <div key={block.id}>{renderBlock(block, index)}</div>
        )
      )}
    </div>
  );
}
