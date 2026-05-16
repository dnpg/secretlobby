import { useCallback, useRef, useState } from "react";
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
// the exact same affordances:
//
//   - Empty state placeholder that opens a slash menu on `/`, Enter, or click.
//   - Top-of-list insert line (Notion-style hairline + small `+`) — only
//     when the list has blocks; the empty placeholder covers the no-blocks
//     case.
//   - Each block wrapped in <SortableBlock> with a toolbar (move/insert/grip).
//   - Hover gap with a centered `+` between adjacent blocks.
//   - A SortableContext scoped to THIS surface's block ids so reordering
//     stays local to the surface.
//
// Drag-and-drop note: the surface itself does NOT mount a DndContext —
// callers do, because the canvas owns a single top-level DndContext for the
// column case (so drags can cross columns), while the card case mounts a
// LOCAL DndContext per card so nested ids don't collide with the canvas
// ones. The component is otherwise context-agnostic.
//
// `menuFilter` lets the caller restrict the slash menu: the column variant
// passes no filter (allow all block types), the card variant filters out
// `player` / `card` / `gallery` (those block types are console-specific and
// don't belong inside a card).
// =============================================================================

export interface BlockListSurfaceProps {
  blocks: Block[];
  // True in edit mode — drives toolbars, gaps, and insert affordances.
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
  // Restricts which block-menu entries are shown. Omit for "allow all".
  menuFilter?: (item: BlockMenuItem) => boolean;
}

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
  menuFilter,
}: BlockListSurfaceProps) {
  const [menu, setMenu] = useState<{
    anchor: BlockMenuAnchor;
    insertIndex: number;
  } | null>(null);
  const [menuQuery, setMenuQuery] = useState("");
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const emptyPlaceholderRef = useRef<HTMLDivElement | null>(null);

  const blockIds = blocks.map((b) => b.id);
  const gap = parseGapValue(blockGap || "8");

  const openMenuAt = useCallback(
    (el: HTMLElement | null, insertIndex: number, query = "") => {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setMenu({
        anchor: { top: rect.top, left: rect.left, bottom: rect.bottom },
        insertIndex,
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
      onAddBlock(type, menu.insertIndex);
      closeMenu();
    },
    [menu, onAddBlock, closeMenu]
  );

  const handleEmptyKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isEditing) return;
    if (e.key === "/" || e.key === "+" || e.key === "Enter") {
      e.preventDefault();
      openMenuAt(emptyPlaceholderRef.current, 0, "");
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

  return (
    <div ref={wrapperRef} className="relative w-full">
      {blocks.length === 0 && isEditing ? (
        <div
          ref={emptyPlaceholderRef}
          tabIndex={0}
          role="button"
          aria-label="Add a block"
          onKeyDown={handleEmptyKeyDown}
          onClick={(e) => {
            e.stopPropagation();
            openMenuAt(emptyPlaceholderRef.current, 0, "");
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
            {isEditing && (
              <TopInsertLine onInsert={(el) => openMenuAt(el, 0, "")} />
            )}
            {blocks.map((block, blockIndex) => (
              <div key={block.id}>
                <SortableBlock
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
                  onOpenInsertMenu={(el) => openMenuAt(el, blockIndex + 1)}
                />
                {isEditing && (
                  <BlockGap
                    onInsert={(el) => openMenuAt(el, blockIndex + 1)}
                  />
                )}
              </div>
            ))}
          </div>
        </SortableContext>
      )}

      {menu && (
        <BlockMenu
          anchor={menu.anchor}
          containerEl={wrapperRef.current}
          initialQuery={menuQuery}
          filter={menuFilter}
          onPick={handlePick}
          onClose={closeMenu}
        />
      )}
    </div>
  );
}

// Always-on insert line at the top of a populated list. Notion-style: a
// hairline with a centred `+`. Only rendered in edit mode.
function TopInsertLine({
  onInsert,
}: {
  onInsert: (el: HTMLElement) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  return (
    <div className="relative h-5 group/top-add">
      <div
        className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 transition-colors"
        style={{
          background:
            "color-mix(in srgb, var(--color-text-primary) 12%, transparent)",
        }}
      />
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (buttonRef.current) onInsert(buttonRef.current);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label="Add a block at the top"
        title="Add a block"
        className={cn(
          "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
          "w-5 h-5 flex items-center justify-center rounded-full",
          "border border-theme shadow-sm cursor-pointer transition-colors",
          "text-theme-secondary hover:text-[var(--color-brand-red)] hover:border-[var(--color-brand-red)]/60"
        )}
        style={{ backgroundColor: "var(--color-bg-secondary)" }}
      >
        <PlusIcon className="w-3 h-3" />
      </button>
    </div>
  );
}

// Hover-revealed gap between adjacent blocks. Picking from its menu inserts
// at the index immediately after the preceding block.
function BlockGap({
  onInsert,
}: {
  onInsert: (el: HTMLElement) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  return (
    <div className="relative h-3 group/gap">
      <div
        className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 opacity-0 group-hover/gap:opacity-100 transition-opacity"
        style={{
          background:
            "color-mix(in srgb, var(--color-brand-red) 30%, transparent)",
        }}
      />
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (buttonRef.current) onInsert(buttonRef.current);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label="Insert block here"
        className={cn(
          "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
          "w-5 h-5 flex items-center justify-center rounded-full",
          "bg-[var(--color-brand-red)] text-white shadow-sm",
          "opacity-0 group-hover/gap:opacity-100 transition-opacity cursor-pointer"
        )}
      >
        <PlusIcon className="w-3 h-3" />
      </button>
    </div>
  );
}
