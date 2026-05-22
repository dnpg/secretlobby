// =============================================================================
// CardView
// -----------------------------------------------------------------------------
// Themed container that renders nested blocks. Recursive: each child block
// goes through `BlockView` (same dispatcher the column-level renderer uses),
// so nested cards-in-cards aren't allowed and the slash menu in the editor
// already enforces that — this view just walks whatever the persisted
// `content.blocks` array gives it.
//
// Visual treatment mirrors the editor's CardBlock chrome:
//   - card background via `getCardBgCSS` (honours theme.cardBg{Type,Color,
//     Gradient*})
//   - card border via `getCardBorderCSS` (only painted when the effective
//     width is positive)
//   - per-card inner padding from `content.padding`, falling back to 16px
//   - optional backdrop-filter from `theme.cardBackdropFilter`
//   - rich-text CSS vars (`--color-text-heading*`, `--color-text-content*`)
//     so HeadingView / ParagraphView inside the card pick up the card's
//     own text colors via inheritance — same pattern the editor's CardBlock
//     uses.
//
// Swatch resolution is best-effort here: the theme helpers accept an
// optional swatches array; when the host doesn't pass one, swatch-refs
// resolve to the helper's gray fallback. The lobby's loader can thread
// account swatches through later if designers start binding card bg /
// border to saved swatches.
// =============================================================================

import { useMemo, type CSSProperties } from "react";
import {
  backdropFilterToCSS,
  borderRadiusToCSS,
  boxPaddingToCSS,
  getCardBgCSS,
  getCardBorderCSS,
  textColorFallbackHex,
  textColorToCSSDeclarations,
  type ThemeSettings,
} from "@secretlobby/theme";
import type { Block, CardBlockContent } from "./types";
import type { SocialLinksSettings } from "../SocialLinks";
import { BlockView } from "./BlockView";

export interface CardViewProps {
  content: CardBlockContent;
  theme: ThemeSettings;
  socialLinks: SocialLinksSettings;
  /** Threaded through to nested `BlockView`s so blocks inside the card can
   *  rely on the same fallback as top-level blocks (a `player` block inside
   *  a card would still call the lobby's renderPlayer, for example). */
  renderFallback?: (block: Block) => React.ReactNode;
  /** Override the default child rendering. When provided, CardView paints
   *  the themed wrapper (bg / border / padding / radius / heading + content
   *  CSS vars) and renders `children` inside instead of looping
   *  `content.blocks` through BlockView. The editor uses this to plug its
   *  BlockListSurface (slash menu, drag-reorder, nested selection) into
   *  the same card chrome the lobby sees. */
  children?: React.ReactNode;
}

// Same rule the editor's CardBlock uses for the on/off paint decision:
// any positive-width side keeps the border visible, fully-zero suppresses
// it. Per-side widths win over the uniform width when set.
function parseCSSLengthNumeric(value: string | undefined): number {
  if (!value) return 0;
  const match = String(value).trim().match(/^-?[\d.]+/);
  if (!match) return 0;
  const n = parseFloat(match[0]);
  return Number.isFinite(n) ? n : 0;
}

function hasPositiveBorderWidth(theme: ThemeSettings): boolean {
  const sides = theme.cardBorderSideWidths;
  if (sides) {
    return (
      parseCSSLengthNumeric(sides.top) > 0 ||
      parseCSSLengthNumeric(sides.right) > 0 ||
      parseCSSLengthNumeric(sides.bottom) > 0 ||
      parseCSSLengthNumeric(sides.left) > 0
    );
  }
  return parseCSSLengthNumeric(theme.cardBorderWidth) > 0;
}

// Build the three pieces (color / image / fill) the descendant text blocks
// read via the `--color-text-{heading,content}*` CSS vars. Same trick the
// editor's CardBlock uses; lifted out so the lobby paints gradient card
// headings identically.
function richTextPieces(
  rich: ThemeSettings["cardHeadingColorRich"] | undefined,
  legacy: string
): { color: string; image: string; fill: string } {
  if (!rich) return { color: legacy, image: "none", fill: "currentColor" };
  const decls = textColorToCSSDeclarations(rich);
  if (!decls.backgroundImage) {
    return { color: decls.color, image: "none", fill: "currentColor" };
  }
  return {
    color: textColorFallbackHex(rich, legacy),
    image: decls.backgroundImage,
    fill: "transparent",
  };
}

export function CardView({
  content,
  theme,
  socialLinks,
  renderFallback,
  children,
}: CardViewProps) {
  // The page-builder Card editor only writes solid borders; strip the
  // legacy gradient-border fields so `getCardBorderCSS` falls through to
  // the uniform-solid path. Mirrors the editor's CardBlock.
  const solidBorderTheme = useMemo<ThemeSettings>(
    () => ({ ...theme, cardBorderImage: undefined, cardBorderType: "solid" }),
    [theme]
  );
  const border = getCardBorderCSS(solidBorderTheme);
  const showBorder = hasPositiveBorderWidth(theme);
  const backdropFilterCSS = backdropFilterToCSS(theme.cardBackdropFilter);
  const hasBackdropFilter =
    backdropFilterCSS !== "none" && backdropFilterCSS.length > 0;

  const headingPieces = useMemo(
    () => richTextPieces(theme.cardHeadingColorRich, theme.cardHeadingColor),
    [theme.cardHeadingColorRich, theme.cardHeadingColor]
  );
  const contentPieces = useMemo(
    () => richTextPieces(theme.cardContentColorRich, theme.cardContentColor),
    [theme.cardContentColorRich, theme.cardContentColor]
  );

  const wrapperStyle: CSSProperties = useMemo(
    () => ({
      background: getCardBgCSS(theme),
      borderRadius: borderRadiusToCSS(theme.cardBorderRadius, 12),
      padding: boxPaddingToCSS(content.padding, 16),
      color: theme.cardContentColor,
      // CSS vars descendants read via inheritance — see file header.
      ["--color-text-heading" as string]: headingPieces.color,
      ["--color-text-heading-image" as string]: headingPieces.image,
      ["--color-text-heading-fill" as string]: headingPieces.fill,
      ["--color-text-content" as string]: contentPieces.color,
      ["--color-text-content-image" as string]: contentPieces.image,
      ["--color-text-content-fill" as string]: contentPieces.fill,
      ...(hasBackdropFilter
        ? {
            backdropFilter: backdropFilterCSS,
            WebkitBackdropFilter: backdropFilterCSS,
          }
        : {}),
      ...(showBorder
        ? {
            border: border.style,
            ...(border.widths
              ? {
                  borderTopWidth: border.widths.top,
                  borderRightWidth: border.widths.right,
                  borderBottomWidth: border.widths.bottom,
                  borderLeftWidth: border.widths.left,
                }
              : {}),
            ...(border.styles
              ? {
                  borderTopStyle: border.styles.top,
                  borderRightStyle: border.styles.right,
                  borderBottomStyle: border.styles.bottom,
                  borderLeftStyle: border.styles.left,
                }
              : {}),
          }
        : { border: "none" }),
      ...(border.boxShadow ? { boxShadow: border.boxShadow } : {}),
    }),
    [
      theme,
      hasBackdropFilter,
      backdropFilterCSS,
      showBorder,
      border,
      headingPieces,
      contentPieces,
      content.padding,
    ]
  );

  // Caller-supplied children win — the editor passes its BlockListSurface
  // here so the card chrome wraps the editing surface 1:1. When no children
  // are passed (the lobby's default path), we loop the persisted block list
  // through BlockView.
  const nestedBlocks = Array.isArray(content.blocks) ? content.blocks : [];
  // The editor's CardBlock renders nested children through a BlockListSurface
  // (`<div class="relative w-full"><div class="flex flex-col" style="gap">`).
  // Mirror that wrapping here so the published lobby's card-nested DOM
  // matches the editor preview's. Nested BlockView calls pass `isNested`
  // so their outer `group/...` Tailwind class flips to `group/inner-block`.
  const body =
    children !== undefined ? (
      children
    ) : (
      <div className="relative w-full">
        <div className="flex flex-col" style={{ gap: "8px" }}>
          {nestedBlocks.map((child) => (
            <BlockView
              key={child.id}
              block={child}
              theme={theme}
              socialLinks={socialLinks}
              renderFallback={renderFallback}
              isNested
            />
          ))}
        </div>
      </div>
    );

  return (
    <div className="w-full" style={wrapperStyle}>
      {body}
    </div>
  );
}
