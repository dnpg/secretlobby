// =============================================================================
// Layout helpers for SectionView / ColumnView
// -----------------------------------------------------------------------------
// Pure functions — viewport sizing, gap normalisation, column-percentage math.
// Lifted out of apps/console so the lobby's renderer doesn't have to reach
// into editor-only code to compute layout. The editor will adopt the same
// helpers when its SectionComponent migrates to render through SectionView.
// =============================================================================

import type { ViewportSize } from "./types";

/** Device-frame widths the editor uses for tablet / mobile preview. Kept here
 *  rather than in the editor's helpers because the lobby's responsive
 *  breakpoint logic reads the same constants when picking
 *  tabletMediaUrl / mobileMediaUrl on image blocks. */
export const VIEWPORT_WIDTHS: Record<ViewportSize, number> = {
  desktop: 1440,
  tablet: 768,
  mobile: 375,
};

/** Coerce a gap value to a CSS length. Bare numbers are interpreted as `px`
 *  (matches the editor's existing column-gap / row-gap UX where the user can
 *  type `16` and have it render as `16px`). Anything with a unit suffix is
 *  passed through untouched. */
export function parseGapValue(value: string): string {
  if (!value || value === "0") return "0";
  const trimmed = value.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return `${trimmed}px`;
  }
  return trimmed;
}

/** Convert a stored column width (`"50%"`, `"calc(50% - 8px)"`, `"1fr"`, …)
 *  into a numeric percentage. Resize handles operate on percentages; this is
 *  the canonical normaliser they share with the layout renderer. Unknown
 *  units fall back to an equal split across `totalColumns`, so a malformed
 *  width never collapses the section. */
export function parseWidthToPercent(
  width: string,
  totalColumns: number
): number {
  const trimmed = width.trim();
  if (trimmed.startsWith("calc(")) {
    const match = trimmed.match(/calc\((\d+(?:\.\d+)?)%/);
    if (match) {
      return parseFloat(match[1]) || 100 / totalColumns;
    }
  }
  if (trimmed.endsWith("%")) {
    return parseFloat(trimmed) || 100 / totalColumns;
  }
  if (trimmed.endsWith("fr")) {
    return 100 / totalColumns;
  }
  return 100 / totalColumns;
}

/** Rescale a list of column percentages so they sum to 100. Keeps the visual
 *  result correct even when stored widths drift from a perfect 100% sum (the
 *  editor's resize handles round to 1 decimal, so small rounding errors
 *  accumulate over many edits). */
export function normalizePercents(percents: number[]): number[] {
  const total = percents.reduce((sum, p) => sum + p, 0);
  if (total === 0) return percents.map(() => 100 / percents.length);
  return percents.map((p) => (p / total) * 100);
}
