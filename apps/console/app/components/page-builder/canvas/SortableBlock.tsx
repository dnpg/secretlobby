import { useRef } from "react";
import { cn } from "@secretlobby/ui";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Block, BlockContent } from "../state/types";
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  BlockGripIcon,
  PlusIcon,
} from "../icons";
import { BlockRenderer } from "./BlockRenderer";

interface SortableBlockProps {
  block: Block;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onUpdate?: (content: Partial<BlockContent>) => void;
  blockIndex: number;
  totalBlocks: number;
  columnIndex: number;
  totalColumns: number;
  isEditing: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onMoveToColumn: (direction: "left" | "right") => void;
  // Called when the user clicks the `+` in the toolbar. The parent (column)
  // owns the BlockMenu popover and decides where to insert.
  onOpenInsertMenu?: (anchorEl: HTMLElement) => void;
  // Slash typed at the start of an empty inline editor inside this block.
  // The InlineEditor passes its outer DOM node so the menu can anchor.
  onSlash?: (anchorEl: HTMLElement) => void;
  // Enter pressed inside the text editor — parent appends a new paragraph
  // below and routes pending focus back via `pendingFocus`.
  onEnter?: () => void;
  // When true, the inline editor inside this block should focus itself once
  // and then call `onFocusConsumed`. Used to chase the caret onto a freshly
  // inserted paragraph after Enter.
  pendingFocus?: boolean;
  onFocusConsumed?: () => void;
}

// Sortable wrapper for blocks (drag and drop).
// Click to select, drag to move (8px movement threshold distinguishes click vs drag).
export function SortableBlock({
  block,
  isSelected,
  onSelect,
  onDelete,
  onUpdate,
  blockIndex,
  totalBlocks,
  columnIndex,
  totalColumns,
  isEditing,
  onMoveUp,
  onMoveDown,
  onMoveToColumn,
  onOpenInsertMenu,
  onSlash,
  onEnter,
  pendingFocus,
  onFocusConsumed,
}: SortableBlockProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id });
  const plusBtnRef = useRef<HTMLButtonElement | null>(null);

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
      // Named group (`group/block`) so the toolbar's `group-hover/block:*`
      // variants are scoped strictly to THIS block. An unnamed `group` would
      // be ambiguous if any ancestor were ever to add its own `.group` class.
      //
      // Active-block outline: when selected we paint a console-blue ring
      // (NOT theme tokens — this is an editor affordance that must remain
      // legible against any lobby theme). `ring-*` sits on top of the box
      // rather than reflowing it, so layout never shifts. The white /
      // neutral-950 `ring-offset` gives a contrast halo for dark themes.
      className={cn(
        "relative group/block rounded-md",
        isEditing && "touch-none",
        isEditing && isSelected
          ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-white dark:ring-offset-neutral-950"
          : ""
      )}
      {...dragProps}
    >
      {/* Toolbar — pinned to the top-left of the block and translated Y by
          -100% so it sits flush above the block (its bottom edge meets the
          block's top edge with no gap). Visible ONLY while the cursor is
          over THIS block's wrapper; selection alone does not reveal it. */}
      {isEditing && (
        <div
          // NOTE: do NOT add `data-no-dnd-keyboard` here. The EditorAware
          // pointer sensor's opt-out check uses `closest(...)`, so marking
          // the toolbar would also block pointerdown on the grip handle and
          // kill drag-to-reorder. The attribute belongs on actual text /
          // contenteditable surfaces (InlineEditor, ListEditor, TableBlock,
          // CodeBlockBlock) where Space/Enter would otherwise start a
          // keyboard drag while the user is typing. The toolbar's other
          // buttons already block pointer-drag via stopPropagation on
          // onPointerDown.
          //
          // Editor tool — uses the console's light/dark mode ONLY (the
          // `.dark` class on <html> drives the `dark:` variants). No
          // `--color-*` theme tokens, no transparency: a deep-black lobby
          // theme must not bleed through.
          className={cn(
            "absolute top-0 left-0 -translate-y-full z-10 flex items-center gap-0.5",
            "px-1 py-0.5 rounded-md",
            "bg-white dark:bg-neutral-900",
            "text-black dark:text-white",
            "border border-neutral-200 dark:border-neutral-800",
            "shadow-md ring-1 ring-black/10 dark:ring-white/10",
            "transition-opacity",
            "opacity-0 pointer-events-none",
            "group-hover/block:opacity-100 group-hover/block:pointer-events-auto"
          )}
        >
          <div
            className="p-1 rounded text-theme-secondary hover:text-theme-primary cursor-grab active:cursor-grabbing"
            title="Drag to reorder"
          >
            <BlockGripIcon />
          </div>

          {canMoveUp && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMoveUp();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="p-1 rounded text-theme-secondary hover:text-theme-primary cursor-pointer"
              title="Move up"
            >
              <ArrowUpIcon />
            </button>
          )}

          <button
            ref={plusBtnRef}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (plusBtnRef.current) onOpenInsertMenu?.(plusBtnRef.current);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="p-1 rounded text-theme-secondary hover:text-[var(--color-brand-red)] cursor-pointer"
            title="Insert block after"
          >
            <PlusIcon className="w-3 h-3" />
          </button>

          {canMoveDown && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMoveDown();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="p-1 rounded text-theme-secondary hover:text-theme-primary cursor-pointer"
              title="Move down"
            >
              <ArrowDownIcon />
            </button>
          )}

          {canMoveLeft && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMoveToColumn("left");
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="p-1 rounded text-theme-secondary hover:text-theme-primary cursor-pointer"
              title="Move to previous column"
            >
              <ArrowLeftIcon />
            </button>
          )}

          {canMoveRight && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMoveToColumn("right");
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="p-1 rounded text-theme-secondary hover:text-theme-primary cursor-pointer"
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
        onUpdate={onUpdate}
        isEditing={isEditing}
        onSlash={onSlash}
        onEnter={onEnter}
        pendingFocus={pendingFocus}
        onFocusConsumed={onFocusConsumed}
      />
    </div>
  );
}
