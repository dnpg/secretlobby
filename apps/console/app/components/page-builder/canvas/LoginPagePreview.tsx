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

import { useMemo, useState } from "react";
import { cn } from "@secretlobby/ui";
import {
  LoginAutoplayToggle,
  LoginPanel,
  SecretLobbyFooter,
} from "@secretlobby/lobby-template";
import { generateThemeCSS } from "~/lib/theme";
import { useSwatches } from "../PageBuilderRoot";
import { usePageBuilder } from "../state/provider";
import { VIEWPORT_WIDTHS } from "../state/helpers";

export function LoginPagePreview() {
  const { state } = usePageBuilder();
  const {
    theme,
    viewport,
    loginPage,
    loginLogoImageUrl,
    loginLogoImageWidth,
    loginLogoImageHeight,
    lobbyAccess,
  } = state;

  // Only render the multi-method preview when at least one identity
  // method is on. Otherwise the legacy password-only form is the
  // visitor experience — LoginPanel renders that when accessMode is
  // omitted, matching production behavior.
  const accessMode =
    lobbyAccess.identityEmail || lobbyAccess.identityGoogle
      ? {
          identityEmail: lobbyAccess.identityEmail,
          identityGoogle: lobbyAccess.identityGoogle,
          passwordRequired: lobbyAccess.passwordRequired,
          // Preview mode renders the Google anchor inert (the panel's
          // preview prop suppresses navigation), so the URL doesn't
          // need to be real.
          googleSignInUrl: null,
        }
      : undefined;
  const { swatches, drafts } = useSwatches();
  // Designer-facing toggle for the "Music will play automatically" preview.
  // Defaults to `true` to match the published lobby's initial state (see
  // apps/lobby/app/routes/_index.tsx — autoplayEnabled starts true). The
  // designer can click the toggle to inspect both visual states; the value
  // doesn't persist and never reaches the lobby session.
  const [autoplayPreview, setAutoplayPreview] = useState(true);

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
  // When the login page has a bgImage, apply it to the wrapper so the
  // preview shows the same full-bleed image the live lobby renders.
  const bgImageStyle: React.CSSProperties = loginPage.bgImage
    ? {
        backgroundImage: `url(${JSON.stringify(loginPage.bgImage.mediaUrl)})`,
        backgroundSize: loginPage.bgImage.size ?? "cover",
        backgroundPosition: loginPage.bgImage.position ?? "center",
        backgroundRepeat: loginPage.bgImage.repeat ?? "no-repeat",
        backgroundAttachment: loginPage.bgImage.attachment ?? "scroll",
      }
    : {};
  const themedSurfaceStyle: React.CSSProperties = {
    fontSize: "var(--text-base-size, 16px)",
    ...themeStyle,
    ...bgImageStyle,
  };

  // Desktop: edge-to-edge background, no rounded device chrome.
  if (isDesktop) {
    return (
      <div className="flex-1 overflow-auto bg-theme-tertiary p-0">
        <div className="min-h-full w-full" style={themedSurfaceStyle}>
          <LoginPanel
            settings={loginPage}
            logoImageUrl={loginLogoImageUrl}
            logoImageWidth={loginLogoImageWidth}
            logoImageHeight={loginLogoImageHeight}
            preview
            accessMode={accessMode}
            belowPanel={
              <LoginAutoplayToggle
                enabled={autoplayPreview}
                onToggle={() => setAutoplayPreview((v) => !v)}
                settings={loginPage}
              />
            }
          />
          <SecretLobbyFooter />
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
          logoImageWidth={loginLogoImageWidth}
          logoImageHeight={loginLogoImageHeight}
          preview
          accessMode={accessMode}
        />
        <SecretLobbyFooter />
      </div>
    </div>
  );
}
