import { cn } from "@secretlobby/ui";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Block } from "../state/types";
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  BlockGripIcon,
} from "../icons";
import { BlockRenderer } from "./BlockRenderer";

interface SortableBlockProps {
  block: Block;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  blockIndex: number;
  totalBlocks: number;
  columnIndex: number;
  totalColumns: number;
  isEditing: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onMoveToColumn: (direction: "left" | "right") => void;
}

// Sortable wrapper for blocks (drag and drop).
// Click to select, drag to move (8px movement threshold distinguishes click vs drag).
export function SortableBlock({
  block,
  isSelected,
  onSelect,
  onDelete,
  blockIndex,
  totalBlocks,
  columnIndex,
  totalColumns,
  isEditing,
  onMoveUp,
  onMoveDown,
  onMoveToColumn,
}: SortableBlockProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const canMoveUp = blockIndex > 0;
  const canMoveDown = blockIndex < totalBlocks - 1;
  const canMoveLeft = columnIndex > 0;
  const canMoveRight = columnIndex < totalColumns - 1;

  // Only attach drag attrs/listeners when editing. In preview mode the user is
  // not modifying layout; preventing the wrapper from being a drag source keeps
  // clicks/selection inside block content reliable.
  const dragProps = isEditing ? { ...attributes, ...listeners } : {};

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn("relative group", isEditing && "touch-none")}
      {...dragProps}
    >
      {/* Block layout controls - always visible in edit mode (hover-revealed) */}
      {isEditing && (
        <div className="absolute -top-1 -left-1 z-10 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Drag handle indicator */}
          <div
            className="p-1 rounded bg-theme-secondary hover:bg-theme-tertiary cursor-grab active:cursor-grabbing text-theme-secondary hover:text-theme-primary"
            title="Drag to reorder"
          >
            <BlockGripIcon />
          </div>

          {/* Move up */}
          {canMoveUp && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMoveUp();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="p-1 rounded bg-theme-secondary hover:bg-theme-tertiary text-theme-secondary hover:text-theme-primary cursor-pointer"
              title="Move up"
            >
              <ArrowUpIcon />
            </button>
          )}

          {/* Move down */}
          {canMoveDown && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMoveDown();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="p-1 rounded bg-theme-secondary hover:bg-theme-tertiary text-theme-secondary hover:text-theme-primary cursor-pointer"
              title="Move down"
            >
              <ArrowDownIcon />
            </button>
          )}

          {/* Move left */}
          {canMoveLeft && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMoveToColumn("left");
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="p-1 rounded bg-theme-secondary hover:bg-theme-tertiary text-theme-secondary hover:text-theme-primary cursor-pointer"
              title="Move to previous column"
            >
              <ArrowLeftIcon />
            </button>
          )}

          {/* Move right */}
          {canMoveRight && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMoveToColumn("right");
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="p-1 rounded bg-theme-secondary hover:bg-theme-tertiary text-theme-secondary hover:text-theme-primary cursor-pointer"
              title="Move to next column"
            >
              <ArrowRightIcon />
            </button>
          )}
        </div>
      )}

      <BlockRenderer
        block={block}
        isSelected={isSelected}
        onSelect={onSelect}
        onDelete={onDelete}
        isEditing={isEditing}
      />
    </div>
  );
}
