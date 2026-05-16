import type { CSSProperties } from "react";
import { cn } from "@secretlobby/ui";
import {
  backdropFilterToCSS,
  borderRadiusToCSS,
  getCardBgCSS,
  getCardBorderCSS,
  textColorToCSSDeclarations,
  type TextColorValue,
} from "~/lib/theme";
import { CardIcon } from "../../icons";
import { useSwatches } from "../../PageBuilderRoot";
import type { CardBlockContent, ThemeSettings } from "../../state/types";
import type { SavedSwatch, ColorValue } from "~/components/color-picker";

interface CardBlockProps {
  content: CardBlockContent;
  theme: ThemeSettings;
}

// Parse a CSS length string ("1px", "0.5rem", "0", " 2px ") into its leading
// numeric value. Returns 0 for empty / undefined / non-numeric input — which
// is the correct "no width" behaviour for the border on/off check below.
function parseCSSLengthNumeric(value: string | undefined): number {
  if (!value) return 0;
  const match = String(value).trim().match(/^-?[\d.]+/);
  if (!match) return 0;
  const n = parseFloat(match[0]);
  return Number.isFinite(n) ? n : 0;
}

// True when the effective border width is positive on at least one side. The
// page-builder no longer has a "show border" toggle — width alone gates it.
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

// Resolve a text-role field down to a CSSProperties object that handles both
// solid and gradient text. For gradients we apply background-clip:text so the
// gradient shows through the glyphs; the same `style` object also sets the
// fallback `color` to "transparent" — browsers that don't honour
// background-clip:text will render transparent text, which is unreadable, so
// we set `WebkitBackgroundClip` alongside for Safari and document the
// gradient-only-on-modern-browsers caveat in the task report.
function textStyle(
  rich: TextColorValue | undefined,
  fallbackHex: string,
  swatches: SavedSwatch[],
  drafts: Map<string, ColorValue>
): CSSProperties {
  if (!rich) return { color: fallbackHex };
  // Pass swatches + drafts so swatch-refs (a gradient picked from the Saved
  // tab) resolve to their underlying gradient. Without these args the
  // resolver returns the neutral fallback and the gradient never renders.
  const decls = textColorToCSSDeclarations(
    rich,
    swatches as unknown as Parameters<typeof textColorToCSSDeclarations>[1],
    drafts as unknown as Parameters<typeof textColorToCSSDeclarations>[2]
  );
  if (!decls.backgroundImage) return { color: decls.color };
  return {
    // Both `color: transparent` and `WebkitTextFillColor: transparent` —
    // Safari prefers the latter; modern browsers honour either. With both set,
    // the gradient set via `background-image` + `background-clip: text`
    // shows through the glyphs everywhere.
    color: decls.color,
    WebkitTextFillColor: decls.color,
    backgroundImage: decls.backgroundImage,
    backgroundClip: decls.backgroundClip,
    WebkitBackgroundClip: decls.backgroundClip,
    // Use `inline-block` so the background-image stays scoped to the run of
    // text rather than spreading to the parent block.
    display: "inline-block",
  };
}

// Card block — title + WYSIWYG HTML body, optional border. Empty state shows
// a hint to encourage editors to add content.
//
// Phase 5: card-specific bg / border are gradient-aware so we can't represent
// them via CSS variables alone. We compute them inline from the effective
// theme (global + per-block overrides) and apply directly to the wrapper.
export function CardBlock({ content, theme }: CardBlockProps) {
  const hasContent = content.title || content.content;
  // Pull the live swatch library + in-progress drafts so the card's bg AND
  // text helpers can resolve swatch-refs against current data (and preview
  // un-saved swatch edits while the user types in the swatch editor).
  const { swatches, drafts } = useSwatches();

  const border = getCardBorderCSS(theme);
  // Whether the card paints a border now follows the width alone — there is
  // no separate `cardBorderShow` toggle. We compute "has positive width" from
  // the effective per-side widths first (when set), then fall back to the
  // uniform `cardBorderWidth`. Invalid / 0 / "0px" → no border.
  const showBorder = hasPositiveBorderWidth(theme);
  // Compute the backdrop-filter from THIS card's effective theme (global merged
  // with block.themeOverrides upstream). Reading the global `--card-backdrop-
  // filter` CSS variable would force every card to share the global value and
  // ignore per-block overrides, so we apply it inline instead. When the
  // resolved filter is empty / `none`, we omit the property entirely — setting
  // `backdrop-filter: none` would still spuriously announce the property to
  // the browser and (per spec corner cases) can interact with stacking
  // contexts on some engines. Absent = truly no effect.
  const backdropFilterCSS = backdropFilterToCSS(theme.cardBackdropFilter);
  const hasBackdropFilter =
    backdropFilterCSS !== "none" && backdropFilterCSS.length > 0;
  const wrapperStyle: CSSProperties = {
    background: getCardBgCSS(
      theme,
      swatches as unknown as Parameters<typeof getCardBgCSS>[1],
      drafts as unknown as Parameters<typeof getCardBgCSS>[2]
    ),
    borderRadius: borderRadiusToCSS(theme.cardBorderRadius, 12),
    color: theme.cardContentColor,
    ...(hasBackdropFilter
      ? {
          backdropFilter: backdropFilterCSS,
          WebkitBackdropFilter: backdropFilterCSS,
        }
      : {}),
    ...(showBorder
      ? {
          border: border.style,
          // Per-side overrides — only present when the user has diverged from
          // uniform. Spread directly into the style object; React's CSS prop
          // accepts these camelCase per-side fields.
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
    // Box-shadow is independent of border width — a borderless card can still
    // cast a shadow.
    ...(border.boxShadow ? { boxShadow: border.boxShadow } : {}),
  };

  return (
    <div
      className={cn("w-full p-4")}
      style={wrapperStyle}
    >
      {hasContent ? (
        <>
          {content.title && (
            <div
              className="text-sm font-medium mb-2"
              style={textStyle(
                theme.cardHeadingColorRich,
                theme.cardHeadingColor,
                swatches,
                drafts
              )}
            >
              {content.title}
            </div>
          )}
          {content.content && (
            <div
              className="text-sm prose prose-sm prose-invert max-w-none"
              style={textStyle(
                theme.cardContentColorRich,
                theme.cardContentColor,
                swatches,
                drafts
              )}
              dangerouslySetInnerHTML={{ __html: content.content }}
            />
          )}
        </>
      ) : (
        <div
          className="text-center"
          style={{ color: theme.cardMutedColor }}
        >
          <CardIcon className="w-6 h-6 mx-auto mb-1" />
          <span className="text-xs">Add content</span>
        </div>
      )}
    </div>
  );
}
