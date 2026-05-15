import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@secretlobby/ui";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import type { Block, BlockType, Column, Section } from "../state/types";
import { LAYER_COLORS, createBlock, createSection } from "../state/helpers";
import { findBlockLocation } from "../state/reducer";
import { usePageBuilder } from "../state/provider";
import {
  BLOCK_TYPES,
  CardIcon,
  ChevronDownIcon,
  DragHandleIcon,
  EyeIcon,
  EyeOffIcon,
  PlusIcon,
  TrashIcon,
} from "../icons";
import { LayerDot } from "./LayerDot";
import { SettingsOverlay } from "./SettingsOverlay";
import { ThemeOverlay } from "./ThemeOverlay";

// =============================================================================
// LeftRail
// -----------------------------------------------------------------------------
// Phase 3: the rail is now a pure sections+columns+blocks navigator. Inline
// settings panels are gone — selecting any layer mounts <SettingsOverlay/>
// inside the same aside, covering the navigator until the user goes back.
// All selection / mutation goes through usePageBuilder() context directly;
// the rail no longer takes selection callbacks as props.
//
// DnD note: there are three nested DnD scopes here — one DndContext for the
// section list, then a separate DndContext per expanded section for that
// section's columns, then a separate DndContext per expanded column for that
// column's blocks. dnd-kit is fine with arbitrarily nested DndContexts as
// long as a given draggable item lives in exactly one of them, which is the
// case here (each ID appears in only its parent's SortableContext). Sensors
// are recreated per scope from useSensors so they don't leak between scopes.
// =============================================================================

interface LeftRailProps {
  themeOverlayOpen: boolean;
  onCloseThemeOverlay: () => void;
}

// Shared confirm-delete state for "section has blocks" — surfaced from the
// LeftRail trash button. The SettingsOverlay has the same modal pattern; we
// duplicate the inline UI here so the rail can confirm without forcing the
// user to open the section settings first.
interface SectionConfirm {
  sectionId: string;
  label: string;
  blockCount: number;
}

export function LeftRail({
  themeOverlayOpen,
  onCloseThemeOverlay,
}: LeftRailProps) {
  const { state, dispatch } = usePageBuilder();
  const { sections, selection, mode } = state;
  const isPreview = mode === "preview";

  // Derive the legacy id-based selection so the row helpers below stay simple.
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

  // Track which sections are expanded; default expand the selected one.
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    () => new Set(selectedSectionId ? [selectedSectionId] : [])
  );
  const [expandedColumns, setExpandedColumns] = useState<Set<string>>(
    () => new Set(selectedColumnId ? [selectedColumnId] : [])
  );

  // "Section has blocks" confirm — surfaced by clicking the trash icon on a
  // non-empty section row. Cleared on cancel / confirm / Esc.
  const [confirmDelete, setConfirmDelete] = useState<SectionConfirm | null>(
    null
  );

  // Auto-expand parents of any newly selected item
  useEffect(() => {
    if (selectedSectionId) {
      setExpandedSections((prev) => {
        if (prev.has(selectedSectionId)) return prev;
        const next = new Set(prev);
        next.add(selectedSectionId);
        return next;
      });
    }
  }, [selectedSectionId]);

  useEffect(() => {
    if (selectedColumnId) {
      const parentSection = sections.find((s) =>
        s.columns.some((c) => c.id === selectedColumnId)
      );
      if (parentSection) {
        setExpandedSections((prev) => {
          const next = new Set(prev);
          next.add(parentSection.id);
          return next;
        });
      }
      setExpandedColumns((prev) => {
        if (prev.has(selectedColumnId)) return prev;
        const next = new Set(prev);
        next.add(selectedColumnId);
        return next;
      });
    }
  }, [selectedColumnId, sections]);

  useEffect(() => {
    if (selectedBlockId) {
      const loc = findBlockLocation(sections, selectedBlockId);
      if (loc) {
        setExpandedSections((prev) => {
          const next = new Set(prev);
          next.add(loc.sectionId);
          return next;
        });
        setExpandedColumns((prev) => {
          const next = new Set(prev);
          next.add(loc.columnId);
          return next;
        });
      }
    }
  }, [selectedBlockId, sections]);

  // Esc closes any open confirm modal.
  useEffect(() => {
    if (!confirmDelete) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setConfirmDelete(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [confirmDelete]);

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleColumn = (id: string) => {
    setExpandedColumns((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Mutations & selection — all through context dispatch.
  const onAddSection = () => {
    const newSection = createSection(1);
    dispatch({ type: "addSection", section: newSection, select: true });
  };

  const onAddBlock = (sectionId: string, columnId: string, type: BlockType) => {
    const newBlock = createBlock(type);
    dispatch({
      type: "addBlock",
      sectionId,
      columnId,
      block: newBlock,
      select: true,
    });
  };

  // ---------------------------------------------------------------------------
  // Delete handlers — section / column / block. Each fires an Undo toast that
  // restores from a snapshot taken before dispatch. Section-with-blocks routes
  // through the confirm modal first.
  // ---------------------------------------------------------------------------
  const handleDeleteSection = (section: Section, sectionIndex: number) => {
    const blockCount = section.columns.reduce(
      (n, c) => n + c.blocks.length,
      0
    );
    const label = section.name?.trim() || `Section ${sectionIndex + 1}`;
    if (blockCount === 0) {
      const snapshot = section;
      const insertAt = sectionIndex;
      dispatch({ type: "deleteSection", sectionId: section.id });
      toast.success(`${label} deleted`, {
        duration: 5000,
        action: {
          label: "Undo",
          onClick: () => {
            // Read live sections at click time so we don't clobber other edits.
            const restored = [...state.sections];
            restored.splice(
              Math.min(insertAt, restored.length),
              0,
              snapshot
            );
            dispatch({ type: "setSections", sections: restored });
          },
        },
      });
      return;
    }
    setConfirmDelete({ sectionId: section.id, label, blockCount });
  };

  const handleDeleteColumn = (
    section: Section,
    column: Column,
    columnIndex: number
  ) => {
    const label = column.name?.trim() || `Column ${columnIndex + 1}`;
    const snapshotColumns = section.columns;
    const nextColumns = section.columns.filter((c) => c.id !== column.id);
    dispatch({
      type: "updateSection",
      sectionId: section.id,
      updates: { columns: nextColumns },
    });
    // If selection was anchored to this column or one of its blocks, drop it.
    if (
      (selection.kind === "column" && selection.columnId === column.id) ||
      (selection.kind === "block" && selection.columnId === column.id)
    ) {
      dispatch({ type: "clearSelection" });
    }
    toast.success(`${label} deleted`, {
      duration: 5000,
      action: {
        label: "Undo",
        onClick: () => {
          dispatch({
            type: "updateSection",
            sectionId: section.id,
            updates: { columns: snapshotColumns },
          });
        },
      },
    });
  };

  const handleDeleteBlock = (
    section: Section,
    column: Column,
    block: Block,
    blockIndex: number
  ) => {
    const meta = BLOCK_TYPES.find((t) => t.type === block.type);
    const sameTypeIndex = column.blocks
      .filter((b) => b.type === block.type)
      .indexOf(block);
    const label =
      block.name?.trim() ||
      `${meta?.label ?? block.type} ${sameTypeIndex + 1}`;
    const snapshotBlock = block;
    const insertAt = blockIndex;
    dispatch({
      type: "deleteBlock",
      sectionId: section.id,
      columnId: column.id,
      blockId: block.id,
    });
    toast.success(`${label} deleted`, {
      duration: 5000,
      action: {
        label: "Undo",
        onClick: () => {
          dispatch({
            type: "addBlock",
            sectionId: section.id,
            columnId: column.id,
            block: snapshotBlock,
          });
          // Re-order to land at the original index. Reducer is synchronous;
          // we defer one tick so the next dispatch reads the live state.
          setTimeout(() => {
            const liveSection = state.sections.find(
              (s) => s.id === section.id
            );
            const liveColumn = liveSection?.columns.find(
              (c) => c.id === column.id
            );
            if (!liveColumn) return;
            const ids = liveColumn.blocks
              .filter((b) => b.id !== snapshotBlock.id)
              .map((b) => b.id);
            ids.splice(insertAt, 0, snapshotBlock.id);
            dispatch({
              type: "reorderBlocks",
              sectionId: section.id,
              columnId: column.id,
              blockIds: ids,
            });
          }, 0);
        },
      },
    });
  };

  // DnD sensors for sidebar section reordering. Mirrors the canvas setup
  // (PointerSensor + KeyboardSensor) but with a smaller activation distance
  // so the grip handle feels immediately responsive.
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleSectionDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    if (active.id === over.id) return;
    dispatch({
      type: "reorderSections",
      activeId: active.id as string,
      overId: over.id as string,
    });
  };

  const sectionIds = sections.map((s) => s.id);

  return (
    <aside className="relative w-[340px] flex-shrink-0 h-full bg-theme-secondary border-r border-theme flex flex-col overflow-hidden">
      {/* Sections list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragEnd={handleSectionDragEnd}
        >
          <SortableContext
            items={sectionIds}
            strategy={verticalListSortingStrategy}
          >
            {sections.map((section, sIdx) => (
              <SortableSidebarSection
                key={section.id}
                section={section}
                sectionIndex={sIdx}
                expanded={expandedSections.has(section.id)}
                expandedColumns={expandedColumns}
                selectedSectionId={selectedSectionId}
                selectedColumnId={selectedColumnId}
                selectedBlockId={selectedBlockId}
                onToggleSection={toggleSection}
                onToggleColumn={toggleColumn}
                onSelectSection={(id) =>
                  dispatch({ type: "selectSection", sectionId: id })
                }
                onSelectColumn={(sectionId, columnId) =>
                  dispatch({
                    type: "selectColumn",
                    sectionId,
                    columnId,
                  })
                }
                onSelectBlock={(sectionId, columnId, blockId) =>
                  dispatch({
                    type: "selectBlock",
                    sectionId,
                    columnId,
                    blockId,
                  })
                }
                onAddBlock={onAddBlock}
                onDeleteSection={() => handleDeleteSection(section, sIdx)}
                onDeleteColumn={(column, columnIndex) =>
                  handleDeleteColumn(section, column, columnIndex)
                }
                onDeleteBlock={(column, block, blockIndex) =>
                  handleDeleteBlock(section, column, block, blockIndex)
                }
                onToggleSectionVisibility={() =>
                  dispatch({
                    type: "setSectionVisibility",
                    sectionId: section.id,
                    hidden: !(section.hidden === true),
                  })
                }
                onToggleColumnVisibility={(columnId, hidden) =>
                  dispatch({
                    type: "setColumnVisibility",
                    sectionId: section.id,
                    columnId,
                    hidden,
                  })
                }
                onToggleBlockVisibility={(columnId, blockId, hidden) =>
                  dispatch({
                    type: "setBlockVisibility",
                    sectionId: section.id,
                    columnId,
                    blockId,
                    hidden,
                  })
                }
                onReorderColumns={(columnIds) =>
                  dispatch({
                    type: "reorderColumns",
                    sectionId: section.id,
                    columnIds,
                  })
                }
                onReorderBlocks={(columnId, blockIds) =>
                  dispatch({
                    type: "reorderBlocks",
                    sectionId: section.id,
                    columnId,
                    blockIds,
                  })
                }
              />
            ))}
          </SortableContext>
        </DndContext>

        {/* Add Section CTA — always available in edit mode */}
        <button
          type="button"
          onClick={onAddSection}
          className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 bg-violet-500/10 hover:bg-violet-500/20 border border-dashed border-violet-500/40 rounded-lg text-violet-300 text-sm transition-colors cursor-pointer"
        >
          <PlusIcon className="w-4 h-4" />
          <span>Add Section</span>
        </button>

        {sections.length === 0 && (
          <div className="text-sm text-theme-muted px-2 py-4 text-center">
            No sections yet. Click &ldquo;Add Section&rdquo; to start.
          </div>
        )}
      </div>

      {/* Settings overlay — slides in over the navigator when something is
          selected. Positioned absolute inside the rail aside. Phase 4: do not
          mount in preview mode (selection state is preserved). */}
      {!isPreview && selection.kind !== "none" && (
        <SettingsOverlay sections={sections as Section[]} />
      )}

      {/* Theme overlay — triggered by the paint brush button in TopHeader.
          Sits at the same z-layer as SettingsOverlay; the parent state machine
          guarantees only one is open at a time (opening the theme overlay
          clears selection, and selecting anything closes the theme overlay). */}
      {!isPreview && themeOverlayOpen && (
        <ThemeOverlay onClose={onCloseThemeOverlay} />
      )}

      {/* Confirm modal for non-empty section deletion (mirrors SettingsOverlay
          pattern but lifted up so the trash icon in the rail can fire it). */}
      {confirmDelete && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/60"
          role="dialog"
          aria-modal="true"
          aria-label="Confirm delete"
          onClick={() => setConfirmDelete(null)}
        >
          <div
            className="m-4 w-full max-w-sm bg-theme-primary border border-theme rounded-lg shadow-2xl p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-theme-primary">
              Delete {confirmDelete.label}?
            </h3>
            <p className="text-sm text-theme-secondary">
              This section contains {confirmDelete.blockCount} block
              {confirmDelete.blockCount === 1 ? "" : "s"}. This can&rsquo;t be
              undone.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="px-3 py-1.5 text-sm rounded-lg border border-theme text-theme-secondary hover:bg-theme-tertiary cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  dispatch({
                    type: "deleteSection",
                    sectionId: confirmDelete.sectionId,
                  });
                  toast.success(`${confirmDelete.label} deleted`);
                  setConfirmDelete(null);
                }}
                className="px-3 py-1.5 text-sm rounded-lg bg-red-500 hover:bg-red-600 text-white cursor-pointer"
              >
                Delete section
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

// ---------------------------------------------------------------------------
// RowActions — trash + eye icons rendered on hover on the trailing edge of
// every row. Hidden by default; `group-hover:opacity-100` brings them in.
// `e.stopPropagation()` on click so selecting the row doesn't piggyback on
// the trash/eye click. Sized to match `LayerDot` density.
// ---------------------------------------------------------------------------
interface RowActionsProps {
  hidden: boolean;
  onToggleHidden: () => void;
  onDelete: () => void;
  visibilityLabel: string;
  deleteLabel: string;
}

function RowActions({
  hidden,
  onToggleHidden,
  onDelete,
  visibilityLabel,
  deleteLabel,
}: RowActionsProps) {
  return (
    <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
      <button
        type="button"
        aria-label={visibilityLabel}
        title={visibilityLabel}
        onClick={(e) => {
          e.stopPropagation();
          onToggleHidden();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className="p-0.5 rounded text-theme-secondary hover:text-theme-primary cursor-pointer"
      >
        {hidden ? (
          <EyeOffIcon className="w-4 h-4" />
        ) : (
          <EyeIcon className="w-4 h-4" />
        )}
      </button>
      <button
        type="button"
        aria-label={deleteLabel}
        title={deleteLabel}
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className="p-0.5 rounded text-theme-secondary hover:text-red-400 cursor-pointer"
      >
        <TrashIcon />
      </button>
    </div>
  );
}

// Sortable wrapper for sidebar section rows. Drag handle is a separate small
// grip button at the leading edge of the row so dragging never fires the
// row-level selection click. The outer wrapper carries the sortable transform
// + ref so dnd-kit can animate the row into its new position.
interface SortableSidebarSectionProps {
  section: Section;
  sectionIndex: number;
  expanded: boolean;
  expandedColumns: Set<string>;
  selectedSectionId: string | null;
  selectedColumnId: string | null;
  selectedBlockId: string | null;
  onToggleSection: (id: string) => void;
  onToggleColumn: (id: string) => void;
  onSelectSection: (id: string) => void;
  onSelectColumn: (sectionId: string, columnId: string) => void;
  onSelectBlock: (sectionId: string, columnId: string, blockId: string) => void;
  onAddBlock: (sectionId: string, columnId: string, type: BlockType) => void;
  onDeleteSection: () => void;
  onDeleteColumn: (column: Column, columnIndex: number) => void;
  onDeleteBlock: (column: Column, block: Block, blockIndex: number) => void;
  onToggleSectionVisibility: () => void;
  onToggleColumnVisibility: (columnId: string, hidden: boolean) => void;
  onToggleBlockVisibility: (
    columnId: string,
    blockId: string,
    hidden: boolean
  ) => void;
  onReorderColumns: (columnIds: string[]) => void;
  onReorderBlocks: (columnId: string, blockIds: string[]) => void;
}

function SortableSidebarSection({
  section,
  sectionIndex,
  expanded,
  expandedColumns,
  selectedSectionId,
  selectedColumnId,
  selectedBlockId,
  onToggleSection,
  onToggleColumn,
  onSelectSection,
  onSelectColumn,
  onSelectBlock,
  onAddBlock,
  onDeleteSection,
  onDeleteColumn,
  onDeleteBlock,
  onToggleSectionVisibility,
  onToggleColumnVisibility,
  onToggleBlockVisibility,
  onReorderColumns,
  onReorderBlocks,
}: SortableSidebarSectionProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id });

  // Separate DnD sensors for the per-section column-list DndContext. Same
  // shape as the parent rail sensors; recreated per section so each scope has
  // its own pointer/keyboard tracking.
  const columnSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleColumnDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = section.columns.map((c) => c.id);
    const oldIndex = ids.indexOf(active.id as string);
    const newIndex = ids.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;
    onReorderColumns(arrayMove(ids, oldIndex, newIndex));
  };

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 30 : undefined,
    opacity: isDragging ? 0.85 : 1,
  };

  const sectionSelected =
    selectedSectionId === section.id &&
    !selectedColumnId &&
    !selectedBlockId;
  const sectionColors = LAYER_COLORS.section;
  const defaultName = `Section ${sectionIndex + 1}`;
  const sectionHidden = section.hidden === true;
  const columnIds = section.columns.map((c) => c.id);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-lg overflow-hidden"
    >
      {/* Section header. `group` so the trailing trash/eye icons fade in on
          hover. Clicking anywhere on the body selects the section — renaming
          happens through the SettingsOverlay's inline rename field, not in
          the rail (per column-row pattern). */}
      <div
        className={cn(
          "group flex items-center gap-1 px-2 py-2 rounded-lg border-l-2 transition-colors cursor-pointer",
          sectionSelected
            ? cn(sectionColors.bgSelected, "border-violet-400")
            : cn(
                sectionColors.bg,
                "border-violet-500/40 hover:bg-violet-500/20"
              )
        )}
        onClick={() => onSelectSection(section.id)}
      >
        {/* Drag handle — listeners attached here so click-to-select on the row
            still works. Pointer activation distance (4px) is set on the
            DndContext sensor. */}
        <button
          type="button"
          aria-label="Drag to reorder section"
          title="Drag to reorder"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "p-0.5 rounded text-theme-secondary hover:text-theme-primary flex-shrink-0 cursor-grab active:cursor-grabbing touch-none",
            isDragging && "cursor-grabbing"
          )}
          {...attributes}
          {...listeners}
        >
          <DragHandleIcon />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleSection(section.id);
          }}
          className="p-0.5 rounded text-theme-secondary hover:text-theme-primary cursor-pointer flex-shrink-0"
          title={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? (
            <ChevronDownIcon />
          ) : (
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8.25 4.5l7.5 7.5-7.5 7.5"
              />
            </svg>
          )}
        </button>
        <LayerDot tone="section" />
        <span
          className={cn(
            "flex-1 text-sm text-violet-200 truncate",
            sectionHidden && "line-through opacity-60"
          )}
        >
          {section.name?.trim() || defaultName}
        </span>
        <RowActions
          hidden={sectionHidden}
          onToggleHidden={onToggleSectionVisibility}
          onDelete={onDeleteSection}
          visibilityLabel={
            sectionHidden ? "Show section" : "Hide section"
          }
          deleteLabel="Delete section"
        />
      </div>

      {/* Columns */}
      {expanded && (
        <div className="mt-1 ml-4 pl-2 border-l border-violet-500/30 space-y-1">
          <DndContext
            sensors={columnSensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            onDragEnd={handleColumnDragEnd}
          >
            <SortableContext
              items={columnIds}
              strategy={verticalListSortingStrategy}
            >
              {section.columns.map((column, cIdx) => (
                <SortableSidebarColumn
                  key={column.id}
                  section={section}
                  column={column}
                  columnIndex={cIdx}
                  expanded={expandedColumns.has(column.id)}
                  selectedColumnId={selectedColumnId}
                  selectedBlockId={selectedBlockId}
                  onToggleColumn={onToggleColumn}
                  onSelectColumn={onSelectColumn}
                  onSelectBlock={onSelectBlock}
                  onAddBlock={onAddBlock}
                  onDeleteColumn={() => onDeleteColumn(column, cIdx)}
                  onDeleteBlock={(block, blockIndex) =>
                    onDeleteBlock(column, block, blockIndex)
                  }
                  onToggleColumnVisibility={() =>
                    onToggleColumnVisibility(
                      column.id,
                      !(column.hidden === true)
                    )
                  }
                  onToggleBlockVisibility={(blockId, hidden) =>
                    onToggleBlockVisibility(column.id, blockId, hidden)
                  }
                  onReorderBlocks={(blockIds) =>
                    onReorderBlocks(column.id, blockIds)
                  }
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SortableSidebarColumn — column row inside its parent section's DndContext.
// Mirrors SortableSidebarSection: a drag-handle button on the leading edge
// owns the dnd listeners, the rest of the row is click-to-select. Has its
// own per-column DndContext for the blocks inside.
// ---------------------------------------------------------------------------
interface SortableSidebarColumnProps {
  section: Section;
  column: Column;
  columnIndex: number;
  expanded: boolean;
  selectedColumnId: string | null;
  selectedBlockId: string | null;
  onToggleColumn: (id: string) => void;
  onSelectColumn: (sectionId: string, columnId: string) => void;
  onSelectBlock: (sectionId: string, columnId: string, blockId: string) => void;
  onAddBlock: (sectionId: string, columnId: string, type: BlockType) => void;
  onDeleteColumn: () => void;
  onDeleteBlock: (block: Block, blockIndex: number) => void;
  onToggleColumnVisibility: () => void;
  onToggleBlockVisibility: (blockId: string, hidden: boolean) => void;
  onReorderBlocks: (blockIds: string[]) => void;
}

function SortableSidebarColumn({
  section,
  column,
  columnIndex,
  expanded,
  selectedColumnId,
  selectedBlockId,
  onToggleColumn,
  onSelectColumn,
  onSelectBlock,
  onAddBlock,
  onDeleteColumn,
  onDeleteBlock,
  onToggleColumnVisibility,
  onToggleBlockVisibility,
  onReorderBlocks,
}: SortableSidebarColumnProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.id });

  const blockSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleBlockDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = column.blocks.map((b) => b.id);
    const oldIndex = ids.indexOf(active.id as string);
    const newIndex = ids.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;
    onReorderBlocks(arrayMove(ids, oldIndex, newIndex));
  };

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 30 : undefined,
    opacity: isDragging ? 0.85 : 1,
  };

  const columnColors = LAYER_COLORS.column;
  const colSelected = selectedColumnId === column.id;
  const defaultColName = `Column ${columnIndex + 1}`;
  const columnHidden = column.hidden === true;
  const blockIds = column.blocks.map((b) => b.id);

  return (
    <div ref={setNodeRef} style={style}>
      <div
        className={cn(
          "group flex items-center gap-1 px-2 py-1.5 rounded-lg border-l-2 transition-colors cursor-pointer",
          colSelected
            ? cn(columnColors.bgSelected, "border-indigo-400")
            : cn(
                columnColors.bg,
                "border-indigo-500/30 hover:bg-indigo-500/15"
              )
        )}
        onClick={() => onSelectColumn(section.id, column.id)}
      >
        <button
          type="button"
          aria-label="Drag to reorder column"
          title="Drag to reorder"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "p-0.5 rounded text-theme-secondary hover:text-theme-primary flex-shrink-0 cursor-grab active:cursor-grabbing touch-none",
            isDragging && "cursor-grabbing"
          )}
          {...attributes}
          {...listeners}
        >
          <DragHandleIcon />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleColumn(column.id);
          }}
          className="p-0.5 rounded text-theme-secondary hover:text-theme-primary cursor-pointer flex-shrink-0"
          title={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? (
            <ChevronDownIcon />
          ) : (
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8.25 4.5l7.5 7.5-7.5 7.5"
              />
            </svg>
          )}
        </button>
        <LayerDot tone="column" />
        <span
          className={cn(
            "flex-1 text-sm text-indigo-200 truncate",
            columnHidden && "line-through opacity-60"
          )}
        >
          {column.name?.trim() || defaultColName}
        </span>
        <RowActions
          hidden={columnHidden}
          onToggleHidden={onToggleColumnVisibility}
          onDelete={onDeleteColumn}
          visibilityLabel={columnHidden ? "Show column" : "Hide column"}
          deleteLabel="Delete column"
        />
      </div>

      {/* Blocks inside column */}
      {expanded && (
        <div className="mt-1 ml-4 pl-2 border-l border-indigo-500/30 space-y-1">
          <DndContext
            sensors={blockSensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            onDragEnd={handleBlockDragEnd}
          >
            <SortableContext
              items={blockIds}
              strategy={verticalListSortingStrategy}
            >
              {column.blocks.map((block, blockIndex) => (
                <SortableSidebarBlock
                  key={block.id}
                  section={section}
                  column={column}
                  block={block}
                  blockIndex={blockIndex}
                  selectedBlockId={selectedBlockId}
                  onSelectBlock={onSelectBlock}
                  onDeleteBlock={onDeleteBlock}
                  onToggleBlockVisibility={onToggleBlockVisibility}
                />
              ))}
            </SortableContext>
          </DndContext>
          {/* Add block always available in edit mode */}
          <SidebarAddBlockMenu
            onAdd={(type) => onAddBlock(section.id, column.id, type)}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SortableSidebarBlock — block row inside its parent column's DndContext.
// Smallest of the three; no nested DnD scope to manage.
// ---------------------------------------------------------------------------
interface SortableSidebarBlockProps {
  section: Section;
  column: Column;
  block: Block;
  blockIndex: number;
  selectedBlockId: string | null;
  onSelectBlock: (sectionId: string, columnId: string, blockId: string) => void;
  onDeleteBlock: (block: Block, blockIndex: number) => void;
  onToggleBlockVisibility: (blockId: string, hidden: boolean) => void;
}

function SortableSidebarBlock({
  section,
  column,
  block,
  blockIndex,
  selectedBlockId,
  onSelectBlock,
  onDeleteBlock,
  onToggleBlockVisibility,
}: SortableSidebarBlockProps) {
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
    zIndex: isDragging ? 30 : undefined,
    opacity: isDragging ? 0.85 : 1,
  };

  const blockSelected = selectedBlockId === block.id;
  const meta = BLOCK_TYPES.find((t) => t.type === block.type);
  const Icon = meta?.icon || CardIcon;
  const sameTypeIndex = column.blocks
    .filter((b) => b.type === block.type)
    .indexOf(block);
  const defaultBlockName = `${meta?.label || block.type} ${sameTypeIndex + 1}`;
  const blockHidden = block.hidden === true;

  return (
    <div ref={setNodeRef} style={style}>
      <div
        className={cn(
          "group flex items-center gap-1 px-2 py-1.5 rounded-lg border-l-2 transition-colors cursor-pointer",
          blockSelected
            ? "bg-[var(--color-brand-red-muted)] border-[var(--color-brand-red)]"
            : "bg-[var(--color-brand-red-muted)]/40 border-[var(--color-brand-red)]/30 hover:bg-[var(--color-brand-red-muted)]/70"
        )}
        onClick={() => onSelectBlock(section.id, column.id, block.id)}
      >
        <button
          type="button"
          aria-label="Drag to reorder block"
          title="Drag to reorder"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "p-0.5 rounded text-theme-secondary hover:text-theme-primary flex-shrink-0 cursor-grab active:cursor-grabbing touch-none",
            isDragging && "cursor-grabbing"
          )}
          {...attributes}
          {...listeners}
        >
          <DragHandleIcon />
        </button>
        <LayerDot tone="block" />
        <Icon className="w-3.5 h-3.5 text-[var(--color-brand-red)]" />
        <span
          className={cn(
            "flex-1 text-sm text-theme-primary truncate",
            blockHidden && "line-through opacity-60"
          )}
        >
          {block.name?.trim() || defaultBlockName}
        </span>
        <RowActions
          hidden={blockHidden}
          onToggleHidden={() =>
            onToggleBlockVisibility(block.id, !blockHidden)
          }
          onDelete={() => onDeleteBlock(block, blockIndex)}
          visibilityLabel={blockHidden ? "Show block" : "Hide block"}
          deleteLabel="Delete block"
        />
      </div>
    </div>
  );
}

// Small inline "Add block" dropdown used inside the column entry of the rail.
// Kept local to LeftRail — it's a different UX (click-outside aware, vertical
// list) from the column-level AddBlockMenu used on the canvas.
function SidebarAddBlockMenu({ onAdd }: { onAdd: (type: BlockType) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="w-full flex items-center justify-center gap-1 px-2 py-1.5 border border-dashed border-[var(--color-brand-red)]/30 rounded-lg text-xs text-theme-muted hover:text-[var(--color-brand-red)] hover:border-[var(--color-brand-red)]/60 transition-colors cursor-pointer"
      >
        <PlusIcon className="w-3.5 h-3.5" />
        <span>Add Block</span>
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-theme-secondary border border-theme rounded-lg shadow-xl p-1 space-y-0.5">
          {BLOCK_TYPES.map(({ type, label, icon: Icon }) => (
            <button
              key={type}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAdd(type);
                setOpen(false);
              }}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-theme-tertiary text-theme-secondary hover:text-theme-primary text-left text-xs cursor-pointer"
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
