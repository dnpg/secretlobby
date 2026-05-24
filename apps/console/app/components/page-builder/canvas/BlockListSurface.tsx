import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@secretlobby/ui";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type {
  Block,
  BlockContent,
  BlockType,
  ParagraphBlockContent,
} from "../state/types";
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
  // True when this surface is rendered INSIDE a card (i.e. its
  // SortableBlocks are nested under another SortableBlock at the column
  // level). Forwarded to each SortableBlock so the per-block toolbar uses
  // a distinct Tailwind named group (`group/inner-block` instead of
  // `group/block`) — without that distinction, hovering the outer card
  // would cascade hover state into every nested toolbar at once.
  isNested?: boolean;
}

// Internal handle describing what the open BlockMenu should do on pick.
// Either insert at a column index (toolbar `+` button) or replace a
// specific block id in place (slash-from-inside-editor).
type MenuMode =
  | { kind: "insert"; insertIndex: number }
  | { kind: "replace"; blockId: string };

// Block types backed by the InlineEditor — these can consume a pending-
// focus token directly on the replaced id. Other types (image, divider,
// table, code-block, lists, etc.) don't carry an inline-editable surface,
// so for those we focus the trailing paragraph the reducer auto-appends
// instead.
const TEXT_BLOCK_TYPES: ReadonlySet<BlockType> = new Set<BlockType>([
  "heading",
  "paragraph",
  "quote",
  "code",
]);

// Walk a Tiptap inline JSON doc and collect concatenated text. Mirrors
// ProseMirror's `doc.textContent` without spinning up a view just to ask
// "is this paragraph effectively empty?". Used by `handleEnter` to decide
// whether to step the caret into an existing trailing empty paragraph
// rather than dispatching another `addBlock` and stacking an orphan line.
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
  isNested = false,
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
  // after every render; cheap because `blocks` is short. We also dispatch
  // `onSelectBlock(fresh.id)` when the resolved paragraph isn't already
  // selected — the InlineEditor only flips editable while its block is
  // selected, and the slash-replace path for non-text targets (image,
  // divider, gallery, etc.) leaves the original id selected even though we
  // want the caret to land in the freshly-appended trailing paragraph.
  useEffect(() => {
    const req = pendingFocusReqRef.current;
    if (!req) return;
    const fresh = blocks.find(
      (b) => b.type === "paragraph" && !req.knownIds.has(b.id)
    );
    if (fresh) {
      pendingFocusReqRef.current = null;
      setPendingFocusBlockId(fresh.id);
      if (selectedBlockId !== fresh.id) {
        onSelectBlock(fresh.id);
      }
    }
  }, [blocks, onSelectBlock, selectedBlockId]);

  // In preview mode, trim leading + trailing runs of empty paragraphs. The
  // reducer auto-seeds the typing-affordance paragraphs at the start of
  // every column and after every non-paragraph insert; in edit mode they
  // double as the "Press / to add blocks" hint, but in preview they'd just
  // render as blank gaps before / after the real content. Middle empties
  // are intentional (the user might have left them as visual spacers), so
  // we only chip away at the edges.
  const renderedBlocks = isEditing
    ? blocks
    : (() => {
        let start = 0;
        while (start < blocks.length && isEmptyParagraphBlock(blocks[start])) {
          start++;
        }
        let end = blocks.length;
        while (end > start && isEmptyParagraphBlock(blocks[end - 1])) {
          end--;
        }
        return blocks.slice(start, end);
      })();
  const blockIds = renderedBlocks.map((b) => b.id);
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
        // Toolbar `+` insert. The reducer's `select: true` on `addBlock`
        // selects the inserted block, which is what we want for text-ish
        // types (paragraph / heading / quote / code) — the InlineEditor's
        // auto-focus chains off `isSelected` and lands the caret inside
        // the new block so the user can type immediately. Non-text inserts
        // (image / divider / etc.) leave the caret nowhere unless we
        // forward focus to the trailing paragraph the reducer also
        // appends, so snapshot known ids for the resolver to catch it.
        if (!TEXT_BLOCK_TYPES.has(type)) {
          pendingFocusReqRef.current = {
            sourceBlockId: "",
            knownIds: new Set(blocks.map((b) => b.id)),
          };
        }
        onAddBlock(type, menu.mode.insertIndex);
      } else {
        const replacedId = menu.mode.blockId;
        if (TEXT_BLOCK_TYPES.has(type)) {
          // Text replacement: the block id is preserved, so the caret lands
          // inside the swapped heading / paragraph / quote / code by
          // pointing pendingFocus at the same id.
          onReplaceBlock(replacedId, type);
          setPendingFocusBlockId(replacedId);
        } else {
          // Non-text replacement (image / divider / table / list /
          // codeBlock / gallery / card / player): the swapped block has no
          // inline editor, so the caret has nowhere to land on it. The
          // reducer auto-appends a fresh trailing paragraph after every
          // non-paragraph replace — snapshot known ids BEFORE the dispatch
          // and let the resolver effect pick out the trailing paragraph
          // and route focus + selection there.
          pendingFocusReqRef.current = {
            sourceBlockId: replacedId,
            knownIds: new Set(blocks.map((b) => b.id)),
          };
          onReplaceBlock(replacedId, type);
        }
      }
      closeMenu();
    },
    [menu, onAddBlock, onReplaceBlock, closeMenu, blocks]
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

  // Enter-from-inside-editor handler. If the very next block is already an
  // empty paragraph (typically the trailing paragraph the reducer
  // auto-appended after a slash-replace, or a previously-Enter-created
  // empty line), step the caret INTO it instead of dispatching another
  // `addBlock`. That kills the orphan empty paragraph that would otherwise
  // appear below a freshly slash-inserted heading / quote / code as soon
  // as the user typed a title and hit Enter. Selection alone is enough to
  // land the caret — the InlineEditor's setEditable + auto-focus effects
  // chain off `isSelected`.
  const handleEnter = useCallback(
    (blockId: string, opts?: { atStart: boolean }) => {
      const idx = blocks.findIndex((b) => b.id === blockId);
      if (idx === -1) return;

      // When the cursor is at position 0 of a non-empty block, insert
      // ABOVE so the current content pushes down — matches the expected
      // text-editor feel (Enter at position 0 opens a blank line above).
      if (opts?.atStart) {
        pendingFocusReqRef.current = {
          sourceBlockId: blockId,
          knownIds: new Set(blocks.map((b) => b.id)),
        };
        onAddBlock("paragraph", idx);
        return;
      }

      const nextBlock = blocks[idx + 1];
      if (nextBlock && isEmptyParagraphBlock(nextBlock)) {
        // Select AND queue pendingFocus. Selection alone flips the next
        // editor editable, but the auto-focus effect bails when
        // `editor.isFocused` is already true — which it can be when the
        // old editor's blur hasn't fully landed by the time React commits.
        // pendingFocus has no `isFocused` guard, so it deterministically
        // moves the caret to the next paragraph.
        onSelectBlock(nextBlock.id);
        setPendingFocusBlockId(nextBlock.id);
        return;
      }
      pendingFocusReqRef.current = {
        sourceBlockId: blockId,
        knownIds: new Set(blocks.map((b) => b.id)),
      };
      onAddBlock("paragraph", idx + 1);
    },
    [blocks, onAddBlock, onSelectBlock]
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
            {renderedBlocks.map((block, blockIndex) => (
              <SortableBlock
                key={block.id}
                block={block}
                isSelected={selectedBlockId === block.id}
                onSelect={() => onSelectBlock(block.id)}
                onDelete={() => onDeleteBlock(block.id)}
                onUpdate={(content) => onUpdateBlock(block.id, content)}
                blockIndex={blockIndex}
                totalBlocks={renderedBlocks.length}
                columnIndex={columnIndex}
                totalColumns={totalColumns}
                isEditing={isEditing}
                isNested={isNested}
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
                onEnter={(opts) => handleEnter(block.id, opts)}
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
