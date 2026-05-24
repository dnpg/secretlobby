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

/** Turn a list of legacy column percentages into a CSS Grid template made of
 *  `fr` units. Used by the v2 → v3 migration so persisted per-column widths
 *  collapse onto a single `grid-template-columns` string at the section level.
 *
 *  We DON'T just emit raw `Nfr Mfr` from the percentages — that produces ugly
 *  values like `33.34fr 66.66fr`. Instead we compute a ratio anchored on the
 *  smallest column, snap each track to one decimal place, and aggressively
 *  reduce to clean common cases:
 *    - `[50, 50]`     → `"1fr 1fr"`
 *    - `[66.66, 33.34]` → `"2fr 1fr"`
 *    - `[33.33, 33.33, 33.34]` → `"1fr 1fr 1fr"`
 *
 *  Anything else falls through to the smallest-track-anchored ratio. The math
 *  is intentionally simple — the migration runs once per lobby on first load
 *  and the result lands in the persisted v3 template, so designers can tweak
 *  it freely after the fact. */
export function percentsToGridTemplate(percents: number[]): string {
  if (percents.length === 0) return "1fr";
  if (percents.length === 1) return "1fr";
  const min = Math.min(...percents);
  if (min <= 0) {
    // Defensive: a malformed v2 layout could store `0%` or negative widths.
    // Fall back to an equal split so the section never collapses.
    return percents.map(() => "1fr").join(" ");
  }
  const ratios = percents.map((p) => p / min);
  // Try to snap to integer ratios when the rounding error is small (within
  // 0.06 of a whole number — covers `33.34 / 33.33 = 1.0003` etc.).
  const snapped = ratios.map((r) => {
    const rounded = Math.round(r);
    return Math.abs(r - rounded) < 0.06 ? rounded : Math.round(r * 10) / 10;
  });
  return snapped.map((r) => `${r}fr`).join(" ");
}

/** Equal-track grid template for a column count, used as a sensible default
 *  when seeding new sections (`"1fr 1fr"` for 2 cols, `"1fr 1fr 1fr"` for 3,
 *  …). Single-column sections get `"1fr"`. */
export function equalGridTemplate(columnCount: number): string {
  if (columnCount <= 1) return "1fr";
  return Array.from({ length: columnCount }, () => "1fr").join(" ");
}

/** Tokenize a `grid-template-columns` string into its top-level track tokens.
 *  Handles `fr` / `px` / `%` / `auto` / `minmax(...)` / `repeat(...)` /
 *  `calc(...)` parentheses by counting depth — `minmax(0, 1fr)` stays a
 *  single token. Used by the editor's resize handle to figure out which
 *  tracks are `fr`-typed (and therefore safe to drag) versus fixed
 *  (px/%/auto, left untouched). */
export function tokenizeGridTemplate(template: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = "";
  for (let i = 0; i < template.length; i++) {
    const ch = template[i];
    if (ch === "(") {
      depth++;
      current += ch;
      continue;
    }
    if (ch === ")") {
      depth = Math.max(0, depth - 1);
      current += ch;
      continue;
    }
    if (depth === 0 && /\s/.test(ch)) {
      if (current.length > 0) {
        out.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }
  if (current.length > 0) out.push(current);
  return out;
}

/** Parse a single grid-template-columns track into either a numeric fr value
 *  (so the resize handle can manipulate it) or `null` for anything else
 *  (`200px`, `auto`, `minmax(0, 1fr)`, `repeat(...)`, …). The handle only
 *  drags fr-typed neighbours; non-fr tracks pass through to the next
 *  resizable boundary. */
export function parseFrToken(token: string): number | null {
  const trimmed = token.trim();
  const match = trimmed.match(/^(-?\d+(?:\.\d+)?)fr$/i);
  if (!match) return null;
  const value = parseFloat(match[1]);
  return Number.isFinite(value) ? value : null;
}

/** Coerce a column-gap string into pixels for layout math. `"16"` and `"16px"`
 *  → 16; `"1rem"` → 16 (assumed root font size); anything else → 0. Not a
 *  full CSS length parser — it's just enough for the editor's resize math. */
export function parsePixelGap(value: string): number {
  if (!value) return 0;
  const trimmed = value.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) return parseFloat(trimmed);
  const pxMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)px$/i);
  if (pxMatch) return parseFloat(pxMatch[1]);
  const remMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)rem$/i);
  if (remMatch) return parseFloat(remMatch[1]) * 16;
  return 0;
}

/** Resolve a grid-template-columns string to pixel widths per track for a
 *  given container width + gap. Fixed tracks (`px`, `%`) consume their share
 *  first; remaining space is divided across `fr` tracks proportionally to
 *  their weights. Unknown tokens (`auto`, `minmax`, `repeat`, …) are treated
 *  as a `1fr` track for the calculation so the editor still has SOMETHING
 *  reasonable to drag. Returned widths are floored at 0. */
export function resolveTemplateToPixelWidths(
  template: string,
  containerWidth: number,
  columnGap: number = 0
): number[] {
  const tokens = tokenizeGridTemplate(template);
  if (tokens.length === 0) return [];
  const trackTotal = Math.max(0, containerWidth - columnGap * (tokens.length - 1));

  type ResolvedToken =
    | { kind: "fixed"; px: number }
    | { kind: "fr"; weight: number };

  const resolved: ResolvedToken[] = tokens.map((tok) => {
    const t = tok.trim();
    const pctMatch = t.match(/^(-?\d+(?:\.\d+)?)%$/);
    if (pctMatch) {
      // CSS Grid resolves `%` tokens against the FULL grid container width,
      // not the track-total (container minus gaps). Using `trackTotal` here
      // would make our handle math disagree with what the browser renders
      // by exactly `gapPx * (n-1)`, causing the handle to appear off-centre
      // and post-drag templates to overflow the section. Match the spec.
      return { kind: "fixed", px: (parseFloat(pctMatch[1]) / 100) * containerWidth };
    }
    const pxMatch = t.match(/^(-?\d+(?:\.\d+)?)px$/i);
    if (pxMatch) return { kind: "fixed", px: parseFloat(pxMatch[1]) };
    const fr = parseFrToken(t);
    if (fr !== null) return { kind: "fr", weight: Math.max(0, fr) };
    return { kind: "fr", weight: 1 };
  });

  const fixedTotal = resolved.reduce(
    (sum, r) => (r.kind === "fixed" ? sum + r.px : sum),
    0
  );
  const frWeightTotal = resolved.reduce(
    (sum, r) => (r.kind === "fr" ? sum + r.weight : sum),
    0
  );
  const frRemaining = Math.max(0, trackTotal - fixedTotal);
  const frPerWeight = frWeightTotal > 0 ? frRemaining / frWeightTotal : 0;

  return resolved.map((r) =>
    Math.max(0, r.kind === "fixed" ? r.px : r.weight * frPerWeight)
  );
}

/** Snap a pixel width to a clean 10-pixel grid for display, with a hard
 *  floor of 40px so we don't suggest a `0px` sidebar after rounding. */
function snapSidebarPx(px: number): number {
  return Math.max(40, Math.round(px / 10) * 10);
}

/** Reduce a fraction by its greatest common divisor. Operates on positive
 *  integers; non-integer / non-positive inputs short-circuit to `[1]`. */
function reduceRatio(nums: number[]): number[] {
  if (nums.length === 0) return [];
  if (nums.some((n) => n <= 0 || !Number.isInteger(n))) return nums;
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = nums.reduce((g, n) => gcd(g, n), nums[0]);
  if (divisor <= 1) return nums;
  return nums.map((n) => n / divisor);
}

/** Closest small-integer `fr` ratio for a list of percentages. Looser snapping
 *  than `percentsToGridTemplate` — alternatives in the editor are intended to
 *  be visually close, not pixel-perfect, so we always round to ints and reduce
 *  by GCD. `[78.93, 21.07]` → `"4fr 1fr"`, `[66.67, 33.33]` → `"2fr 1fr"`. */
function approximateFrRatio(percents: number[]): string {
  if (percents.length === 0) return "1fr";
  const min = Math.min(...percents);
  if (min <= 0) return percents.map(() => "1fr").join(" ");
  const ratios = percents.map((p) => Math.max(1, Math.round(p / min)));
  const reduced = reduceRatio(ratios);
  return reduced.map((n) => `${n}fr`).join(" ");
}

/** Suggest grid-template-columns alternatives that produce roughly the same
 *  visual layout as `template` at the given container width. Used by the
 *  editor sidebar to give designers quick swaps between %, fr-ratio, and
 *  pixel-sidebar forms. Returns at most four candidates; duplicates are
 *  removed (so e.g. dragging to exactly 50/50 collapses the % and fr forms
 *  into a single `"1fr 1fr"` button). */
export function gridTemplateAlternatives(
  template: string,
  containerWidth: number,
  columnGap: number = 0
): string[] {
  const pixelWidths = resolveTemplateToPixelWidths(template, containerWidth, columnGap);
  if (pixelWidths.length < 2) return [];
  const trackTotal = pixelWidths.reduce((sum, w) => sum + w, 0);
  if (trackTotal <= 0) return [];

  const percents = pixelWidths.map((w) => (w / trackTotal) * 100);

  // Integer-% form. We round each track then nudge the last token so the
  // sum always lands on exactly 100 — a `"66% 33%"` button would render
  // identically to the real `66.67/33.33` split but is much easier to read.
  const intPcts = percents.map((p) => Math.round(p));
  const drift = 100 - intPcts.reduce((s, n) => s + n, 0);
  if (drift !== 0) intPcts[intPcts.length - 1] += drift;
  const pctForm = intPcts.map((p) => `${p}%`).join(" ");

  const out: string[] = [];
  const push = (t: string) => {
    if (t.length > 0 && !out.includes(t)) out.push(t);
  };

  push(pctForm);
  push(approximateFrRatio(percents));

  // Pixel-sidebar variants only make sense for 2-column sections — for 3+
  // there's no obvious "main column + sidebar" framing. Both forms snap to
  // a 10px grid so suggestions look like `1fr 300px`, not `1fr 287px`.
  if (pixelWidths.length === 2) {
    const [leftPx, rightPx] = pixelWidths;
    push(`1fr ${snapSidebarPx(rightPx)}px`);
    push(`${snapSidebarPx(leftPx)}px 1fr`);
  }

  return out;
}
