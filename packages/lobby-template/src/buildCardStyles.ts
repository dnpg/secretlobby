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

// Build a single region's chrome (bg + backdrop-filter + border + border-radius).
// `enabled` is the master toggle — PlayerView's `playerRegionStyle()` reads
// this and skips every other field when false, so callers can always emit a
// full PlayerRegionStyle without conditional fallbacks.
function buildRegionStyle(args: {
  enabled: boolean | undefined;
  bg: ThemeBackgroundColor | undefined;
  bgFallback: ThemeBackgroundColor;
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
  const bgPart = args.bg ?? args.bgFallback;
  const bg = colorPartToCSS(bgPart, args.swatches, args.drafts);
  const bgIsGradient =
    args.bgIsGradientOverride ??
    /(linear|radial|conic)-gradient\(/i.test(bg);
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
      bgFallback: {
        type: "solid",
        color: theme.cardBgColor || "#111827",
        opacity: 100,
      },
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
      bg: {
        type: "solid",
        color: theme.visualizerBg || "#111827",
        opacity: theme.visualizerBgOpacity ?? 100,
      },
      bgFallback: { type: "solid", color: "#111827", opacity: 100 },
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
      bgFallback: { type: "solid", color: "#000000", opacity: 0 },
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
      bgFallback: { type: "solid", color: "#1f2937", opacity: 0 },
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
  };
}
