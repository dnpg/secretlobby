import { useCallback, useRef } from "react";
import { cn } from "@secretlobby/ui";
import { useDroppable } from "@dnd-kit/core";
import type { BlockContent, BlockType, Column } from "../state/types";
import { BlockListSurface } from "./BlockListSurface";

// Column Component (renders a single column placeholder).
// The actual "block list" rendering — empty state, slash menu, sortable
// blocks, hover gaps, top insert line — lives in BlockListSurface, which is
// shared with CardBlock so cards behave like mini-columns.
export interface ColumnComponentProps {
  column: Column;
  index: number;
  totalColumns: number;
  isParentSelected: boolean;
  isSelected: boolean;
  isMobile: boolean;
  isSlider: boolean;
  isEditing: boolean;
  showLayoutEdit: boolean;
  selectedBlockId: string | null;
  onSelectColumn: () => void;
  onSelectBlock: (blockId: string | null) => void;
  // Inserts a block at the given index inside this column (defaults to end).
  onAddBlock: (blockType: BlockType, atIndex?: number) => void;
  onDeleteBlock: (blockId: string) => void;
  onUpdateBlock: (blockId: string, content: Partial<BlockContent>) => void;
  onReorderBlocks: (blockIds: string[]) => void;
  onMoveBlockUp: (blockId: string) => void;
  onMoveBlockDown: (blockId: string) => void;
  onMoveBlockToColumn: (blockId: string, direction: "left" | "right") => void;
  // Replace a block IN PLACE with a fresh block of the picked type. Triggered
  // when the user opens the slash menu from inside an inline editor.
  onReplaceBlock: (blockId: string, newType: BlockType) => void;
}

export function ColumnComponent({
  column,
  index,
  totalColumns,
  isSelected,
  isMobile,
  isSlider,
  isEditing,
  showLayoutEdit,
  selectedBlockId,
  onSelectColumn,
  onSelectBlock,
  onAddBlock,
  onDeleteBlock,
  onUpdateBlock,
  onReorderBlocks,
  onMoveBlockUp,
  onMoveBlockDown,
  onMoveBlockToColumn,
  onReplaceBlock,
}: ColumnComponentProps) {
  const showColumnUi = isEditing && showLayoutEdit;
  const columnHidden = column.hidden === true;
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Make column a drop target for blocks
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: column.id,
    data: { type: "column", columnId: column.id },
  });

  // Helper to merge ref callbacks — we need both the droppable ref and our
  // own wrapper ref on the same element.
  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      wrapperRef.current = node;
      setDroppableRef(node);
    },
    [setDroppableRef]
  );

  if (columnHidden) return null;

  return (
    <div
      ref={setRefs}
      onClick={
        showColumnUi
          ? (e) => {
              e.stopPropagation();
              onSelectColumn();
            }
          : undefined
      }
      className={cn(
        "rounded transition-all min-h-[80px] relative",
        showColumnUi && "cursor-pointer",
        isSlider && isMobile ? "min-w-[150px] flex-shrink-0" : "",
        isSelected && showColumnUi
          ? "ring-2 ring-indigo-400 ring-offset-2 ring-offset-[var(--color-bg-primary)]"
          : showColumnUi
            ? cn(
                "border border-dashed",
                isOver
                  ? "border-indigo-400 bg-indigo-500/5"
                  : "border-theme hover:border-indigo-400/50"
              )
            : cn(
                "border border-transparent",
                isOver && "border-indigo-400 bg-indigo-500/5"
              )
      )}
      style={{
        minWidth: isSlider && isMobile ? "150px" : undefined,
      }}
    >
      <BlockListSurface
        blocks={column.blocks}
        isEditing={isEditing}
        columnIndex={index}
        totalColumns={totalColumns}
        selectedBlockId={selectedBlockId}
        blockGap={column.blockGap}
        onAddBlock={onAddBlock}
        onDeleteBlock={onDeleteBlock}
        onUpdateBlock={onUpdateBlock}
        onReorderBlocks={onReorderBlocks}
        onMoveBlockUp={onMoveBlockUp}
        onMoveBlockDown={onMoveBlockDown}
        onMoveBlockToColumn={onMoveBlockToColumn}
        onSelectBlock={onSelectBlock}
        onReplaceBlock={onReplaceBlock}
        // No filter on the column surface — allow every block type.
      />
    </div>
  );
}
