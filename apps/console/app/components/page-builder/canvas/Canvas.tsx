import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@secretlobby/ui";
import { generateThemeCSS } from "~/lib/theme";
import { useSwatches } from "../PageBuilderRoot";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type {
  Block,
  BlockContent,
  BlockType,
  Column,
  Section,
  ViewportSize,
} from "../state/types";
import { createBlock, VIEWPORT_WIDTHS } from "../state/helpers";
import { findBlockLocation } from "../state/reducer";
import { usePageBuilder } from "../state/provider";
import { BlockRenderer } from "./BlockRenderer";
import { SectionComponent } from "./SectionComponent";
import { SortableSection } from "./SortableSection";

// Top-level canvas: viewport-scaled frame, DnD providers (sections + blocks),
// and the section list. Children consume page-builder context indirectly via
// the callback props produced here, mirroring the legacy prop API.
interface CanvasProps {
  showLayoutEdit: boolean;
}

export function Canvas({ showLayoutEdit }: CanvasProps) {
  const { state, dispatch } = usePageBuilder();
  const { sections, selection, viewport, mode, theme } = state;
  const isEditing = mode === "edit";
  // Live swatch library — passed into the theme CSS generator so swatch-refs
  // in the theme resolve to their underlying value. The list updates when the
  // user edits a swatch, which is why the canvas reflects swatch changes
  // without a page reload.
  //
  // `drafts` are session-local, in-progress edits to saved swatches. While the
  // swatch editor is open the picker writes the live value into `drafts`; the
  // canvas re-renders against the draft-overridden values so every consumer
  // of that swatch previews the unsaved change. Cancel / close clears the
  // draft and consumers snap back.
  const { swatches, drafts } = useSwatches();

  // Compute the inline `style` object used to seed CSS variables for the
  // canvas. Live-updates as the user tweaks the Theme tab. We parse the
  // semicolon-delimited CSS declaration list into a React-friendly object.
  const themeStyle = useMemo<React.CSSProperties>(() => {
    const declarations = generateThemeCSS(theme, swatches, drafts)
      .split(";")
      .map((d) => d.trim())
      .filter(Boolean);
    const result: Record<string, string> = {};
    for (const decl of declarations) {
      const idx = decl.indexOf(":");
      if (idx === -1) continue;
      const key = decl.slice(0, idx).trim();
      const value = decl.slice(idx + 1).trim();
      result[key] = value;
    }
    return result as React.CSSProperties;
  }, [theme, swatches, drafts]);

  const [isMounted, setIsMounted] = useState(false);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);

  // Track client-side mounting to avoid DndContext hydration mismatch
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Derive legacy id-based selection for child prop drilling.
  const selectedSectionId =
    selection.kind === "section"
      ? selection.sectionId
      : selection.kind === "column"
        ? selection.sectionId
        : selection.kind === "block"
          ? selection.sectionId
          : null;
  const selectedColumnId =
    selection.kind === "column"
      ? selection.columnId
      : selection.kind === "block"
        ? selection.columnId
        : null;
  const selectedBlockId =
    selection.kind === "block" ? selection.blockId : null;

  const selectSection = useCallback(
    (id: string | null) => {
      if (id == null) {
        dispatch({ type: "clearSelection" });
        return;
      }
      dispatch({ type: "selectSection", sectionId: id });
    },
    [dispatch]
  );

  const selectColumn = useCallback(
    (id: string | null) => {
      if (id == null) {
        if (selection.kind === "column") {
          dispatch({ type: "selectSection", sectionId: selection.sectionId });
        } else if (selection.kind === "block") {
          dispatch({ type: "clearSelection" });
        }
        return;
      }
      const parent = sections.find((s) =>
        s.columns.some((c: Column) => c.id === id)
      );
      if (!parent) return;
      dispatch({ type: "selectColumn", sectionId: parent.id, columnId: id });
    },
    [dispatch, sections, selection]
  );

  const selectBlock = useCallback(
    (id: string | null) => {
      if (id == null) {
        dispatch({ type: "clearSelection" });
        return;
      }
      const loc = findBlockLocation(sections, id);
      if (!loc) return;
      dispatch({
        type: "selectBlock",
        sectionId: loc.sectionId,
        columnId: loc.columnId,
        blockId: id,
      });
    },
    [dispatch, sections]
  );

  const addBlockToColumn = useCallback(
    (sectionId: string, columnId: string, blockType: BlockType) => {
      const newBlock = createBlock(blockType);
      dispatch({
        type: "addBlock",
        sectionId,
        columnId,
        block: newBlock,
        select: true,
      });
    },
    [dispatch]
  );

  const deleteBlockFromColumn = useCallback(
    (sectionId: string, columnId: string, blockId: string) => {
      dispatch({ type: "deleteBlock", sectionId, columnId, blockId });
    },
    [dispatch]
  );

  const updateBlockContent = useCallback(
    (
      sectionId: string,
      columnId: string,
      blockId: string,
      content: Partial<BlockContent>
    ) => {
      dispatch({
        type: "updateBlock",
        sectionId,
        columnId,
        blockId,
        content,
      });
    },
    [dispatch]
  );

  const reorderBlocksInColumn = useCallback(
    (sectionId: string, columnId: string, blockIds: string[]) => {
      dispatch({ type: "reorderBlocks", sectionId, columnId, blockIds });
    },
    [dispatch]
  );

  const moveBlockUp = useCallback(
    (sectionId: string, columnId: string, blockId: string) => {
      dispatch({ type: "moveBlockUp", sectionId, columnId, blockId });
    },
    [dispatch]
  );

  const moveBlockDown = useCallback(
    (sectionId: string, columnId: string, blockId: string) => {
      dispatch({ type: "moveBlockDown", sectionId, columnId, blockId });
    },
    [dispatch]
  );

  const moveBlockToColumn = useCallback(
    (
      sectionId: string,
      columnId: string,
      blockId: string,
      direction: "left" | "right"
    ) => {
      dispatch({
        type: "moveBlockToColumn",
        sectionId,
        sourceColumnId: columnId,
        blockId,
        direction,
      });
    },
    [dispatch]
  );

  const resizeColumns = useCallback(
    (
      sectionId: string,
      leftColumnId: string,
      rightColumnId: string,
      leftWidth: string,
      rightWidth: string,
      currentViewport: ViewportSize
    ) => {
      dispatch({
        type: "resizeColumn",
        sectionId,
        leftColumnId,
        rightColumnId,
        leftWidth,
        rightWidth,
        viewport: currentViewport,
      });
    },
    [dispatch]
  );

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px movement required to start drag
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle drag start. We only need this for blocks (to drive the DragOverlay).
  // Sections render their own visual transform; no overlay needed.
  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const activeId = event.active.id as string;
      const isSection = sections.some((s: Section) => s.id === activeId);
      if (!isSection) {
        setActiveBlockId(activeId);
      }
    },
    [sections]
  );

  // Unified drag-end handler. We use ONE DndContext for both section and block
  // drags because nested DndContexts let the innermost capture all pointer
  // events for elements in its tree — when sections were inside the block
  // DndContext, dragging a section handle fired the block handler which then
  // bailed (active.id was a section, not a block), and the reorder never
  // dispatched. Classify the drag here by looking up `active.id` in the
  // sections array; if it's a section ID, dispatch reorderSections; otherwise
  // treat it as a block move/reorder.
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveBlockId(null);

      if (!over) return;

      const activeId = active.id as string;
      const overId = over.id as string;

      // Section reorder path.
      const isSection = sections.some((s: Section) => s.id === activeId);
      if (isSection) {
        if (activeId === overId) return;
        // Only dispatch when the drop target is another section (ignore drops
        // on columns/blocks that happen to be under the cursor).
        const overIsSection = sections.some((s: Section) => s.id === overId);
        if (!overIsSection) return;
        dispatch({
          type: "reorderSections",
          activeId,
          overId,
        });
        return;
      }

      // Block path — reorder within column or move between columns.
      const sourceLoc = findBlockLocation(sections, activeId);
      if (!sourceLoc) return;

      // Check if dropping on a column (empty drop zone)
      const isColumnDrop = sections.some((s: Section) =>
        s.columns.some((c: Column) => c.id === overId)
      );

      if (isColumnDrop) {
        const targetColumnId = overId;
        if (sourceLoc.columnId === targetColumnId) return;
        dispatch({
          type: "moveBlock",
          sourceColumnId: sourceLoc.columnId,
          targetColumnId,
          blockId: activeId,
        });
        return;
      }

      // Otherwise we're dropping on another block.
      const targetLoc = findBlockLocation(sections, overId);
      if (!targetLoc) return;

      if (sourceLoc.columnId === targetLoc.columnId) {
        // Reorder within the same column.
        if (sourceLoc.index === targetLoc.index) return;
        const sourceSection = sections.find(
          (s: Section) => s.id === sourceLoc.sectionId
        );
        const sourceColumn = sourceSection?.columns.find(
          (c: Column) => c.id === sourceLoc.columnId
        );
        if (!sourceColumn) return;
        const reorderedIds = arrayMove(
          sourceColumn.blocks.map((b: Block) => b.id),
          sourceLoc.index,
          targetLoc.index
        );
        dispatch({
          type: "reorderBlocks",
          sectionId: sourceLoc.sectionId,
          columnId: sourceLoc.columnId,
          blockIds: reorderedIds,
        });
      } else {
        // Cross-column move at a specific index.
        dispatch({
          type: "moveBlock",
          sourceColumnId: sourceLoc.columnId,
          targetColumnId: targetLoc.columnId,
          blockId: activeId,
          targetIndex: targetLoc.index,
        });
      }
    },
    [sections, dispatch]
  );

  // Section IDs for sortable context
  const sectionIds = sections.map((s: Section) => s.id);

  // Find the active (dragged) block for DragOverlay
  const activeBlock = useMemo(() => {
    if (!activeBlockId) return null;
    for (const section of sections) {
      for (const column of section.columns) {
        const block = column.blocks.find((b: Block) => b.id === activeBlockId);
        if (block) return block;
      }
    }
    return null;
  }, [sections, activeBlockId]);

  const viewportWidth = VIEWPORT_WIDTHS[viewport];
  const isDesktop = viewport === "desktop";
  const isMobile = viewport === "mobile";

  return (
    <div
      className={cn(
        "flex-1 overflow-auto bg-theme-tertiary",
        // Desktop renders the preview flush with the panel — no surrounding
        // padding so the canvas reads as one continuous gray surface.
        // Mobile gets a tight 16px so the device frame still floats but
        // small screens don't waste space. Tablet keeps the comfortable
        // 32px gutter.
        isDesktop ? "p-0" : isMobile ? "p-4" : "p-8"
      )}
    >
      <div
        className={cn(
          "mx-auto transition-all duration-300",
          // Tablet / mobile: keep the device-frame look — softer rounded
          // corners and a subtle drop shadow instead of a hairline border.
          // Desktop: drop the frame entirely so the preview fills the panel
          // edge-to-edge.
          isDesktop
            ? "min-h-full"
            : "min-h-full rounded-3xl shadow-xl shadow-black/20"
        )}
        style={{
          width: viewportWidth,
          maxWidth: isDesktop ? "100%" : "100%",
          // Use the `background` shorthand (NOT `background-color`) so the
          // theme bg variable can resolve to a gradient or an image URL, not
          // just a solid color. The Tailwind utility `bg-theme-primary`
          // emits `background-color: var(...)` which silently ignores
          // gradient/image values — that's why gradients weren't showing.
          background: "var(--color-bg)",
          backgroundSize: "var(--bg-size, auto)",
          backgroundPosition: "var(--bg-position, center)",
          backgroundRepeat: "var(--bg-repeat, no-repeat)",
          // Inject the live theme CSS variables so child blocks get the
          // current theme without a server round-trip.
          ...themeStyle,
        }}
      >
        <div className="p-4 space-y-4 min-h-[600px]">
          {(() => {
            const sectionList = sections.map((section: Section) => {
              const sectionProps = {
                section,
                isSelected: selectedSectionId === section.id,
                selectedColumnId,
                onClick: () => selectSection(section.id),
                viewport,
                isEditing,
                showLayoutEdit,
                selectedBlockId,
                onSelectColumn: (columnId: string) => selectColumn(columnId),
                onSelectBlock: (id: string | null) => selectBlock(id),
                onAddBlock: (columnId: string, blockType: BlockType) =>
                  addBlockToColumn(section.id, columnId, blockType),
                onDeleteBlock: (columnId: string, blockId: string) =>
                  deleteBlockFromColumn(section.id, columnId, blockId),
                onUpdateBlock: (columnId: string, blockId: string, content: Partial<BlockContent>) =>
                  updateBlockContent(section.id, columnId, blockId, content),
                onReorderBlocks: (columnId: string, blockIds: string[]) =>
                  reorderBlocksInColumn(section.id, columnId, blockIds),
                onResizeColumns: (leftId: string, rightId: string, leftW: string, rightW: string, vp: ViewportSize) =>
                  resizeColumns(section.id, leftId, rightId, leftW, rightW, vp),
                onMoveBlockUp: (columnId: string, blockId: string) =>
                  moveBlockUp(section.id, columnId, blockId),
                onMoveBlockDown: (columnId: string, blockId: string) =>
                  moveBlockDown(section.id, columnId, blockId),
                onMoveBlockToColumn: (columnId: string, blockId: string, direction: "left" | "right") =>
                  moveBlockToColumn(section.id, columnId, blockId, direction),
              };

              return isEditing && isMounted ? (
                <SortableSection key={section.id} {...sectionProps} />
              ) : (
                <SectionComponent key={section.id} {...sectionProps} />
              );
            });

            const innerContent = (
              <>
                {isEditing && isMounted ? (
                  <SortableContext items={sectionIds} strategy={verticalListSortingStrategy}>
                    {sectionList}
                  </SortableContext>
                ) : (
                  sectionList
                )}
              </>
            );

            if (!isMounted) {
              return <div className="space-y-4">{innerContent}</div>;
            }

            // Single DndContext for both sections and blocks. The unified
            // handleDragEnd classifies by inspecting `active.id` against the
            // sections array. Nested DndContexts previously caused section
            // drags to be swallowed by the inner block context.
            return (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCorners}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <div className="space-y-4">{innerContent}</div>
                <DragOverlay>
                  {activeBlock && (
                    <div className="opacity-80 rotate-2 scale-105">
                      <BlockRenderer
                        block={activeBlock}
                        isSelected={false}
                        onSelect={() => {}}
                        onDelete={() => {}}
                      />
                    </div>
                  )}
                </DragOverlay>
              </DndContext>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
