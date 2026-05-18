// =============================================================================
// SectionView
// -----------------------------------------------------------------------------
// View-only section renderer — owns the column layout (flex/grid/stack),
// viewport-aware widths (`tabletWidth` overrides on tablet), and the mobile
// stack / slider / keep modes. Pure rendering: no selection borders, no click
// handlers, no resize handles, no "X cols" indicator. The editor's
// SectionComponent will compose this view and add its chrome on top.
//
// Hidden sections drop out of the render entirely (matching preview-mode
// semantics). The editor's wrapper keeps them visible (dimmed) so they can
// be toggled back on, but that's editor-side and not this view's job.
//
// Block rendering is delegated to the caller via `renderBlock` — see
// ColumnView for the rationale (runtime data like audio state shouldn't
// thread through layout components).
// =============================================================================

import { useMemo } from "react";
import type { Block, Column, Section, ViewportSize } from "./types";
import { ColumnView } from "./ColumnView";
import {
  normalizePercents,
  parseGapValue,
  parseWidthToPercent,
} from "./layoutHelpers";

export interface SectionViewProps {
  section: Section;
  viewport: ViewportSize;
  /** Per-block renderer forwarded to each ColumnView. See ColumnView for the
   *  shape; `index` is the persisted block index inside its column. */
  renderBlock: (block: Block, columnIndex: number, blockIndex: number) => React.ReactNode;
}

export function SectionView({ section, viewport, renderBlock }: SectionViewProps) {
  if (section.hidden === true) return null;

  const isMobile = viewport === "mobile";
  const isTablet = viewport === "tablet";
  const columnCount = section.columns.length;

  // Effective width per column for the current viewport. Tablet falls back to
  // the desktop width when `tabletWidth` is unset — mirrors the editor's
  // SectionComponent so the lobby paints identically.
  const getColumnWidth = (col: Column): string => {
    if (isTablet && col.tabletWidth) return col.tabletWidth;
    return col.width;
  };

  // Normalise stored widths to a list of percentages that sums to 100. Cached
  // by the columns array + viewport so a re-render with the same inputs is a
  // no-op.
  const columnPercents = useMemo(() => {
    const raw = section.columns.map((col) =>
      parseWidthToPercent(getColumnWidth(col), columnCount)
    );
    return normalizePercents(raw);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section.columns, columnCount, viewport]);

  // Pick the layout mode based on viewport + the section's mobileLayout. The
  // editor and lobby share this decision tree so widths read identically in
  // both contexts.
  //   stack — every column 100% width, stacked vertically (`mobileLayout:
  //            "stack"`)
  //   flex  — horizontal scroll snap on mobile slider mode
  //   grid  — desktop / tablet / mobile-keep: columns sit side-by-side
  const isSlider = section.mobileLayout === "slider" && isMobile;
  let displayMode: "grid" | "flex" | "stack" = "grid";
  if (isMobile) {
    if (section.mobileLayout === "stack") {
      displayMode = "stack";
    } else if (isSlider) {
      displayMode = "flex";
    }
  }

  const gapValue = parseGapValue(section.columnGap);

  // For the grid layout we want each column to occupy its percentage width
  // MINUS its share of the gap between columns. `calc(W - gap * (N-1)/N)`
  // distributes the gap evenly across columns so the sum hits exactly 100%.
  // Stack mode forces 100% width; flex (slider) skips this and lets the
  // intrinsic min-width keep cards readable on a small viewport.
  const getColumnCssWidth = (width: string): string => {
    if (columnCount === 1 || displayMode === "stack") return width;
    const gapMultiplier = (columnCount - 1) / columnCount;
    return `calc(${width} - ${gapValue} * ${gapMultiplier.toFixed(4)})`;
  };

  return (
    // Wrapper mirrors the editor's preview SectionComponent (in apps/console)
    // so widths line up byte-for-byte between the canvas and the published
    // lobby. `border-2 border-transparent` is intentional — the editor
    // swaps it for a dashed violet border when layout-edit is on, and the
    // 4px (2px × 2 sides) the transparent border consumes is part of how
    // sections size themselves. Without it sections render 4px wider on
    // the lobby than in the editor preview.
    <div
      className="relative rounded-lg transition-all border-2 border-transparent"
      style={{ "--section-gap": gapValue } as React.CSSProperties}
    >
      <div
        className={
          displayMode === "stack"
            ? "flex flex-col"
            : displayMode === "flex"
              ? "flex overflow-x-auto"
              : "flex"
        }
        style={{
          gap:
            displayMode === "stack"
              ? parseGapValue(section.rowGap)
              : displayMode === "grid"
                ? gapValue
                : undefined,
        }}
      >
        {section.columns.map((column, columnIndex) => {
          if (column.hidden === true) return null;

          // `displayWidth` is the percentage label we hand the ColumnView.
          // Stack mode forces 100% (each column owns a full row); other
          // modes use the normalised percentage so the columns line up.
          const displayWidth =
            displayMode === "stack"
              ? "100%"
              : `${columnPercents[columnIndex].toFixed(1)}%`;
          // `cssWidth` is what we apply to the column's wrapper. Grid mode
          // uses the gap-compensated calc(); stack mode is 100%; flex mode
          // lets the column's intrinsic min-width drive sizing.
          const cssWidth =
            displayMode === "grid"
              ? getColumnCssWidth(getColumnWidth(column))
              : displayMode === "stack"
                ? "100%"
                : undefined;

          return (
            <div
              key={column.id}
              className={
                displayMode === "flex"
                  ? "relative shrink-0 min-w-[150px]"
                  : "relative shrink-0"
              }
              style={{
                width: cssWidth,
                flex: displayMode === "flex" ? "0 0 auto" : undefined,
              }}
            >
              <ColumnView
                column={{ ...column, width: displayWidth }}
                renderBlock={(block, blockIndex) =>
                  renderBlock(block, columnIndex, blockIndex)
                }
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
