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
  boxPaddingToCSS,
  getCardBgCSS,
  getCardBorderCSS,
  textColorFallbackHex,
  textColorToCSSDeclarations,
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
  // The page-builder Card editor only writes solid borders; `cardBorderImage`
  // and `cardBorderType: "gradient"` are deprecated. `getCardBorderCSS` still
  // honours both for back-compat with player/lobby consumers, but when either
  // is set it returns `"<width> solid transparent"` + a `borderImage` that
  // this wrapper doesn't spread — the net effect is an invisible border that
  // ignores the user's picked `cardBorderColor`. Strip the legacy fields here
  // so the helper always falls through to the uniform-solid path.
  const solidBorderTheme = useMemo<ThemeSettings>(
    () => ({ ...theme, cardBorderImage: undefined, cardBorderType: "solid" }),
    [theme]
  );
  const border = getCardBorderCSS(solidBorderTheme);
  const showBorder = hasPositiveBorderWidth(theme);
  const backdropFilterCSS = backdropFilterToCSS(theme.cardBackdropFilter);
  const hasBackdropFilter =
    backdropFilterCSS !== "none" && backdropFilterCSS.length > 0;

  // Rich text resolution for the card's heading + content colors.
  // The old (pre–Notion-blocks) Card painted titles like this:
  //   background: -webkit-linear-gradient(...);
  //   -webkit-background-clip: text;
  //   -webkit-text-fill-color: transparent;
  //   color: <fallback hex>;
  // We rebuild the same pattern here: compute three pieces per role —
  //   - color: the resolved fallback hex (always a real color, NEVER
  //     `transparent`) so non-supporting browsers stay readable
  //   - image: the gradient itself, or `none` for solids
  //   - fill: `transparent` when the role IS a gradient (so the gradient
  //     shows through the glyphs via background-clip:text), else
  //     `currentColor` (so the solid `color` paints the text normally)
  // CardBlock emits all three as CSS vars on its wrapper. HeadingBlock
  // (and any future ParagraphBlock-side hookup) reads them via inherited
  // `--color-text-heading*` vars and applies the same -webkit-* pattern.
  function richTextPieces(
    rich: ThemeSettings["cardHeadingColorRich"] | undefined,
    legacy: string
  ): { color: string; image: string; fill: string } {
    const sw = swatches as unknown as Parameters<
      typeof textColorToCSSDeclarations
    >[1];
    const dr = drafts as unknown as Parameters<
      typeof textColorToCSSDeclarations
    >[2];
    if (!rich) return { color: legacy, image: "none", fill: "currentColor" };
    const decls = textColorToCSSDeclarations(rich, sw, dr);
    if (!decls.backgroundImage) {
      return { color: decls.color, image: "none", fill: "currentColor" };
    }
    return {
      color: textColorFallbackHex(rich, legacy, sw, dr),
      image: decls.backgroundImage,
      fill: "transparent",
    };
  }
  const cardHeadingPieces = useMemo(
    () => richTextPieces(theme.cardHeadingColorRich, theme.cardHeadingColor),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theme.cardHeadingColorRich, theme.cardHeadingColor, swatches, drafts]
  );
  const cardContentPieces = useMemo(
    () => richTextPieces(theme.cardContentColorRich, theme.cardContentColor),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theme.cardContentColorRich, theme.cardContentColor, swatches, drafts]
  );
  const wrapperStyle: CSSProperties = useMemo(
    () => ({
      background: getCardBgCSS(
        theme,
        swatches as unknown as Parameters<typeof getCardBgCSS>[1],
        drafts as unknown as Parameters<typeof getCardBgCSS>[2]
      ),
      borderRadius: borderRadiusToCSS(theme.cardBorderRadius, 12),
      // Inner padding — content-level override falls back to 16px (the
      // legacy `p-4` Tailwind class this replaces). `boxPaddingToCSS`
      // handles both the uniform number and the per-side object form so
      // the emitted CSS shorthand is always valid.
      padding: boxPaddingToCSS(content.padding, 16),
      color: theme.cardContentColor,
      // Cascade theme card text + heading colors to descendants via CSS
      // variables. HeadingBlock reads `--color-text-heading` (falling back
      // to `--color-text-primary` outside cards), and ParagraphBlock /
      // QuoteBlock read `--color-text-content` (falling back to the
      // primary/secondary text tokens). Setting these on the card wrapper
      // keeps the global theme as the canvas default and lets cards
      // override per-card via their own theme overrides.
      //
      // For each role we emit THREE vars — `*` (the color), `*-image`
      // (the gradient or `none`), and `*-fill` (`transparent` when the
      // role is a gradient, `currentColor` otherwise). The descendant
      // block writes them through the legacy `-webkit-text-fill-color` +
      // `-webkit-background-clip: text` pattern, so gradients mask the
      // text while solid colors render normally via `color`. The `color`
      // var carries the real fallback hex (NOT `transparent`) so browsers
      // that can't do background-clip:text still paint legible text.
      ["--color-text-heading" as string]: cardHeadingPieces.color,
      ["--color-text-heading-image" as string]: cardHeadingPieces.image,
      ["--color-text-heading-fill" as string]: cardHeadingPieces.fill,
      ["--color-text-content" as string]: cardContentPieces.color,
      ["--color-text-content-image" as string]: cardContentPieces.image,
      ["--color-text-content-fill" as string]: cardContentPieces.fill,
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
      cardHeadingPieces,
      cardContentPieces,
      content.padding,
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
      className={cn("w-full")}
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
          // Nested surface: switches each child SortableBlock's toolbar to
          // a `group/inner-block` scope so hovering the outer card no
          // longer reveals every inner toolbar at once.
          isNested
        />
      </DndContext>
    </div>
  );
}
