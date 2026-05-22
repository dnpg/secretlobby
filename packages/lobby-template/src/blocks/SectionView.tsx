// =============================================================================
// SectionView
// -----------------------------------------------------------------------------
// View-only section renderer driven entirely by CSS container queries — the
// component emits one DOM tree at SSR time and the consuming app's CSS picks
// the layout tier (mobile-stack / mobile-slider / tablet / desktop) based on
// the section's own container width. No JavaScript reflow, no SSR/hydration
// flash, and the editor's device-frame preview "just works" because the frame
// is the container.
//
// Per-column widths are emitted as CSS vars (`--col-w-desktop`,
// `--col-w-tablet`) so both tiers are available at render time; container
// queries swap them. `mobileLayout` is exposed via the `data-mobile-layout`
// attribute and selected by CSS rules. Required CSS lives in each app's
// `app.css` under the `.lobby-section*` selectors — see those files for the
// canonical rules; they MUST stay in sync.
// =============================================================================

import { useMemo } from "react";
import type { Block, Section } from "./types";
import { ColumnView } from "./ColumnView";
import {
  normalizePercents,
  parseGapValue,
  parseWidthToPercent,
} from "./layoutHelpers";

export interface SectionViewProps {
  section: Section;
  /** Per-block renderer forwarded to each ColumnView. See ColumnView for the
   *  shape; `index` is the persisted block index inside its column. */
  renderBlock: (block: Block, columnIndex: number, blockIndex: number) => React.ReactNode;
}

export function SectionView({ section, renderBlock }: SectionViewProps) {
  if (section.hidden === true) return null;

  const columnCount = section.columns.length;
  const gapValue = parseGapValue(section.columnGap);
  const rowGapValue = parseGapValue(section.rowGap);

  // Desktop percentages — sourced from `col.width`. Used as the default
  // value of `--col-w-desktop` for every container width above the tablet
  // breakpoint.
  const desktopPercents = useMemo(() => {
    const raw = section.columns.map((col) =>
      parseWidthToPercent(col.width, columnCount)
    );
    return normalizePercents(raw);
  }, [section.columns, columnCount]);

  // Tablet percentages — use `col.tabletWidth` when set, else fall through to
  // the desktop width. The CSS only swaps to this var on columns that opted
  // in via `data-has-tablet-width="true"`, so legacy sections without a
  // tablet override keep their desktop widths at tablet container widths.
  const tabletPercents = useMemo(() => {
    const raw = section.columns.map((col) =>
      parseWidthToPercent(col.tabletWidth || col.width, columnCount)
    );
    return normalizePercents(raw);
  }, [section.columns, columnCount]);

  // Gap-compensated CSS width — distribute the gap evenly across columns so
  // their gap-compensated widths sum to exactly 100%. Single-column sections
  // (and stack mode at mobile) short-circuit to 100%.
  const compensate = (percent: number): string => {
    if (columnCount === 1) return "100%";
    const gapMultiplier = (columnCount - 1) / columnCount;
    return `calc(${percent.toFixed(2)}% - ${gapValue} * ${gapMultiplier.toFixed(4)})`;
  };

  return (
    <div
      data-section-container="true"
      data-mobile-layout={section.mobileLayout || "keep"}
      className="lobby-section relative rounded-lg transition-all border-2 border-transparent"
      style={
        {
          "--section-column-gap": gapValue,
          "--section-row-gap": rowGapValue,
        } as React.CSSProperties
      }
    >
      <div className="lobby-section-columns relative">
        {section.columns.map((column, columnIndex) => {
          if (column.hidden === true) return null;
          const desktopCss = compensate(desktopPercents[columnIndex]);
          const tabletCss = column.tabletWidth
            ? compensate(tabletPercents[columnIndex])
            : desktopCss;
          return (
            <div
              key={column.id}
              className="lobby-section-column relative"
              data-has-tablet-width={column.tabletWidth ? "true" : undefined}
              style={
                {
                  "--col-w-desktop": desktopCss,
                  "--col-w-tablet": tabletCss,
                } as React.CSSProperties
              }
            >
              <ColumnView
                column={{
                  ...column,
                  width: `${desktopPercents[columnIndex].toFixed(1)}%`,
                }}
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
