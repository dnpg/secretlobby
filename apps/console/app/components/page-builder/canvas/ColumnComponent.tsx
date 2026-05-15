import { cn } from "@secretlobby/ui";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type {
  BlockContent,
  BlockType,
  Column,
} from "../state/types";
import { parseGapValue } from "../state/helpers";
import { SortableBlock } from "./SortableBlock";
import { AddBlockMenu } from "./AddBlockMenu";

// Column Component (renders a single column placeholder)
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
  onAddBlock: (blockType: BlockType) => void;
  onDeleteBlock: (blockId: string) => void;
  onUpdateBlock: (blockId: string, content: Partial<BlockContent>) => void;
  onReorderBlocks: (blockIds: string[]) => void;
  onMoveBlockUp: (blockId: string) => void;
  onMoveBlockDown: (blockId: string) => void;
  onMoveBlockToColumn: (blockId: string, direction: "left" | "right") => void;
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
  onReorderBlocks: _onReorderBlocks,
  onMoveBlockUp,
  onMoveBlockDown,
  onMoveBlockToColumn,
}: ColumnComponentProps) {
  // Column edit affordances (dashed border, click-to-select, add-block menu)
  // depend on both `isEditing` and the dashed-square toggle in TopHeader.
  // Blocks inside the column still render normally — only the column wrapper
  // becomes invisible.
  const showColumnUi = isEditing && showLayoutEdit;
  // Visibility: a hidden column is fully removed from the canvas in every
  // mode. The sidebar still surfaces it so the user can toggle it back on.
  const columnHidden = column.hidden === true;
  if (columnHidden) return null;
  // Make column a drop target for blocks
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: { type: "column", columnId: column.id },
  });

  // Block IDs for sortable context
  const blockIds = column.blocks.map((b) => b.id);
  const blockGap = parseGapValue(column.blockGap || "8");

  return (
    <div
      ref={setNodeRef}
      onClick={
        showColumnUi
          ? (e) => {
              e.stopPropagation();
              onSelectColumn();
            }
          : undefined
      }
      className={cn(
        "rounded transition-all min-h-[80px]",
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
      {/* Blocks with sortable context */}
      <SortableContext items={blockIds} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col" style={{ gap: blockGap }}>
          {column.blocks.map((block, blockIndex) => (
            <SortableBlock
              key={block.id}
              block={block}
              isSelected={selectedBlockId === block.id}
              onSelect={() => onSelectBlock(block.id)}
              onDelete={() => onDeleteBlock(block.id)}
              blockIndex={blockIndex}
              totalBlocks={column.blocks.length}
              columnIndex={index}
              totalColumns={totalColumns}
              isEditing={isEditing}
              onMoveUp={() => onMoveBlockUp(block.id)}
              onMoveDown={() => onMoveBlockDown(block.id)}
              onMoveToColumn={(direction) => onMoveBlockToColumn(block.id, direction)}
            />
          ))}
        </div>
      </SortableContext>

      {/* Add block button — part of the layout-edit affordances. Hidden when
          the dashed-square toggle is off; users can still add blocks from the
          LeftRail's inline "Add Block" dropdown per column. */}
      {showColumnUi && (
        <AddBlockMenu
          onAdd={onAddBlock}
          emptyColumn={column.blocks.length === 0}
        />
      )}
    </div>
  );
}
