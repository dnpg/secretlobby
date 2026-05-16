import { useEffect, useRef, useState } from "react";
import { cn } from "@secretlobby/ui";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type {
  BlockContent,
  BlockType,
  Section,
  ViewportSize,
} from "../state/types";
import { DragHandleIcon } from "../icons";
import { SectionComponent } from "./SectionComponent";

// Sortable wrapper for sections
export interface SortableSectionProps {
  section: Section;
  isSelected: boolean;
  selectedColumnId: string | null;
  onClick: () => void;
  viewport: ViewportSize;
  isEditing: boolean;
  showLayoutEdit: boolean;
  selectedBlockId: string | null;
  onSelectColumn: (columnId: string) => void;
  onSelectBlock: (blockId: string | null) => void;
  onAddBlock: (columnId: string, blockType: BlockType, atIndex?: number) => void;
  onDeleteBlock: (columnId: string, blockId: string) => void;
  onUpdateBlock: (columnId: string, blockId: string, content: Partial<BlockContent>) => void;
  onReorderBlocks: (columnId: string, blockIds: string[]) => void;
  onResizeColumns?: (
    leftColumnId: string,
    rightColumnId: string,
    leftWidth: string,
    rightWidth: string,
    viewport: ViewportSize
  ) => void;
  onMoveBlockUp: (columnId: string, blockId: string) => void;
  onMoveBlockDown: (columnId: string, blockId: string) => void;
  onMoveBlockToColumn: (columnId: string, blockId: string, direction: "left" | "right") => void;
}

export function SortableSection({
  section,
  isSelected,
  selectedColumnId,
  onClick,
  viewport,
  isEditing,
  showLayoutEdit,
  selectedBlockId,
  onSelectColumn,
  onSelectBlock,
  onAddBlock,
  onDeleteBlock,
  onUpdateBlock,
  onReorderBlocks,
  onResizeColumns,
  onMoveBlockUp,
  onMoveBlockDown,
  onMoveBlockToColumn,
}: SortableSectionProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id });

  const containerRef = useRef<HTMLDivElement>(null);
  const [hasSpaceLeft, setHasSpaceLeft] = useState(false);

  // Check if there's enough space to the left for the drag handle
  useEffect(() => {
    const checkSpace = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const parentRect = containerRef.current.offsetParent?.getBoundingClientRect();
        const leftSpace = parentRect ? rect.left - parentRect.left : rect.left;
        setHasSpaceLeft(leftSpace >= 36); // ~36px for handle width + margin
      }
    };
    checkSpace();
    window.addEventListener("resize", checkSpace);
    return () => window.removeEventListener("resize", checkSpace);
  }, []);

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    position: "relative",
  };

  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }}
      style={style}
      className={cn(
        "group relative",
        isDragging && "opacity-90 scale-[1.01]"
      )}
    >
      {/* Floating Drag Handle - layout-level affordance, gated by both
          `isEditing` (preview mode hides it) and `showLayoutEdit` (the
          dashed-square toggle in the header). */}
      {isEditing && showLayoutEdit && (
        <button
          className={cn(
            "absolute z-10 p-1.5 rounded-lg bg-theme-secondary border border-theme shadow-lg transition-all cursor-grab active:cursor-grabbing",
            "opacity-0 group-hover:opacity-100 text-gray-400 hover:text-white hover:bg-theme-tertiary",
            isDragging && "opacity-100 cursor-grabbing text-white bg-theme-tertiary",
            hasSpaceLeft ? "top-0 left-0 -translate-x-full -ml-1" : "top-0 left-0 m-1"
          )}
          title="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          <DragHandleIcon />
        </button>
      )}

      <SectionComponent
        section={section}
        isSelected={isSelected}
        selectedColumnId={selectedColumnId}
        onClick={onClick}
        viewport={viewport}
        isEditing={isEditing}
        showLayoutEdit={showLayoutEdit}
        selectedBlockId={selectedBlockId}
        onSelectColumn={onSelectColumn}
        onSelectBlock={onSelectBlock}
        onAddBlock={onAddBlock}
        onDeleteBlock={onDeleteBlock}
        onUpdateBlock={onUpdateBlock}
        onReorderBlocks={onReorderBlocks}
        onResizeColumns={onResizeColumns}
        onMoveBlockUp={onMoveBlockUp}
        onMoveBlockDown={onMoveBlockDown}
        onMoveBlockToColumn={onMoveBlockToColumn}
      />
    </div>
  );
}
