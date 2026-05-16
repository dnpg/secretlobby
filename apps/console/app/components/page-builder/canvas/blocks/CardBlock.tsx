import { useCallback, useMemo, type CSSProperties } from "react";
import { cn } from "@secretlobby/ui";
import {
  closestCorners,
  DndContext,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import {
  backdropFilterToCSS,
  borderRadiusToCSS,
  getCardBgCSS,
  getCardBorderCSS,
} from "~/lib/theme";
import { useSwatches } from "../../PageBuilderRoot";
import { usePageBuilder } from "../../state/provider";
import { createBlock } from "../../state/helpers";
import type {
  BlockContent,
  BlockType,
  CardBlockContent,
  ThemeSettings,
} from "../../state/types";
import { BlockListSurface } from "../BlockListSurface";
import {
  EditorAwareKeyboardSensor,
  EditorAwarePointerSensor,
} from "../EditorAwareSensors";

interface CardBlockProps {
  blockId: string;
  content: CardBlockContent;
  theme: ThemeSettings;
  isEditing: boolean;
}

// Block types that aren't allowed inside a card. Cards-inside-cards is
// banned to keep the data shape one level deep (and the layers panel from
// needing recursion guards). Player / Gallery are console-level blocks that
// don't make sense to nest inside a card surface.
const DISALLOWED_INSIDE_CARD: ReadonlySet<BlockType> = new Set([
  "player",
  "card",
  "gallery",
]);

// Parse a CSS length string ("1px", "0.5rem", "0") into its leading numeric
// value. Returns 0 for empty / undefined / non-numeric input — which is the
// correct "no width" behaviour for the border on/off check below.
function parseCSSLengthNumeric(value: string | undefined): number {
  if (!value) return 0;
  const match = String(value).trim().match(/^-?[\d.]+/);
  if (!match) return 0;
  const n = parseFloat(match[0]);
  return Number.isFinite(n) ? n : 0;
}

// True when the effective border width is positive on at least one side.
// Drives the "paint the border" decision; replaces the old `showBorder` flag.
function hasPositiveBorderWidth(theme: ThemeSettings): boolean {
  const sides = theme.cardBorderSideWidths;
  if (sides) {
    return (
      parseCSSLengthNumeric(sides.top) > 0 ||
      parseCSSLengthNumeric(sides.right) > 0 ||
      parseCSSLengthNumeric(sides.bottom) > 0 ||
      parseCSSLengthNumeric(sides.left) > 0
    );
  }
  return parseCSSLengthNumeric(theme.cardBorderWidth) > 0;
}

// Card block — a themed container that holds a nested stack of blocks. The
// slash menu inside the card excludes player / card / gallery; everything
// else (heading, paragraph, lists, quote, code, table, divider, image) is
// allowed. Reordering happens inside a local DndContext scoped to this card,
// so nested ids never collide with the canvas-level context.
export function CardBlock({
  blockId,
  content,
  theme,
  isEditing,
}: CardBlockProps) {
  const { state, dispatch } = usePageBuilder();
  const { swatches, drafts } = useSwatches();

  // Resolve "selected nested block" against this card. Only matches when the
  // selection's cardBlockId is THIS card — top-level selections of the card
  // itself don't paint a child highlight.
  const selectedChildBlockId =
    state.selection.kind === "block" &&
    state.selection.cardBlockId === blockId
      ? state.selection.blockId
      : null;

  // ---- DnD: local context scoped to THIS card. -----------------------------
  // The canvas's top-level DndContext can't pick up nested ids cleanly — it
  // expects all draggable ids to live in column SortableContexts, and its
  // unified drag-end handler classifies by location helpers that don't walk
  // inside cards. Mounting a local DndContext per card keeps card reordering
  // isolated and means we never have to add a second classification path.
  const sensors = useSensors(
    useSensor(EditorAwarePointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(EditorAwareKeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const childBlocks = content.blocks ?? [];

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const ids = childBlocks.map((b) => b.id);
      const oldIndex = ids.indexOf(active.id as string);
      const newIndex = ids.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1) return;
      dispatch({
        type: "reorderBlocksInCard",
        cardBlockId: blockId,
        blockIds: arrayMove(ids, oldIndex, newIndex),
      });
    },
    [childBlocks, blockId, dispatch]
  );

  // ---- Wrapper style — same theme chrome as before. ------------------------
  const border = getCardBorderCSS(theme);
  const showBorder = hasPositiveBorderWidth(theme);
  const backdropFilterCSS = backdropFilterToCSS(theme.cardBackdropFilter);
  const hasBackdropFilter =
    backdropFilterCSS !== "none" && backdropFilterCSS.length > 0;
  const wrapperStyle: CSSProperties = useMemo(
    () => ({
      background: getCardBgCSS(
        theme,
        swatches as unknown as Parameters<typeof getCardBgCSS>[1],
        drafts as unknown as Parameters<typeof getCardBgCSS>[2]
      ),
      borderRadius: borderRadiusToCSS(theme.cardBorderRadius, 12),
      color: theme.cardContentColor,
      ...(hasBackdropFilter
        ? {
            backdropFilter: backdropFilterCSS,
            WebkitBackdropFilter: backdropFilterCSS,
          }
        : {}),
      ...(showBorder
        ? {
            border: border.style,
            ...(border.widths
              ? {
                  borderTopWidth: border.widths.top,
                  borderRightWidth: border.widths.right,
                  borderBottomWidth: border.widths.bottom,
                  borderLeftWidth: border.widths.left,
                }
              : {}),
            ...(border.styles
              ? {
                  borderTopStyle: border.styles.top,
                  borderRightStyle: border.styles.right,
                  borderBottomStyle: border.styles.bottom,
                  borderLeftStyle: border.styles.left,
                }
              : {}),
          }
        : { border: "none" }),
      ...(border.boxShadow ? { boxShadow: border.boxShadow } : {}),
    }),
    [
      theme,
      swatches,
      drafts,
      hasBackdropFilter,
      backdropFilterCSS,
      showBorder,
      border,
    ]
  );

  // ---- Callbacks the BlockListSurface dispatches against. ------------------
  const handleAddBlock = useCallback(
    (type: BlockType, atIndex?: number) => {
      if (DISALLOWED_INSIDE_CARD.has(type)) return;
      const newBlock = createBlock(type);
      dispatch({
        type: "addBlockToCard",
        cardBlockId: blockId,
        block: newBlock,
        index: atIndex,
        select: true,
      });
    },
    [blockId, dispatch]
  );

  const handleDeleteBlock = useCallback(
    (childBlockId: string) => {
      dispatch({
        type: "deleteBlockFromCard",
        cardBlockId: blockId,
        blockId: childBlockId,
      });
    },
    [blockId, dispatch]
  );

  const handleUpdateBlock = useCallback(
    (childBlockId: string, partial: Partial<BlockContent>) => {
      dispatch({
        type: "updateBlockInCard",
        cardBlockId: blockId,
        blockId: childBlockId,
        content: partial,
      });
    },
    [blockId, dispatch]
  );

  const handleReorderBlocks = useCallback(
    (ids: string[]) => {
      dispatch({
        type: "reorderBlocksInCard",
        cardBlockId: blockId,
        blockIds: ids,
      });
    },
    [blockId, dispatch]
  );

  const handleMoveBlockUp = useCallback(
    (childBlockId: string) => {
      dispatch({
        type: "moveBlockUpInCard",
        cardBlockId: blockId,
        blockId: childBlockId,
      });
    },
    [blockId, dispatch]
  );

  const handleMoveBlockDown = useCallback(
    (childBlockId: string) => {
      dispatch({
        type: "moveBlockDownInCard",
        cardBlockId: blockId,
        blockId: childBlockId,
      });
    },
    [blockId, dispatch]
  );

  // In-place block-type swap inside the card. Filters disallowed types
  // (player/card/gallery) the same way `handleAddBlock` does so the slash
  // menu's filter and the reducer agree.
  const handleReplaceBlock = useCallback(
    (childBlockId: string, newType: BlockType) => {
      if (DISALLOWED_INSIDE_CARD.has(newType)) return;
      dispatch({
        type: "replaceBlockInCard",
        cardBlockId: blockId,
        blockId: childBlockId,
        newType,
      });
    },
    [blockId, dispatch]
  );

  const handleSelectBlock = useCallback(
    (childBlockId: string | null) => {
      if (childBlockId == null) {
        dispatch({ type: "clearSelection" });
        return;
      }
      // The outer card already knows its own (sectionId, columnId) via the
      // top-level selection; we walk the tree once to find them. This is
      // O(sections * columns); the tree is tiny so it's fine.
      for (const section of state.sections) {
        for (const column of section.columns) {
          if (column.blocks.some((b) => b.id === blockId)) {
            dispatch({
              type: "selectBlock",
              sectionId: section.id,
              columnId: column.id,
              blockId: childBlockId,
              cardBlockId: blockId,
            });
            return;
          }
        }
      }
    },
    [state.sections, blockId, dispatch]
  );

  return (
    <div
      className={cn("w-full p-4")}
      style={wrapperStyle}
      // Stop click-to-select on the card chrome from bubbling up to the
      // parent column / section selection handlers.
      onClick={(e) => e.stopPropagation()}
    >
      <DndContext
        id={`card-${blockId}`}
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragEnd={handleDragEnd}
      >
        <BlockListSurface
          blocks={childBlocks}
          isEditing={isEditing}
          selectedBlockId={selectedChildBlockId}
          onAddBlock={handleAddBlock}
          onDeleteBlock={handleDeleteBlock}
          onUpdateBlock={handleUpdateBlock}
          onReorderBlocks={handleReorderBlocks}
          onMoveBlockUp={handleMoveBlockUp}
          onMoveBlockDown={handleMoveBlockDown}
          onSelectBlock={handleSelectBlock}
          onReplaceBlock={handleReplaceBlock}
          menuFilter={(item) => !DISALLOWED_INSIDE_CARD.has(item.type)}
        />
      </DndContext>
    </div>
  );
}
