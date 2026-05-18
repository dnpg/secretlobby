// =============================================================================
// LoginPagePreview
// -----------------------------------------------------------------------------
// Canvas branch rendered when the editor is in login-page mode. Wraps the
// shared <LoginPanel> in the same viewport-scaled frame the main Canvas uses
// for the lobby preview so the device-frame chrome (rounded card on tablet /
// mobile, edge-to-edge on desktop) feels identical between the two templates.
//
// All theme-driven colors live INSIDE LoginPanel (inline `style`); we still
// emit the theme CSS variables on the wrapper so any future LoginPanel
// extension that reads them works without further plumbing.
// =============================================================================

import { useMemo } from "react";
import { cn } from "@secretlobby/ui";
import { LoginPanel } from "@secretlobby/player-view";
import { generateThemeCSS } from "~/lib/theme";
import { useSwatches } from "../PageBuilderRoot";
import { usePageBuilder } from "../state/provider";
import { VIEWPORT_WIDTHS } from "../state/helpers";

export function LoginPagePreview() {
  const { state } = usePageBuilder();
  const { theme, viewport, loginPage, loginLogoImageUrl } = state;
  const { swatches, drafts } = useSwatches();

  // Same theme-style derivation Canvas.tsx uses — we re-derive locally so the
  // login-page wrapper can fall on top of the same CSS variables.
  const themeStyle = useMemo<React.CSSProperties>(() => {
    const declarations = generateThemeCSS(theme, swatches, drafts)
      .split(";")
      .map((d) => d.trim())
      .filter(Boolean);
    const result: Record<string, string> = {};
    for (const decl of declarations) {
      const idx = decl.indexOf(":");
      if (idx === -1) continue;
      const key = decl.slice(0, idx).trim();
      const value = decl.slice(idx + 1).trim();
      result[key] = value;
    }
    return result as React.CSSProperties;
  }, [theme, swatches, drafts]);

  const viewportWidth = VIEWPORT_WIDTHS[viewport];
  const isDesktop = viewport === "desktop";
  const isMobile = viewport === "mobile";

  // Mirror the main Canvas's "themed surface" wrapper. The LoginPanel itself
  // owns its own bg-color (driven by loginPage.bgColor) — these CSS variables
  // only matter for any nested theme-aware child, kept here for symmetry.
  const themedSurfaceStyle: React.CSSProperties = {
    fontSize: "var(--text-base-size, 16px)",
    ...themeStyle,
  };

  // Desktop: edge-to-edge background, no rounded device chrome.
  if (isDesktop) {
    return (
      <div className="flex-1 overflow-auto bg-theme-tertiary p-0">
        <div className="min-h-full w-full" style={themedSurfaceStyle}>
          <LoginPanel
            settings={loginPage}
            logoImageUrl={loginLogoImageUrl}
            preview
          />
        </div>
      </div>
    );
  }

  // Tablet / mobile: same rounded device-frame as the lobby preview so the
  // user understands what they're previewing at each viewport.
  return (
    <div
      className={cn(
        "flex-1 overflow-auto bg-theme-tertiary",
        isMobile ? "p-4" : "p-8"
      )}
    >
      <div
        className="mx-auto min-h-full rounded-3xl shadow-xl shadow-black/20 transition-all duration-300 overflow-hidden"
        style={{
          width: viewportWidth,
          maxWidth: "100%",
          ...themedSurfaceStyle,
        }}
      >
        <LoginPanel
          settings={loginPage}
          logoImageUrl={loginLogoImageUrl}
          preview
        />
      </div>
    </div>
  );
}
