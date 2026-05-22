// =============================================================================
// SectionComponent (editor canvas, v3 grid)
// -----------------------------------------------------------------------------
// Editor-side counterpart of `@secretlobby/lobby-template`'s SectionView.
// Renders the section's columns through CSS Grid (matching the v3 production
// renderer) and overlays selection chrome, drag/drop wrappers, and column-
// resize handles.
//
// Key differences from the production renderer:
//   - We mirror the section's grid template into a single inline
//     `gridTemplateColumns` style so the editor renders identically to the
//     lobby at the current viewport.
//   - Resize handles live BETWEEN grid tracks. Dragging a handle rewrites the
//     two neighbouring `fr` tokens on the active viewport's template
//     (`gridTemplateDesktop` or `gridTemplateTablet`). Non-fr tokens (`px`,
//     `auto`, `minmax(...)`) pass through untouched — designers can lock a
//     sidebar at a pixel width and still drag the fluid track next to it.
//   - Mobile slider + stack short-circuit the grid render exactly like the
//     production renderer (flex strip, or single-column stack).
// =============================================================================

import { useMemo, useRef } from "react";
import { cn } from "@secretlobby/ui";
import {
  equalGridTemplate,
  parseFrToken,
  tokenizeGridTemplate,
} from "@secretlobby/lobby-template";
import type {
  BlockContent,
  BlockType,
  Section,
  ViewportSize,
} from "../state/types";
import { parseGapValue } from "../state/helpers";
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
  onAddBlock: (columnId: string, blockType: BlockType, atIndex?: number) => void;
  onDeleteBlock: (columnId: string, blockId: string) => void;
  onUpdateBlock: (columnId: string, blockId: string, content: Partial<BlockContent>) => void;
  onReorderBlocks: (columnId: string, blockIds: string[]) => void;
  /** v3: grid track resize. The editor passes the FULL new grid-template
   *  string for the active viewport, NOT per-column widths. The reducer
   *  routes the update to `gridTemplateDesktop` or `gridTemplateTablet`
   *  based on `viewport`. Mobile resize isn't wired (the canvas paints the
   *  mobile slider / stack short-circuit instead). */
  onResizeGridTemplate?: (
    nextTemplate: string,
    viewport: "desktop" | "tablet"
  ) => void;
  onMoveBlockUp: (columnId: string, blockId: string) => void;
  onMoveBlockDown: (columnId: string, blockId: string) => void;
  onMoveBlockToColumn: (columnId: string, blockId: string, direction: "left" | "right") => void;
  // Slash-menu in-place block-type swap, plumbed from BlockListSurface up
  // through Canvas to the column-level reducer (`replaceBlock`).
  onReplaceBlock: (columnId: string, blockId: string, newType: BlockType) => void;
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
  onResizeGridTemplate,
  onMoveBlockUp,
  onMoveBlockDown,
  onMoveBlockToColumn,
  onReplaceBlock,
}: SectionComponentProps) {
  // Section/column visuals are layout-level affordances. Hidden when the
  // dashed-square toggle in TopHeader is off — blocks remain editable, the
  // canvas just stops showing section/column scaffolding.
  const showSectionUi = isEditing && showLayoutEdit;
  // Visibility: a hidden section is fully removed from the canvas in every
  // mode. The sidebar still surfaces it (with the eye-off icon + dimmed row)
  // so the user can toggle it back on without needing a canvas placeholder.
  const sectionHidden = section.hidden === true;
  if (sectionHidden) return null;
  const isMobile = viewport === "mobile";
  const isTablet = viewport === "tablet";
  const columnCount = section.columns.length;
  const containerRef = useRef<HTMLDivElement>(null);

  // Active grid template for the current viewport. The fallback chain mirrors
  // the production CSS (tablet → desktop → equal split) so legacy sections
  // without a per-viewport override render the same in the editor.
  const activeTemplate = useMemo(() => {
    const desktop =
      section.gridTemplateDesktop && section.gridTemplateDesktop.trim().length > 0
        ? section.gridTemplateDesktop
        : equalGridTemplate(columnCount);
    if (isTablet) {
      return section.gridTemplateTablet ?? desktop;
    }
    return desktop;
  }, [
    section.gridTemplateDesktop,
    section.gridTemplateTablet,
    isTablet,
    columnCount,
  ]);

  // Tokenise the active template once so the resize handles can walk
  // neighbouring tracks. We keep both the raw tokens (for write-back) and
  // their parsed fr values (or `null` for fixed/auto tracks).
  const tokens = useMemo(() => tokenizeGridTemplate(activeTemplate), [
    activeTemplate,
  ]);
  const frValues = useMemo(() => tokens.map((t) => parseFrToken(t)), [tokens]);

  // Resize: drag between tracks i and i+1, shifting fr units from one to the
  // other while keeping their SUM constant. Non-fr neighbouring tracks are
  // left untouched — the handle simply doesn't render between them.
  const handleResize = (
    leftIndex: number,
    rightIndex: number,
    deltaPercent: number
  ) => {
    if (!onResizeGridTemplate) return;
    if (isMobile) return; // mobile slider / stack handled by CSS short-circuit
    if (viewport !== "desktop" && viewport !== "tablet") return;

    const leftFr = frValues[leftIndex];
    const rightFr = frValues[rightIndex];
    // Only fr ↔ fr neighbours are resizable. Mixed neighbours (e.g.
    // `1fr 300px`) get a non-interactive boundary — designers manage those
    // via the section settings template input directly.
    if (leftFr === null || rightFr === null) return;

    const total = leftFr + rightFr;
    // Convert percentage delta to fr delta, keeping the pair's sum constant.
    const minFrac = 0.1; // never let a track go below 10% of the pair
    const minFr = total * minFrac;
    const targetLeft = leftFr + (deltaPercent / 100) * total;
    const clampedLeft = Math.max(minFr, Math.min(total - minFr, targetLeft));
    const clampedRight = total - clampedLeft;

    // Snap to one decimal place so the persisted string stays human-readable.
    const nextLeft = Math.round(clampedLeft * 10) / 10;
    const nextRight = Math.round(clampedRight * 10) / 10;

    const nextTokens = tokens.slice();
    nextTokens[leftIndex] = `${nextLeft}fr`;
    nextTokens[rightIndex] = `${nextRight}fr`;
    onResizeGridTemplate(nextTokens.join(" "), viewport);
  };

  // Mobile branches: stack short-circuits to a single-column flex; slider
  // renders horizontal scroll. Anything else (keep / grid) flows through the
  // grid path so the editor preview matches the production CSS.
  const isMobileView = isMobile;
  const isSlider = section.mobileLayout === "slider" && isMobileView;
  const isMobileStack =
    isMobileView && (section.mobileLayout === "stack" || section.mobileLayout === undefined);
  const isMobileGrid = isMobileView && section.mobileLayout === "grid";

  // The mobile-grid case swaps the active template for `gridTemplateMobile`
  // when present. Falls back to the desktop template so legacy sections
  // promoted into mobile-grid mode still render something.
  const renderedTemplate = useMemo(() => {
    if (isMobileGrid) {
      return (
        section.gridTemplateMobile ??
        section.gridTemplateDesktop ??
        equalGridTemplate(columnCount)
      );
    }
    return activeTemplate;
  }, [
    isMobileGrid,
    section.gridTemplateMobile,
    section.gridTemplateDesktop,
    activeTemplate,
    columnCount,
  ]);

  // Resize handles render any time we are in edit mode and have 2+ columns
  // on a non-mobile/non-slider layout. v3: we only show a handle BETWEEN
  // adjacent fr-typed tracks (where dragging is well-defined).
  const showResizeHandles =
    showSectionUi && columnCount > 1 && !isMobileView && !isSlider;
  const gapValue = parseGapValue(section.columnGap);
  const rowGapValue = parseGapValue(section.rowGap);

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
        "relative rounded-lg transition-all",
        showSectionUi && "cursor-pointer",
        isSelected && showSectionUi
          ? "border-2 border-violet-400 bg-violet-500/10"
          : showSectionUi
            ? "border-2 border-dashed border-violet-500/30 hover:border-violet-400/60 hover:bg-violet-500/5"
            : "border-2 border-transparent"
      )}
      style={{ "--section-gap": gapValue } as React.CSSProperties}
    >
      {/* Column layout: grid by default; flex strip in slider mode; single-
          column stack in mobile-stack mode. */}
      {isSlider ? (
        <div className="relative flex overflow-x-auto" style={{ gap: gapValue }}>
          {section.columns.map((column, i) => (
            <div
              key={column.id}
              className="relative flex-shrink-0 min-w-[150px]"
              style={{ flex: "0 0 auto" }}
            >
              <ColumnComponent
                column={column}
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
                onAddBlock={(blockType, atIndex) =>
                  onAddBlock(column.id, blockType, atIndex)
                }
                onDeleteBlock={(blockId) => onDeleteBlock(column.id, blockId)}
                onUpdateBlock={(blockId, content) =>
                  onUpdateBlock(column.id, blockId, content)
                }
                onReorderBlocks={(blockIds) =>
                  onReorderBlocks(column.id, blockIds)
                }
                onMoveBlockUp={(blockId) => onMoveBlockUp(column.id, blockId)}
                onMoveBlockDown={(blockId) =>
                  onMoveBlockDown(column.id, blockId)
                }
                onMoveBlockToColumn={(blockId, direction) =>
                  onMoveBlockToColumn(column.id, blockId, direction)
                }
                onReplaceBlock={(blockId, newType) =>
                  onReplaceBlock(column.id, blockId, newType)
                }
              />
            </div>
          ))}
        </div>
      ) : isMobileStack ? (
        <div className="relative flex flex-col" style={{ gap: rowGapValue }}>
          {section.columns.map((column, i) => (
            <div key={column.id} className="relative" style={{ width: "100%" }}>
              <ColumnComponent
                column={column}
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
                onAddBlock={(blockType, atIndex) =>
                  onAddBlock(column.id, blockType, atIndex)
                }
                onDeleteBlock={(blockId) => onDeleteBlock(column.id, blockId)}
                onUpdateBlock={(blockId, content) =>
                  onUpdateBlock(column.id, blockId, content)
                }
                onReorderBlocks={(blockIds) =>
                  onReorderBlocks(column.id, blockIds)
                }
                onMoveBlockUp={(blockId) => onMoveBlockUp(column.id, blockId)}
                onMoveBlockDown={(blockId) =>
                  onMoveBlockDown(column.id, blockId)
                }
                onMoveBlockToColumn={(blockId, direction) =>
                  onMoveBlockToColumn(column.id, blockId, direction)
                }
                onReplaceBlock={(blockId, newType) =>
                  onReplaceBlock(column.id, blockId, newType)
                }
              />
            </div>
          ))}
        </div>
      ) : (
        <div
          className="relative"
          style={{
            display: "grid",
            gridTemplateColumns: renderedTemplate,
            // Row + column gap combined into the shorthand. Row gap matters
            // when the grid wraps (e.g. designer uses `repeat(auto-fit, …)`).
            gap: `${rowGapValue} ${gapValue}`,
          }}
        >
          {section.columns.map((column, i) => (
            <div key={column.id} className="relative min-w-0">
              <ColumnComponent
                column={column}
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
                onAddBlock={(blockType, atIndex) =>
                  onAddBlock(column.id, blockType, atIndex)
                }
                onDeleteBlock={(blockId) => onDeleteBlock(column.id, blockId)}
                onUpdateBlock={(blockId, content) =>
                  onUpdateBlock(column.id, blockId, content)
                }
                onReorderBlocks={(blockIds) =>
                  onReorderBlocks(column.id, blockIds)
                }
                onMoveBlockUp={(blockId) => onMoveBlockUp(column.id, blockId)}
                onMoveBlockDown={(blockId) =>
                  onMoveBlockDown(column.id, blockId)
                }
                onMoveBlockToColumn={(blockId, direction) =>
                  onMoveBlockToColumn(column.id, blockId, direction)
                }
                onReplaceBlock={(blockId, newType) =>
                  onReplaceBlock(column.id, blockId, newType)
                }
              />
            </div>
          ))}

          {/* v3 resize handles. Rendered absolutely positioned between every
              pair of fr-typed neighbouring tracks. Position is computed from
              the running sum of normalised fr ratios — non-fr tracks
              (`200px`, `auto`, …) participate in the offset math via their
              measured DOM width, NOT here, so we keep the handle render math
              simple and rely on `position: absolute` over the grid container.
              The handle's delta is interpreted as percent-of-section, and
              `handleResize` projects it back into fr units. */}
          {showResizeHandles &&
            tokens.slice(0, -1).map((_, i) => {
              const leftFr = frValues[i];
              const rightFr = frValues[i + 1];
              // No handle between non-fr neighbours — dragging fixed widths
              // isn't well-defined.
              if (leftFr === null || rightFr === null) return null;
              // Position approximation: cumulative fr fractions across the
              // section. For mixed `1fr 200px 1fr` templates this is
              // approximate (it ignores the px track's pixel width); the
              // tradeoff is fine because the handle still anchors near the
              // correct boundary, and dragging only affects the two fr
              // tracks it sits between.
              const totalFr: number = frValues.reduce<number>(
                (sum, v) => sum + (v ?? 0),
                0
              );
              const cumLeftFr: number = frValues
                .slice(0, i + 1)
                .reduce<number>((sum, v) => sum + (v ?? 0), 0);
              const offsetPercent = totalFr > 0 ? (cumLeftFr / totalFr) * 100 : 50;
              return (
                <div
                  key={`gap-${i}`}
                  className="absolute top-0 bottom-0 flex items-center justify-center"
                  style={{
                    left: `${offsetPercent}%`,
                    width: gapValue,
                    transform: "translateX(-50%)",
                    pointerEvents: "auto",
                  }}
                >
                  <ResizeHandle
                    onResize={(delta) => handleResize(i, i + 1, delta)}
                  />
                </div>
              );
            })}
        </div>
      )}

      {/* Section indicator (visible in edit mode + layout edit toggle on) */}
      {showSectionUi && (
        <div className="absolute top-2 right-2 text-xs text-theme-muted">
          {columnCount} col{columnCount > 1 ? "s" : ""}
          {isMobileView && section.mobileLayout !== "stack" && (
            <span className="ml-1">
              ({section.mobileLayout === "slider"
                ? "slider"
                : section.mobileLayout === "grid"
                  ? "grid"
                  : `${section.mobileColumns || 1} on mobile`})
            </span>
          )}
        </div>
      )}
    </div>
  );
}
