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
  // True when this SortableBlock is rendered INSIDE a card (i.e. nested
  // under another SortableBlock). Switches the Tailwind named group from
  // `group/block` to `group/inner-block` so hovering the outer card no
  // longer cascades the inner toolbars into view — Tailwind's
  // `group-hover/<name>:` modifier matches any ancestor with the named
  // group, so a shared name would make every inner toolbar respond to
  // hover on the outer card. Distinct names isolate the scope.
  isNested?: boolean;
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
  isNested = false,
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
      // Named group: `group/block` at the column level, `group/inner-block`
      // when nested inside a card. Distinct names keep the toolbar's
      // `group-hover/...:` variants scoped strictly to ONE level — Tailwind
      // matches the modifier against any ancestor with the same group name,
      // so reusing `group/block` for nested SortableBlocks would make every
      // card-nested toolbar pop on outer-card hover. An unnamed `group`
      // would be even worse — it would collide with any ancestor's `.group`
      // class anywhere in the tree.
      //
      // Active-block outline lives on the absolutely-positioned overlay below
      // — keeping the indicator on a separate layer means `mix-blend-mode:
      // difference` can invert against whatever the block is rendered over,
      // staying legible on any lobby theme without reflowing the block.
      className={cn(
        "relative rounded-md",
        isNested ? "group/inner-block" : "group/block",
        isEditing && "touch-none"
      )}
      {...dragProps}
    >
      {isEditing && isSelected && (
        <div
          aria-hidden="true"
          // 4px outside the block on every side, with a matching 10px radius
          // so the corner stays concentric with the block's 6px rounded-md.
          // Hides itself while any descendant input (Tiptap editor, table
          // cell, code editor) is focused so it doesn't distract from typing.
          // Both named-group variants are present because the wrapper uses
          // `group/block` at the column level and `group/inner-block` when
          // nested inside a card — only the variant whose group is in the
          // ancestor chain will activate.
          className={cn(
            "pointer-events-none absolute -inset-1 rounded-[10px] border border-white z-20 transition-opacity",
            "group-focus-within/block:opacity-0 group-focus-within/inner-block:opacity-0"
          )}
          style={{ mixBlendMode: "difference" }}
        />
      )}
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
            // Match the group name picked above so the toolbar only reacts
            // to hover on its OWN SortableBlock wrapper, not on any
            // similarly-named ancestor in the tree.
            isNested
              ? "group-hover/inner-block:opacity-100 group-hover/inner-block:pointer-events-auto"
              : "group-hover/block:opacity-100 group-hover/block:pointer-events-auto"
          )}
        >
          <div
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
            className="p-1 rounded text-neutral-700 dark:text-neutral-300 hover:text-black dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-grab active:cursor-grabbing"
            title="Drag to reorder · click to select"
          >
            <BlockGripIcon />
          </div>

          <button
            ref={plusBtnRef}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (plusBtnRef.current) onOpenInsertMenu?.(plusBtnRef.current);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="p-1 rounded text-neutral-700 dark:text-neutral-300 hover:text-[var(--color-brand-red)] hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
            title="Insert block after"
          >
            <PlusIcon className="w-3 h-3" />
          </button>

          {canMoveUp && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMoveUp();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="p-1 rounded text-neutral-700 dark:text-neutral-300 hover:text-black dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
              title="Move up"
            >
              <ArrowUpIcon />
            </button>
          )}

          {canMoveDown && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMoveDown();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="p-1 rounded text-neutral-700 dark:text-neutral-300 hover:text-black dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
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
              className="p-1 rounded text-neutral-700 dark:text-neutral-300 hover:text-black dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
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
              className="p-1 rounded text-neutral-700 dark:text-neutral-300 hover:text-black dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
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
