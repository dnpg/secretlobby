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

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@secretlobby/ui";
import {
  equalGridTemplate,
  parsePixelGap,
  resolveTemplateToPixelWidths,
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
  /** Platform-wide SystemSettings flag. When true, in-canvas column resize
   *  handles are hidden alongside the sidebar grid-template inputs. The
   *  drag handles and the sidebar text inputs must move together so the
   *  set of "ways to change column sizing" is consistent. */
  disableColumnSizeEditor: boolean;
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
  disableColumnSizeEditor,
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
  // Track the section's live pixel width so the resize-handle render math
  // can position handles between mixed-unit tracks accurately. Refs alone
  // don't trigger re-renders, so without this state the handles would be
  // missing on first mount (clientWidth is 0 before React paints). A
  // ResizeObserver keeps it fresh through viewport switches and window
  // resizes — accuracy matters more here than render count, the section
  // resizes rarely.
  const [containerWidth, setContainerWidth] = useState(0);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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

  // Tokenise the active template once so the resize handler + handle
  // positioning math can reason about each track. The handle works between
  // any two adjacent tracks now (regardless of `fr` / `px` / `%`); dragging
  // converts the pair to percentage form so unit mixing is no longer a
  // dead-end for the user.
  const tokens = useMemo(() => tokenizeGridTemplate(activeTemplate), [
    activeTemplate,
  ]);
  const gapPx = useMemo(() => parsePixelGap(section.columnGap), [
    section.columnGap,
  ]);

  // Resize: drag between tracks i and i+1. We resolve the current template
  // into pixel widths against the live container, shift pixels from one
  // track to the other (keeping the pair's combined width constant), then
  // write the dragged pair back as `%` of the track-total. Other tracks
  // are left untouched so a 3-col `1fr 300px 1fr` keeps the px-locked
  // middle column pinned while the user drags either fluid neighbour.
  const handleResize = (
    leftIndex: number,
    rightIndex: number,
    deltaPercent: number
  ) => {
    if (!onResizeGridTemplate) return;
    if (isMobile) return; // mobile slider / stack handled by CSS short-circuit
    if (viewport !== "desktop" && viewport !== "tablet") return;

    const sectionEl = containerRef.current;
    if (!sectionEl) return;
    const containerWidth = sectionEl.clientWidth;
    if (containerWidth <= 0) return;
    // Track-total is what `grid-template-columns` actually distributes — the
    // gaps consume the rest of the section width.
    const trackTotal = Math.max(1, containerWidth - gapPx * (columnCount - 1));

    const pixelWidths = resolveTemplateToPixelWidths(
      activeTemplate,
      containerWidth,
      gapPx
    );
    if (pixelWidths.length !== tokens.length) return;

    const leftPx = pixelWidths[leftIndex];
    const rightPx = pixelWidths[rightIndex];
    const pairSum = leftPx + rightPx;
    if (pairSum <= 0) return;

    // ResizeHandle reports delta as % of the section's container width, so
    // multiply by track-total to get the pixel delta the user dragged.
    const deltaPx = (deltaPercent / 100) * trackTotal;
    const minPx = Math.max(40, pairSum * 0.1);
    const newLeftPx = Math.max(
      minPx,
      Math.min(pairSum - minPx, leftPx + deltaPx)
    );
    const newRightPx = pairSum - newLeftPx;

    // Express the dragged pair as % of the FULL container width (not the
    // track-total). CSS Grid resolves `%` against the container, so for a
    // 2-col section with a 16px gap the emitted percentages must sum to
    // (100% - gapPct), leaving room for the gap. Using track-total here
    // would produce templates that overflow the section by exactly the
    // gap width — see the matching note in resolveTemplateToPixelWidths.
    void trackTotal; // kept for the min/clamp math above; not used in emit
    const round1 = (n: number) => Math.round(n * 10) / 10;
    const leftPct = round1((newLeftPx / containerWidth) * 100);
    const rightPct = round1((newRightPx / containerWidth) * 100);

    const nextTokens = tokens.slice();
    nextTokens[leftIndex] = `${leftPct}%`;
    nextTokens[rightIndex] = `${rightPct}%`;
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
  // adjacent fr-typed tracks (where dragging is well-defined). Also gated
  // by the platform-wide `disableColumnSizeEditor` flag — when the sidebar
  // text inputs are hidden, the drag handles must hide too so the user
  // never has a sizing affordance the super-admin disabled.
  const showResizeHandles =
    showSectionUi &&
    !disableColumnSizeEditor &&
    columnCount > 1 &&
    !isMobileView &&
    !isSlider;
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
              pair of adjacent tracks. Position is computed from the
              resolved pixel widths of each track against the live section
              container — accurate for mixed `1fr 300px` / `60% 40%` /
              `1fr 1fr` templates alike. Drag converts the pair to `%` so
              the handle keeps working through subsequent drags regardless
              of original unit. See `handleResize` for the projection math. */}
          {showResizeHandles &&
            (() => {
              if (containerWidth <= 0) return null;
              const pixelWidths = resolveTemplateToPixelWidths(
                activeTemplate,
                containerWidth,
                gapPx
              );
              let cumPx = 0;
              return tokens.slice(0, -1).map((_, i) => {
                cumPx += pixelWidths[i] ?? 0;
                // Anchor the handle on the boundary between tracks i and
                // i+1 (the gap centre). The (cumPx + i*gap + gap/2) term
                // accounts for previous gaps + half of the current gap so
                // the handle sits in the visual middle of the gap.
                const offsetPx = cumPx + i * gapPx + gapPx / 2;
                const offsetPercent = (offsetPx / containerWidth) * 100;
                // Pair sanity check — skip the handle when the pair has
                // collapsed to zero width (degenerate template).
                const pairSum = (pixelWidths[i] ?? 0) + (pixelWidths[i + 1] ?? 0);
                if (pairSum <= 0) return null;
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
              });
            })()}
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
