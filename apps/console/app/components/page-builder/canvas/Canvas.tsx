import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@secretlobby/ui";
import {
  BlockView,
  LogoutButton,
  SectionView,
  SecretLobbyFooter,
} from "@secretlobby/lobby-template";
import {
  generateThemeCSSVars,
  type ThemeSettings as TemplateThemeSettings,
} from "~/lib/theme";
import { useSwatches } from "../PageBuilderRoot";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  EditorAwareKeyboardSensor,
  EditorAwarePointerSensor,
} from "./EditorAwareSensors";
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
  PlayerBlockContent,
  Section,
  ViewportSize,
} from "../state/types";
import { PlayerBlock } from "./blocks/PlayerBlock";
import { createBlock, VIEWPORT_WIDTHS } from "../state/helpers";
import { findBlockLocation } from "../state/reducer";
import { usePageBuilder } from "../state/provider";
import { BlockRenderer } from "./BlockRenderer";
import { LoginPagePreview } from "./LoginPagePreview";
import { SectionComponent } from "./SectionComponent";
import { SortableSection } from "./SortableSection";

// Top-level canvas: viewport-scaled frame, DnD providers (sections + blocks),
// and the section list. Children consume page-builder context indirectly via
// the callback props produced here, mirroring the legacy prop API.
interface CanvasProps {
  showLayoutEdit: boolean;
  /** True when the lobby being edited has a password set. Drives the
   *  Logout-button preview rendered at the top-right of the lobby
   *  canvas — the same button the published lobby paints. */
  hasPassword: boolean;
  /** Forwarded to the LogoutButton's real-mode <Form>. The editor only
   *  renders the button in preview mode (no CSRF needed), but the prop
   *  exists for symmetry with the lobby render path. */
  csrfToken: string;
}

export function Canvas({ showLayoutEdit, hasPassword, csrfToken }: CanvasProps) {
  const { state } = usePageBuilder();
  // Login-page template branch: short-circuit before any DndContext or
  // section-list machinery mounts. We delegate to LobbyCanvas (everything
  // below) for the main lobby page so React's hook-order rule stays
  // satisfied — LobbyCanvas owns all the section/block hooks.
  if (state.pageKind === "login") {
    return <LoginPagePreview />;
  }
  return (
    <LobbyCanvas
      showLayoutEdit={showLayoutEdit}
      hasPassword={hasPassword}
      csrfToken={csrfToken}
    />
  );
}

function LobbyCanvas({ showLayoutEdit, hasPassword }: CanvasProps) {
  const { state, dispatch } = usePageBuilder();
  const { sections, selection, viewport, mode, theme, socialLinks } = state;
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
  // canvas. Live-updates as the user tweaks the Theme tab. The lobby renders
  // through the same helper so the editor preview and the published lobby
  // emit identical var sets.
  const themeStyle = useMemo<React.CSSProperties>(
    () => generateThemeCSSVars(theme, swatches, drafts) as React.CSSProperties,
    [theme, swatches, drafts]
  );

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
    (
      sectionId: string,
      columnId: string,
      blockType: BlockType,
      atIndex?: number
    ) => {
      const newBlock = createBlock(blockType);
      // Reducer handles atIndex directly — no more setTimeout reorder. This
      // keeps the auto-appended trailing paragraph adjacent to the new block
      // even for mid-column inserts.
      dispatch({
        type: "addBlock",
        sectionId,
        columnId,
        block: newBlock,
        atIndex,
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

  // In-place block-type swap. Routed through `replaceBlock` so the block.id
  // is preserved (selection + React keys survive). Auto-appends a trailing
  // empty paragraph when `newType` isn't already a paragraph — see the
  // reducer for the exact rule.
  const replaceBlockInColumn = useCallback(
    (
      sectionId: string,
      columnId: string,
      blockId: string,
      newType: BlockType
    ) => {
      dispatch({ type: "replaceBlock", sectionId, columnId, blockId, newType });
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

  // v3: grid track resize. The handle dispatches a full new
  // `grid-template-columns` string for the active viewport rather than
  // per-column widths — `SectionComponent` owns the fr-token math.
  const resizeGridTemplate = useCallback(
    (
      sectionId: string,
      template: string,
      currentViewport: "desktop" | "tablet"
    ) => {
      dispatch({
        type: "resizeGridTemplate",
        sectionId,
        template,
        viewport: currentViewport,
      });
    },
    [dispatch]
  );

  // DnD sensors. The editor-aware variants ignore events that originate inside
  // any editor wrapper marked with `data-no-dnd-keyboard="true"`. That stops
  // per-block Tiptap editors from accidentally triggering a keyboard drag
  // when the user types space, and stops pointer events on their toolbars /
  // buttons from being interpreted as drag starts.
  const sensors = useSensors(
    useSensor(EditorAwarePointerSensor, {
      activationConstraint: {
        distance: 8, // 8px movement required to start drag
      },
    }),
    useSensor(EditorAwareKeyboardSensor, {
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

  // Custom collision detection: prefer ANY droppable the pointer is currently
  // inside, and only fall back to `closestCorners` when the pointer is outside
  // every droppable. `closestCorners` alone has a sharp failure mode for empty
  // columns — their wrapper rect is small and content-less, so blocks in
  // adjacent (non-empty) columns end up with corners closer to the dragged
  // item, and the empty column never wins the drop target. `pointerWithin`
  // honours the cursor strictly, which is what users expect when they hover
  // over an empty column to drop into it.
  const collisionDetectionStrategy: CollisionDetection = useCallback(
    (args) => {
      const pointerCollisions = pointerWithin(args);
      if (pointerCollisions.length > 0) return pointerCollisions;
      return closestCorners(args);
    },
    []
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
  const isPreview = mode === "preview";

  // Render the full section list. Two render paths:
  //
  //   - Preview mode: route through `<SectionView>` + `<BlockView>` from the
  //     shared `@secretlobby/lobby-template` package — the exact same
  //     pipeline the published lobby renders through. This is the single
  //     source of truth for "what does a designed lobby look like": both
  //     the preview canvas here and the lobby's `_index.tsx` walk the same
  //     code path, so any DOM/styling divergence is impossible by
  //     construction.
  //
  //   - Edit mode: route through the editor's own `<SectionComponent>` /
  //     `<SortableSection>` tree, which adds selection chrome, drag/drop,
  //     slash menu, resize handles, and live inline editors. That tree
  //     wraps each block in the editor's `BlockRenderer`, which mounts
  //     the per-block editor (e.g. `HeadingBlock` with a Tiptap
  //     `InlineEditor` instead of the static `HeadingView`).
  //
  // Player blocks in preview need real audio + the playlists context, so
  // we route them back through the editor's `<PlayerBlock>` via
  // `<BlockView>`'s `renderFallback` hook — same bridge the lobby uses for
  // its `renderPlayer`.
  const sectionsContent = (() => {
    if (isPreview) {
      return (
        <div className="space-y-4">
          {sections.map((section: Section) => (
            <SectionView
              key={section.id}
              section={section}
              renderBlock={(block) => (
                <BlockView
                  block={block}
                  theme={theme as unknown as TemplateThemeSettings}
                  socialLinks={socialLinks}
                  renderFallback={(b) =>
                    b.type === "player" ? (
                      <PlayerBlock
                        content={b.content as PlayerBlockContent}
                        theme={theme}
                      />
                    ) : null
                  }
                />
              )}
            />
          ))}
        </div>
      );
    }

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
        onAddBlock: (
          columnId: string,
          blockType: BlockType,
          atIndex?: number
        ) => addBlockToColumn(section.id, columnId, blockType, atIndex),
        onDeleteBlock: (columnId: string, blockId: string) =>
          deleteBlockFromColumn(section.id, columnId, blockId),
        onUpdateBlock: (
          columnId: string,
          blockId: string,
          content: Partial<BlockContent>
        ) => updateBlockContent(section.id, columnId, blockId, content),
        onReorderBlocks: (columnId: string, blockIds: string[]) =>
          reorderBlocksInColumn(section.id, columnId, blockIds),
        onResizeGridTemplate: (template: string, vp: "desktop" | "tablet") =>
          resizeGridTemplate(section.id, template, vp),
        onMoveBlockUp: (columnId: string, blockId: string) =>
          moveBlockUp(section.id, columnId, blockId),
        onMoveBlockDown: (columnId: string, blockId: string) =>
          moveBlockDown(section.id, columnId, blockId),
        onMoveBlockToColumn: (
          columnId: string,
          blockId: string,
          direction: "left" | "right"
        ) => moveBlockToColumn(section.id, columnId, blockId, direction),
        onReplaceBlock: (
          columnId: string,
          blockId: string,
          newType: BlockType
        ) => replaceBlockInColumn(section.id, columnId, blockId, newType),
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
          <SortableContext
            items={sectionIds}
            strategy={verticalListSortingStrategy}
          >
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
        id="page-builder-canvas"
        sensors={sensors}
        collisionDetection={collisionDetectionStrategy}
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
                isEditing={false}
              />
            </div>
          )}
        </DragOverlay>
      </DndContext>
    );
  })();

  // Background + theme-var declarations shared by both modes. Pulled out so
  // the preview branch can apply them to the FULL-WIDTH wrapper (background
  // fills the panel) while the content sits in a narrower centered child,
  // and the edit branch keeps applying them to the viewport-sized frame.
  const themedSurfaceStyle: React.CSSProperties = {
    background: "var(--color-bg)",
    backgroundSize: "var(--bg-size, auto)",
    backgroundPosition: "var(--bg-position, center)",
    backgroundRepeat: "var(--bg-repeat, no-repeat)",
    backgroundAttachment: "var(--bg-attachment, scroll)",
    // Global base font-size emitted by generateThemeCSS — every text block
    // inside the canvas inherits this unless it sets a per-block override
    // (e.g. ParagraphBlockContent.fontSize).
    fontSize: "var(--text-base-size, 16px)",
    // Inject the live theme CSS variables so child blocks get the current
    // theme without a server round-trip.
    ...themeStyle,
  };

  if (isPreview) {
    // Preview behaves differently by viewport.
    //
    // Desktop preview — the lobby's "final" look on a wide screen:
    //   outer panel (bg-theme-tertiary, console chrome)
    //     full-width themed wrapper (lobby bg + theme vars fill the panel
    //     edge-to-edge, regardless of how narrow the content column is)
    //       centered content column — capped at 1152px (the lobby's
    //       intended content width) with 16px horizontal padding so it
    //       doesn't kiss the background edge.
    //
    // Tablet / mobile preview — device-frame emulation, identical chrome to
    // edit mode at those viewports: the bg-theme-tertiary panel acts as the
    // "around the device" surround, the themed wrapper is a rounded card
    // pinned to the viewport width, and the lobby background lives strictly
    // inside that card so it visually represents the device screen.
    if (viewport === "desktop") {
      return (
        <div className="flex-1 overflow-auto bg-theme-tertiary p-0">
          <div className="min-h-full w-full" style={themedSurfaceStyle}>
            <div className="mx-auto w-full px-4 transition-[max-width] duration-300" style={{ maxWidth: 1152 }}>
              <div className="py-4 space-y-4 min-h-[600px]">
                {/* Logout button preview — part of the lobby PAGE, not the
                    editor. Renders at the top-right of the lobby content
                    area so the canvas matches what the published lobby
                    paints. Styling comes entirely from the theme's button
                    CSS vars (`--btn-bg` / `--btn-text` / etc.), so the
                    button tracks every edit in the global Buttons theme
                    section. */}
                {hasPassword && (
                  <div className="flex justify-end">
                    <LogoutButton preview csrfToken={null} />
                  </div>
                )}
                {sectionsContent}
              </div>
            </div>
            <SecretLobbyFooter />
          </div>
        </div>
      );
    }
    return (
      <div
        className={cn(
          "flex-1 overflow-auto bg-theme-tertiary",
          isMobile ? "p-4" : "p-8"
        )}
      >
        <div
          className="mx-auto min-h-full rounded-3xl shadow-xl shadow-black/20 transition-all duration-300"
          style={{
            width: viewportWidth,
            maxWidth: "100%",
            ...themedSurfaceStyle,
          }}
        >
          <div className="p-4 space-y-4 min-h-[600px]">
            {hasPassword && (
              <div className="flex justify-end">
                <LogoutButton preview csrfToken={null} />
              </div>
            )}
            {sectionsContent}
          </div>
          <SecretLobbyFooter />
        </div>
      </div>
    );
  }

  // Click-outside-to-deselect. BlockRenderer's wrapper calls
  // e.stopPropagation() on every block click, so any click that bubbles up
  // to the canvas root happened outside a block — clear the active
  // selection so the block outline/toolbar disappear.
  //
  // Sections and columns also stopPropagation on their own onClick (when
  // `showLayoutEdit` is on), so clicking them still routes to the right
  // selection. With layout-edit off they have no onClick, and clicks on the
  // section background fall through here, which matches user expectation:
  // clicking the page background deselects the current block.
  const handleCanvasClick = isEditing
    ? () => {
        if (selection.kind !== "none") {
          dispatch({ type: "clearSelection" });
        }
      }
    : undefined;

  return (
    <div
      onClick={handleCanvasClick}
      className={cn(
        "flex-1 overflow-auto bg-theme-tertiary",
        // Edit-mode gutter depends on the viewport: desktop flush; mobile
        // gets a tight 16px so the device frame still floats; tablet keeps
        // the comfortable 32px gutter.
        isDesktop ? "p-0" : isMobile ? "p-4" : "p-8"
      )}
    >
      <div
        className={cn(
          "mx-auto transition-all duration-300",
          // Tablet / mobile viewports keep the device-frame styling.
          isDesktop
            ? "min-h-full"
            : "min-h-full rounded-3xl shadow-xl shadow-black/20"
        )}
        style={{
          width: viewportWidth,
          maxWidth: "100%",
          ...themedSurfaceStyle,
        }}
      >
        <div className="p-4 space-y-4 min-h-[600px]">
          {hasPassword && (
            <div className="flex justify-end">
              <LogoutButton preview csrfToken={null} />
            </div>
          )}
          {sectionsContent}
        </div>
        <SecretLobbyFooter />
      </div>
    </div>
  );
}
