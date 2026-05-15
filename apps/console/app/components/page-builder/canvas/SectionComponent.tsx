import { useMemo, useRef } from "react";
import { cn } from "@secretlobby/ui";
import type {
  BlockContent,
  BlockType,
  Column,
  Section,
  ViewportSize,
} from "../state/types";
import {
  normalizePercents,
  parseGapValue,
  parseWidthToPercent,
} from "../state/helpers";
import { ColumnComponent } from "./ColumnComponent";
import { ResizeHandle } from "./ResizeHandle";

export interface SectionComponentProps {
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
  onAddBlock: (columnId: string, blockType: BlockType) => void;
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

export function SectionComponent({
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
}: SectionComponentProps) {
  // Section/column visuals are layout-level affordances. Hidden when the
  // dashed-square toggle in TopHeader is off — blocks remain editable, the
  // canvas just stops showing section/column scaffolding.
  const showSectionUi = isEditing && showLayoutEdit;
  // Visibility plumbing: in preview mode skip hidden nodes entirely; in edit
  // mode keep them visible but dim them so the user can still find + toggle.
  const sectionHidden = section.hidden === true;
  if (sectionHidden && !isEditing) return null;
  const isMobile = viewport === "mobile";
  const isTablet = viewport === "tablet";
  const columnCount = section.columns.length;
  const containerRef = useRef<HTMLDivElement>(null);

  // Get the width for current viewport (tablet uses tabletWidth if set, otherwise falls back to width)
  const getColumnWidth = (col: Column): string => {
    if (isTablet && col.tabletWidth) return col.tabletWidth;
    return col.width;
  };

  // Parse column percentages for current viewport
  const columnPercents = useMemo(() => {
    const rawPercents = section.columns.map((col) => parseWidthToPercent(getColumnWidth(col), columnCount));
    return normalizePercents(rawPercents);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section.columns, columnCount, viewport]);

  // Simple resize handler
  const handleResize = (index: number, deltaPercent: number) => {
    if (!onResizeColumns) return;

    const minWidth = 10;
    let newLeft = Math.max(minWidth, columnPercents[index] + deltaPercent);
    let newRight = Math.max(minWidth, columnPercents[index + 1] - deltaPercent);

    // Normalize to ensure they sum correctly
    const total = newLeft + newRight;
    const targetTotal = columnPercents[index] + columnPercents[index + 1];
    newLeft = (newLeft / total) * targetTotal;
    newRight = (newRight / total) * targetTotal;

    onResizeColumns(
      section.columns[index].id,
      section.columns[index + 1].id,
      `${Math.round(newLeft * 10) / 10}%`,
      `${Math.round(newRight * 10) / 10}%`,
      viewport
    );
  };

  const isMobileView = isMobile;
  const isSlider = section.mobileLayout === "slider" && isMobileView;
  // Resize handles render any time we are in edit mode and have 2+ columns
  // on a non-mobile/non-slider layout. This drops the previous gating on
  // section selection / `layoutEditMode` toggle.
  const showResizeHandles =
    showSectionUi && columnCount > 1 && !isMobileView && !isSlider;
  const gapValue = parseGapValue(section.columnGap);

  // For mobile stacking
  let displayMode: "grid" | "flex" | "stack" = "grid";
  if (isMobileView) {
    if (section.mobileLayout === "stack") {
      displayMode = "stack";
    } else if (isSlider) {
      displayMode = "flex";
    }
  }

  // Helper to get CSS width with gap compensation
  // Formula: width% - (gap * (columns-1) / columns)
  const getColumnCssWidth = (width: string): string => {
    if (columnCount === 1 || displayMode === "stack") return width;
    const gapMultiplier = (columnCount - 1) / columnCount;
    return `calc(${width} - ${gapValue} * ${gapMultiplier.toFixed(4)})`;
  };

  return (
    <div
      ref={containerRef}
      data-section-container
      onClick={
        showSectionUi
          ? (e) => {
              e.stopPropagation();
              onClick();
            }
          : undefined
      }
      className={cn(
        "relative rounded-lg transition-all p-4",
        showSectionUi && "cursor-pointer",
        isSelected && showSectionUi
          ? "border-2 border-violet-400 bg-violet-500/10"
          : showSectionUi
            ? "border-2 border-dashed border-violet-500/30 hover:border-violet-400/60 hover:bg-violet-500/5"
            : "border-2 border-transparent",
        sectionHidden && "opacity-40"
      )}
      title={
        sectionHidden
          ? "Hidden — toggle the eye in the sidebar to show"
          : undefined
      }
      style={{ "--section-gap": gapValue } as React.CSSProperties}
    >
      {/* Column layout using flexbox for better control of gaps and resize handles */}
      <div
        className={cn(
          "relative",
          displayMode === "stack" && "flex flex-col",
          displayMode === "flex" && "flex overflow-x-auto",
          displayMode === "grid" && "flex"
        )}
        style={{
          gap: displayMode === "stack"
            ? parseGapValue(section.rowGap)
            : displayMode === "grid"
              ? gapValue
              : undefined,
        }}
      >
        {section.columns.map((column, i) => {
          // Determine display width based on viewport and mode
          const displayWidth = displayMode === "stack"
            ? "100%"
            : `${columnPercents[i].toFixed(1)}%`;
          const cssWidth = displayMode === "grid"
            ? getColumnCssWidth(getColumnWidth(column))
            : displayMode === "stack"
              ? "100%"
              : undefined;

          return (
            <div
              key={column.id}
              className={cn(
                "relative flex-shrink-0",
                displayMode === "flex" && "min-w-[150px]"
              )}
              style={{
                width: cssWidth,
                flex: displayMode === "flex" ? "0 0 auto" : undefined,
              }}
            >
              <ColumnComponent
                column={{ ...column, width: displayWidth }}
                index={i}
                totalColumns={columnCount}
                isParentSelected={isSelected}
                isSelected={selectedColumnId === column.id}
                isMobile={isMobileView}
                isSlider={isSlider}
                isEditing={isEditing}
                showLayoutEdit={showLayoutEdit}
                selectedBlockId={selectedBlockId}
                onSelectColumn={() => onSelectColumn(column.id)}
                onSelectBlock={onSelectBlock}
                onAddBlock={(blockType) => onAddBlock(column.id, blockType)}
                onDeleteBlock={(blockId) => onDeleteBlock(column.id, blockId)}
                onUpdateBlock={(blockId, content) => onUpdateBlock(column.id, blockId, content)}
                onReorderBlocks={(blockIds) => onReorderBlocks(column.id, blockIds)}
                onMoveBlockUp={(blockId) => onMoveBlockUp(column.id, blockId)}
                onMoveBlockDown={(blockId) => onMoveBlockDown(column.id, blockId)}
                onMoveBlockToColumn={(blockId, direction) => onMoveBlockToColumn(column.id, blockId, direction)}
              />
            </div>
          );
        })}

        {/* Render gaps with resize handles between columns. Always rendered in
            edit mode now (no selection gating) — see Phase 3. */}
        {showResizeHandles && displayMode === "grid" && section.columns.slice(0, -1).map((_, i) => {
          // Calculate position: sum of widths of columns before this gap
          const leftOffset = columnPercents.slice(0, i + 1).reduce((sum, p) => sum + p, 0);

          return (
            <div
              key={`gap-${i}`}
              className="absolute top-0 bottom-0 flex items-center justify-center"
              style={{
                left: `${leftOffset}%`,
                width: gapValue,
                transform: "translateX(-50%)",
              }}
            >
              <ResizeHandle onResize={(delta) => handleResize(i, delta)} />
            </div>
          );
        })}
      </div>

      {/* Section indicator (visible in edit mode + layout edit toggle on) */}
      {showSectionUi && (
        <div className="absolute top-2 right-2 text-xs text-theme-muted">
          {columnCount} col{columnCount > 1 ? "s" : ""}
          {isMobileView && section.mobileLayout !== "stack" && (
            <span className="ml-1">
              ({section.mobileLayout === "slider" ? "slider" : `${section.mobileColumns || 1} on mobile`})
            </span>
          )}
        </div>
      )}
    </div>
  );
}
