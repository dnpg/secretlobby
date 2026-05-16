import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@secretlobby/ui";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Block, BlockContent, BlockType } from "../state/types";
import { parseGapValue } from "../state/helpers";
import { SortableBlock } from "./SortableBlock";
import {
  BlockMenu,
  type BlockMenuAnchor,
  type BlockMenuItem,
} from "~/components/block-menu";
import { PlusIcon } from "../icons";

// =============================================================================
// BlockListSurface
// -----------------------------------------------------------------------------
// The shared "column-like" content surface. Both ColumnComponent (top-level
// blocks inside a column) and CardBlock (nested blocks inside a card) render
// the exact same affordances.
//
// Notion-style overhaul:
//
//   - The surface NEVER renders without at least one block. Columns and
//     cards are seeded with an empty paragraph; deletes auto-restore one
//     (see reducer). The Tiptap placeholder on that paragraph reads
//     "Press '/' for commands".
//   - Slash typed at the start of an empty inline editor opens the block
//     menu portal'd to document.body; picking a type replaces the current
//     paragraph IN PLACE (`replaceBlock` / `replaceBlockInCard`).
//   - Enter (no shift) in a text block appends a fresh empty paragraph
//     immediately after it and focuses the new editor via the
//     `pendingFocusBlockId` mechanism below.
//   - The previous hairline `+` top-insert line and the hover `+` gaps are
//     gone. The only `+` left is the per-block toolbar entry in
//     `SortableBlock`, which routes through `onOpenInsertMenu` and dispatches
//     `addBlock(atIndex)`.
//
// `menuFilter` lets the caller restrict the slash menu: the column variant
// passes no filter (allow all block types), the card variant filters out
// `player` / `card` / `gallery`.
// =============================================================================

export interface BlockListSurfaceProps {
  blocks: Block[];
  // True in edit mode — drives toolbars and slash interception.
  isEditing: boolean;
  // Column index inside the parent section, used by the per-block toolbar to
  // decide whether the "move to previous/next column" arrows render. For card
  // surfaces this is 0/1 since cards aren't column-aware.
  columnIndex?: number;
  totalColumns?: number;
  selectedBlockId: string | null;
  // Visual gap between adjacent blocks. Defaults to "8" (parsed to "8px").
  blockGap?: string;
  // Insert a block of `type` at the given index (defaults to end).
  onAddBlock: (type: BlockType, atIndex?: number) => void;
  onDeleteBlock: (blockId: string) => void;
  onUpdateBlock: (blockId: string, content: Partial<BlockContent>) => void;
  onReorderBlocks: (blockIds: string[]) => void;
  onMoveBlockUp: (blockId: string) => void;
  onMoveBlockDown: (blockId: string) => void;
  // Cross-column move. The card surface ignores this (no neighbouring
  // columns). Pass a no-op or undefined when not applicable.
  onMoveBlockToColumn?: (blockId: string, direction: "left" | "right") => void;
  onSelectBlock: (blockId: string | null) => void;
  // Replace a block IN PLACE with a new type (preserves block.id). Triggered
  // when the user picks a type from the slash menu opened from inside an
  // inline editor. Columns dispatch `replaceBlock`; cards dispatch
  // `replaceBlockInCard`.
  onReplaceBlock: (blockId: string, newType: BlockType) => void;
  // Restricts which block-menu entries are shown. Omit for "allow all".
  menuFilter?: (item: BlockMenuItem) => boolean;
}

// Internal handle describing what the open BlockMenu should do on pick.
// Either insert at a column index (toolbar `+` button) or replace a
// specific block id in place (slash-from-inside-editor).
type MenuMode =
  | { kind: "insert"; insertIndex: number }
  | { kind: "replace"; blockId: string };

// Block types backed by the InlineEditor — these can consume a pending-
// focus token. Other types (image, divider, table, code-block, lists, etc.)
// don't carry an inline-editable surface, so we skip queueing focus for them.
const TEXT_BLOCK_TYPES: ReadonlySet<BlockType> = new Set<BlockType>([
  "heading",
  "paragraph",
  "quote",
  "code",
]);

export function BlockListSurface({
  blocks,
  isEditing,
  columnIndex = 0,
  totalColumns = 1,
  selectedBlockId,
  blockGap,
  onAddBlock,
  onDeleteBlock,
  onUpdateBlock,
  onReorderBlocks: _onReorderBlocks,
  onMoveBlockUp,
  onMoveBlockDown,
  onMoveBlockToColumn,
  onSelectBlock,
  onReplaceBlock,
  menuFilter,
}: BlockListSurfaceProps) {
  const [menu, setMenu] = useState<{
    anchor: BlockMenuAnchor;
    mode: MenuMode;
  } | null>(null);
  const [menuQuery, setMenuQuery] = useState("");
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const emptyPlaceholderRef = useRef<HTMLDivElement | null>(null);

  // Pending-focus token: when the user presses Enter inside an inline editor
  // we dispatch `addBlock("paragraph", idx+1)` but the new block's id is
  // generated by the caller (Canvas) before dispatch and we don't have it
  // synchronously here. To resolve the new id we snapshot the existing ids
  // BEFORE the dispatch into a ref; after re-render we walk the `blocks`
  // array for the first id that's present now but wasn't before. That id
  // wins and is promoted to `pendingFocusBlockId` (state — so the matching
  // SortableBlock re-renders with the `pendingFocus` flag). The
  // replace-from-slash path is simpler: `replaceBlock` preserves the id, so
  // `handlePick` sets the token directly without going through this ref.
  const pendingFocusReqRef = useRef<{
    sourceBlockId: string;
    knownIds: Set<string>;
  } | null>(null);
  const [pendingFocusBlockId, setPendingFocusBlockId] = useState<string | null>(
    null
  );

  // Resolve the pending-focus request against the current block list. Runs
  // after every render; cheap because `blocks` is short.
  useEffect(() => {
    const req = pendingFocusReqRef.current;
    if (!req) return;
    const fresh = blocks.find(
      (b) => b.type === "paragraph" && !req.knownIds.has(b.id)
    );
    if (fresh) {
      pendingFocusReqRef.current = null;
      setPendingFocusBlockId(fresh.id);
    }
  }, [blocks]);

  const blockIds = blocks.map((b) => b.id);
  const gap = parseGapValue(blockGap || "8");

  const openMenuAt = useCallback(
    (el: HTMLElement | null, mode: MenuMode, query = "") => {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setMenu({
        anchor: { top: rect.top, left: rect.left, bottom: rect.bottom },
        mode,
      });
      setMenuQuery(query);
    },
    []
  );

  const closeMenu = useCallback(() => {
    setMenu(null);
    setMenuQuery("");
  }, []);

  const handlePick = useCallback(
    (type: BlockType) => {
      if (!menu) return;
      if (menu.mode.kind === "insert") {
        onAddBlock(type, menu.mode.insertIndex);
      } else {
        // Replace path: the block id is preserved, so we can directly queue
        // pending-focus against the same id. The user expects the caret to
        // be inside the freshly swapped block so they can start typing
        // without an extra click. Only queue for text-ish types — non-text
        // blocks (image / divider / table / etc.) don't carry an inline
        // editor to consume the token.
        const replacedId = menu.mode.blockId;
        onReplaceBlock(replacedId, type);
        if (TEXT_BLOCK_TYPES.has(type)) {
          setPendingFocusBlockId(replacedId);
        }
      }
      closeMenu();
    },
    [menu, onAddBlock, onReplaceBlock, closeMenu]
  );

  const handleEmptyKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isEditing) return;
    if (e.key === "/" || e.key === "+" || e.key === "Enter") {
      e.preventDefault();
      openMenuAt(
        emptyPlaceholderRef.current,
        { kind: "insert", insertIndex: 0 },
        ""
      );
    }
  };

  // Fallback move-to-column handler: when the surface caller doesn't supply
  // one (card variant), the per-block toolbar still computes can-move flags
  // from columnIndex/totalColumns, which we pin to 0/1 so the arrows hide.
  const moveToColumn = useCallback(
    (blockId: string, direction: "left" | "right") => {
      if (onMoveBlockToColumn) onMoveBlockToColumn(blockId, direction);
    },
    [onMoveBlockToColumn]
  );

  // Slash-from-inside-editor handler. The InlineEditor passes its outer DOM
  // node so the portal'd menu can anchor against it.
  const handleSlash = useCallback(
    (blockId: string, anchorEl: HTMLElement) => {
      openMenuAt(anchorEl, { kind: "replace", blockId });
    },
    [openMenuAt]
  );

  // Enter-from-inside-editor handler. Append a fresh empty paragraph right
  // after the source block and queue it for auto-focus on next render.
  const handleEnter = useCallback(
    (blockId: string) => {
      const idx = blocks.findIndex((b) => b.id === blockId);
      if (idx === -1) return;
      pendingFocusReqRef.current = {
        sourceBlockId: blockId,
        knownIds: new Set(blocks.map((b) => b.id)),
      };
      onAddBlock("paragraph", idx + 1);
    },
    [blocks, onAddBlock]
  );

  // Called by a SortableBlock / InlineEditor once it consumes the pending
  // focus token so subsequent renders don't keep re-focusing it.
  const handleFocusConsumed = useCallback((blockId: string) => {
    setPendingFocusBlockId((current) => (current === blockId ? null : current));
  }, []);

  return (
    <div ref={wrapperRef} className="relative w-full">
      {blocks.length === 0 && isEditing ? (
        // Defensive fallback — columns and cards are seeded with an empty
        // paragraph and the reducer auto-restores one after the last block
        // is deleted, so this branch shouldn't fire in normal operation.
        // Kept as a belt-and-braces affordance: if the persisted layout
        // somehow ships an empty column, the user can still recover.
        <div
          ref={emptyPlaceholderRef}
          tabIndex={0}
          role="button"
          aria-label="Add a block"
          onKeyDown={handleEmptyKeyDown}
          onClick={(e) => {
            e.stopPropagation();
            openMenuAt(
              emptyPlaceholderRef.current,
              { kind: "insert", insertIndex: 0 },
              ""
            );
          }}
          className={cn(
            "w-full flex items-center justify-center gap-2 px-4 py-8 rounded-lg text-sm text-theme-muted",
            "border border-dashed border-theme hover:border-[var(--color-brand-red)]/60 hover:text-[var(--color-brand-red)]",
            "cursor-pointer outline-none focus:border-[var(--color-brand-red)] focus:text-[var(--color-brand-red)]"
          )}
        >
          <PlusIcon className="w-4 h-4" />
          <span>
            Type{" "}
            <kbd className="px-1 py-0.5 rounded bg-theme-tertiary border border-theme text-theme-primary text-[11px]">
              /
            </kbd>{" "}
            or click to add a block
          </span>
        </div>
      ) : (
        <SortableContext items={blockIds} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col" style={{ gap }}>
            {blocks.map((block, blockIndex) => (
              <SortableBlock
                key={block.id}
                block={block}
                isSelected={selectedBlockId === block.id}
                onSelect={() => onSelectBlock(block.id)}
                onDelete={() => onDeleteBlock(block.id)}
                onUpdate={(content) => onUpdateBlock(block.id, content)}
                blockIndex={blockIndex}
                totalBlocks={blocks.length}
                columnIndex={columnIndex}
                totalColumns={totalColumns}
                isEditing={isEditing}
                onMoveUp={() => onMoveBlockUp(block.id)}
                onMoveDown={() => onMoveBlockDown(block.id)}
                onMoveToColumn={(direction) =>
                  moveToColumn(block.id, direction)
                }
                onOpenInsertMenu={(el) =>
                  openMenuAt(el, {
                    kind: "insert",
                    insertIndex: blockIndex + 1,
                  })
                }
                onSlash={(anchorEl) => handleSlash(block.id, anchorEl)}
                onEnter={() => handleEnter(block.id)}
                pendingFocus={pendingFocusBlockId === block.id}
                onFocusConsumed={() => handleFocusConsumed(block.id)}
              />
            ))}
          </div>
        </SortableContext>
      )}

      {menu && (
        <BlockMenu
          anchor={menu.anchor}
          initialQuery={menuQuery}
          filter={menuFilter}
          onPick={handlePick}
          onClose={closeMenu}
        />
      )}
    </div>
  );
}
