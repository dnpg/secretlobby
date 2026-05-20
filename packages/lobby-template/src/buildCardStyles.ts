// =============================================================================
// buildCardStyles
// -----------------------------------------------------------------------------
// Single source of truth for the `CardStyles` view-model PlayerView consumes.
// Both the editor's PlayerBlock and the lobby's _index loader call this so the
// published lobby renders the same per-region chrome, transport colors, and
// play/skip-button colors the designer sees in the preview canvas.
//
// `drafts` carries in-progress swatch edits from the editor's swatch picker.
// The lobby renders saved themes only, so it always passes `undefined`.
// =============================================================================

import {
  backdropFilterToCSS,
  boxPaddingToCSS,
  colorPartToCSS,
  getCardBgCSS,
  getCardBorderCSS,
  normalizeCSSValue,
  type Gradient,
  type Solid,
  type SwatchRef,
  type ThemeBackgroundColor,
  type ThemeSettings,
  type ThemeSwatch,
} from "@secretlobby/theme";
import type { CardStyles, PlayerRegionStyle } from "./PlayerView";

type Drafts = Map<string, Solid | Gradient | SwatchRef>;

// Resolve a playlist track-row background pair (`<state>BgRich` + legacy
// hex string) into a `{ bg, isGradient }` slice the caller can splat into
// per-state CardStyles fields.
//
// - Rich set → run through `colorPartToCSS` (handles solid + gradient +
//   swatch-ref), and detect "is a gradient string" by sniffing the result.
// - Rich missing → pass the legacy hex through and mark `isGradient` false.
// - Both missing → leave `bg` undefined so PlayerView falls back to its
//   hard-coded transparent / accent-mix defaults at the render site.
function resolveTrackBg(
  rich: ThemeBackgroundColor | undefined,
  legacy: string | undefined,
  swatches: ThemeSwatch[] | undefined,
  drafts: Drafts | undefined
): { bg: string | undefined; isGradient: boolean } {
  if (rich) {
    const css = colorPartToCSS(rich, swatches, drafts);
    return {
      bg: css,
      isGradient: /(linear|radial|conic)-gradient\(/i.test(css),
    };
  }
  return { bg: legacy, isGradient: false };
}

// Build a single region's chrome (bg + backdrop-filter + border + border-radius).
// `enabled` is the master toggle — PlayerView's `playerRegionStyle()` reads
// this and skips every other field when false, so callers can always emit a
// full PlayerRegionStyle without conditional fallbacks.
//
// `bg` is opt-in: pass `undefined` to render the region with no background
// fill (border/radius still apply). This keeps "I enabled the container
// but didn't pick a color" from silently painting a default solid color.
function buildRegionStyle(args: {
  enabled: boolean | undefined;
  bg: ThemeBackgroundColor | undefined;
  bgIsGradientOverride?: boolean;
  backdropFilter: Parameters<typeof backdropFilterToCSS>[0];
  borderRadius: PlayerRegionStyle["borderRadius"] | undefined;
  borderRadiusFallback: PlayerRegionStyle["borderRadius"];
  borderStyle: PlayerRegionStyle["borderStyle"] | undefined;
  borderWidth: string | undefined;
  borderColor: string | undefined;
  borderColorFallback: string;
  swatches: ThemeSwatch[] | undefined;
  drafts: Drafts | undefined;
}): PlayerRegionStyle {
  const bg =
    args.bg !== undefined
      ? colorPartToCSS(args.bg, args.swatches, args.drafts)
      : undefined;
  const bgIsGradient =
    bg !== undefined &&
    (args.bgIsGradientOverride ?? /(linear|radial|conic)-gradient\(/i.test(bg));
  return {
    enabled: args.enabled ?? false,
    bg,
    bgIsGradient,
    backdropFilter: backdropFilterToCSS(args.backdropFilter),
    borderRadius: args.borderRadius ?? args.borderRadiusFallback,
    borderStyle: args.borderStyle ?? "solid",
    borderWidth: normalizeCSSValue(args.borderWidth, "0"),
    borderColor: args.borderColor ?? args.borderColorFallback,
  };
}

export function buildCardStyles(
  theme: ThemeSettings,
  swatches?: ThemeSwatch[],
  drafts?: Drafts
): CardStyles {
  const bg = getCardBgCSS(theme, swatches, drafts);
  const border = getCardBorderCSS(theme);
  const borderWidth = normalizeCSSValue(theme.cardBorderWidth, "1px");
  const trackBgResolved = resolveTrackBg(
    theme.trackBgRich,
    theme.trackBg,
    swatches,
    drafts
  );
  const trackHoverBgResolved = resolveTrackBg(
    theme.trackHoverBgRich,
    theme.trackHoverBg,
    swatches,
    drafts
  );
  const trackActiveBgResolved = resolveTrackBg(
    theme.trackActiveBgRich,
    theme.trackActiveBg,
    swatches,
    drafts
  );
  return {
    bg,
    bgIsGradient: theme.cardBgType === "gradient",
    borderType: theme.cardBorderShow
      ? theme.cardBorderType === "gradient"
        ? ("gradient" as const)
        : ("solid" as const)
      : ("none" as const),
    borderSolid: border.style,
    borderGradient: border.borderImage ?? "",
    borderWidth,
    headingColor: theme.cardHeadingColor || theme.textPrimary,
    contentColor: theme.cardContentColor || theme.textSecondary,
    mutedColor: theme.cardMutedColor || theme.textMuted,
    visualizerUseCardBg: theme.visualizerUseCardBg ?? false,
    visualizerBorderShow: theme.visualizerBorderShow ?? false,
    visualizerBorderColor: theme.visualizerBorderColor || theme.border,
    visualizerBorderRadius: theme.visualizerBorderRadius ?? 8,
    visualizerBlendMode: theme.visualizerBlendMode || "normal",
    visualizerType: theme.visualizerType || "equalizer",
    cardBorderRadius: theme.cardBorderRadius ?? 12,
    buttonBorderRadius: theme.buttonBorderRadius ?? 24,
    playButtonBorderRadius: theme.playButtonBorderRadius ?? 50,

    playerContainer: buildRegionStyle({
      enabled: theme.playerContainerEnabled,
      bg: theme.playerBg,
      backdropFilter: theme.playerBackdropFilter,
      borderRadius: theme.playerBorderRadius,
      borderRadiusFallback: theme.cardBorderRadius ?? 12,
      borderStyle: theme.playerBorderStyle,
      borderWidth: theme.playerBorderWidth,
      borderColor: theme.playerBorderColor,
      borderColorFallback: theme.cardBorderColor || theme.border,
      swatches,
      drafts,
    }),
    visualizerContainer: buildRegionStyle({
      enabled: theme.visualizerContainerEnabled,
      // visualizerBg is stored as `string + opacity` rather than the
      // structured `ThemeBackgroundColor` the other regions use. Only
      // promote it into a bg fill when the user actually dialed the
      // opacity above 0 — otherwise pass undefined so the container
      // renders without a default `#111827` fill.
      bg:
        (theme.visualizerBgOpacity ?? 0) > 0 && theme.visualizerBg
          ? {
              type: "solid",
              color: theme.visualizerBg,
              opacity: theme.visualizerBgOpacity ?? 100,
            }
          : undefined,
      backdropFilter: theme.visualizerBackdropFilter,
      borderRadius: theme.visualizerBorderRadius,
      borderRadiusFallback: 8,
      borderStyle: theme.visualizerBorderStyle,
      borderWidth: theme.visualizerBorderWidth,
      borderColor: theme.visualizerBorderColor,
      borderColorFallback: theme.border,
      swatches,
      drafts,
    }),
    transportContainer: buildRegionStyle({
      enabled: theme.transportContainerEnabled,
      bg: theme.transportBg,
      backdropFilter: theme.transportBackdropFilter,
      borderRadius: theme.transportBorderRadius,
      borderRadiusFallback: 8,
      borderStyle: theme.transportBorderStyle,
      borderWidth: theme.transportBorderWidth,
      borderColor: theme.transportBorderColor,
      borderColorFallback: theme.cardBorderColor || theme.border,
      swatches,
      drafts,
    }),
    playlistContainer: buildRegionStyle({
      enabled: theme.playlistContainerEnabled,
      bg: theme.playlistBg,
      backdropFilter: theme.playlistBackdropFilter,
      borderRadius: theme.playlistBorderRadius,
      borderRadiusFallback: 8,
      borderStyle: theme.playlistBorderStyle,
      borderWidth: theme.playlistBorderWidth,
      borderColor: theme.playlistBorderColor,
      borderColorFallback: theme.cardBorderColor || theme.border,
      swatches,
      drafts,
    }),

    transportPaddingCSS:
      theme.transportPadding !== undefined
        ? boxPaddingToCSS(theme.transportPadding, 0)
        : undefined,
    transportTextColor: theme.transportTextColor,
    progressBarColor: theme.progressBarColor,
    progressBarActiveColor: theme.progressBarActiveColor,
    progressBarTextColor: theme.progressBarTextColor,
    ...(theme.playButtonBg
      ? (() => {
          const css = colorPartToCSS(theme.playButtonBg, swatches, drafts);
          return {
            playButtonBg: css,
            playButtonBgIsGradient: /(linear|radial|conic)-gradient\(/i.test(
              css
            ),
          };
        })()
      : {}),
    playButtonIconColor: theme.playButtonIconColor,
    playButtonBorderWidth: theme.playButtonBorderWidth,
    playButtonBorderColor: theme.playButtonBorderColor,
    playButtonBorderStyle: theme.playButtonBorderStyle,
    ...(theme.skipButtonBg
      ? (() => {
          const css = colorPartToCSS(theme.skipButtonBg, swatches, drafts);
          return {
            skipButtonBg: css,
            skipButtonBgIsGradient: /(linear|radial|conic)-gradient\(/i.test(
              css
            ),
          };
        })()
      : {}),
    skipButtonIconColor: theme.skipButtonIconColor,
    skipButtonBorderRadius: theme.skipButtonBorderRadius,
    skipButtonBorderWidth: theme.skipButtonBorderWidth,
    skipButtonBorderColor: theme.skipButtonBorderColor,
    skipButtonBorderStyle: theme.skipButtonBorderStyle,

    // Track-row colors. Text-only fields pass straight through; PlayerView
    // resolves the per-state fallback chain (e.g. trackHoverText → trackText
    // → contentColor) at the render site so legacy themes without any of
    // these set keep rendering exactly as before.
    //
    // Backgrounds: each state's `track*BgRich` is resolved via colorPartToCSS
    // when set (gradient or solid) and the matching `*BgIsGradient` flag
    // tells PlayerView whether to write the CSS into `background:` (gradient)
    // or `backgroundColor:` (solid). When the Rich field is absent the
    // legacy hex string is passed through unchanged.
    trackBg: trackBgResolved.bg,
    trackBgIsGradient: trackBgResolved.isGradient,
    trackHoverBg: trackHoverBgResolved.bg,
    trackHoverBgIsGradient: trackHoverBgResolved.isGradient,
    trackActiveBg: trackActiveBgResolved.bg,
    trackActiveBgIsGradient: trackActiveBgResolved.isGradient,
    trackText: theme.trackText,
    trackMutedText: theme.trackMutedText,
    trackNumberText: theme.trackNumberText,
    trackTimeText: theme.trackTimeText,
    trackHoverText: theme.trackHoverText,
    trackHoverNumberText: theme.trackHoverNumberText,
    trackHoverTimeText: theme.trackHoverTimeText,
    trackActiveText: theme.trackActiveText,
    trackActiveNumberText: theme.trackActiveNumberText,
    trackActiveTimeText: theme.trackActiveTimeText,

    // Playlist chrome — pass-through. PlayerView applies the gap as a CSS
    // `gap` on the track-list flexbox, and the title color falls back to
    // `headingColor` at the render site.
    playlistGap: theme.playlistGap,
    playlistTitleColor: theme.playlistTitleColor,
  };
}
