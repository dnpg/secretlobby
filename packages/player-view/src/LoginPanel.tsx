// =============================================================================
// LoginPanel
// -----------------------------------------------------------------------------
// Shared password-gate panel for the published lobby + the page-builder editor
// preview. Lifted out of apps/lobby/app/routes/_index.tsx so both contexts
// render the exact same component.
//
// Theme-driven colors are applied via inline `style` (not Tailwind classes)
// because the console and lobby apps don't ship identical Tailwind configs —
// inline keeps the visual treatment portable.
//
// `LoginPageSettings` is defined locally to avoid a workspace dep from
// @secretlobby/player-view onto the console app. The shape mirrors the
// canonical type in apps/console/app/lib/content.server.ts — keep the two
// in sync (small + stable; both are written by the same team).
// =============================================================================

import { Form } from "react-router";
import { ResponsiveImage } from "@secretlobby/ui";

export interface LoginPageSettings {
  title: string;
  description: string;
  logoType: "svg" | "image" | null;
  logoSvg: string;
  logoImage: string;
  /** Percentage 10–100, controls the logo's max width relative to the panel. */
  logoMaxWidth: number;
  bgColor: string;
  panelBgColor: string;
  panelBorderColor: string;
  textColor: string;
  buttonLabel: string;
}

export interface LoginPanelProps {
  settings: LoginPageSettings;
  /** Public URL for the logo image — resolved by the loader so we don't have
   *  to know about S3/R2 in here. Ignored when settings.logoType !== "image". */
  logoImageUrl?: string | null;
  /** When true, render a non-interactive preview (used by the editor canvas):
   *  password input disabled, submit button is a disabled `<button>`, no real
   *  POST. When false (default), render the live <Form>. */
  preview?: boolean;
  /** Error message rendered above the form. Only shown when `preview` is
   *  false — preview never displays a stale error. */
  errorMessage?: string | null;
  /** CSRF token for the form. Required when `preview` is false. */
  csrfToken?: string | null;
  /** POST target for the form. Defaults to the current route. */
  action?: string;
  /** Optional content rendered BELOW the panel card but INSIDE the bg-color
   *  wrapper. The lobby app uses this for the audio-autoplay toggle. */
  belowPanel?: React.ReactNode;
}

export function LoginPanel({
  settings,
  logoImageUrl,
  preview = false,
  errorMessage,
  csrfToken,
  action,
  belowPanel,
}: LoginPanelProps) {
  const lp = settings;
  const title = lp.title || null;
  const description = lp.description || null;
  const showImage = lp.logoType === "image" && !!logoImageUrl;
  const showSvg = lp.logoType === "svg" && !!lp.logoSvg.trim();

  // Common inner content — logo block + heading + description + error +
  // password input + submit button. Used by both the preview (no Form wrapper)
  // and the live (Form wrapper) branches.
  const fields = (
    <>
      <div className="text-center mb-8">
        {showImage && logoImageUrl && (
          <div className="flex justify-center mb-4 w-full">
            <ResponsiveImage
              src={logoImageUrl}
              alt={title || "Logo"}
              widths={[200, 400, 600, 800]}
              sizes={`(min-width: 448px) ${Math.round(
                384 * (lp.logoMaxWidth || 50) / 100
              )}px, calc((100vw - 64px) * ${(lp.logoMaxWidth || 50) / 100})`}
              className="object-contain"
              style={{ maxWidth: `${lp.logoMaxWidth || 50}%` }}
            />
          </div>
        )}
        {showSvg && (
          <div
            className="flex justify-center mb-4 w-full"
            style={{ maxWidth: `${lp.logoMaxWidth || 50}%`, margin: "0 auto 1rem" }}
            // The user-supplied SVG can include style/path attributes; we
            // trust admin-authored content here. Same pattern as the legacy
            // login-page renderer.
            dangerouslySetInnerHTML={{ __html: lp.logoSvg }}
          />
        )}
        {title && (
          <h1 className="text-2xl font-bold" style={{ color: lp.textColor }}>
            {title}
          </h1>
        )}
        {description && (
          <p className="mt-2" style={{ color: lp.textColor, opacity: 0.7 }}>
            {description}
          </p>
        )}
      </div>

      {!preview && errorMessage && (
        <div
          className="mb-6 text-red-400 text-sm text-center bg-red-500/10 py-3 px-4 rounded-lg"
          role="alert"
          aria-live="polite"
        >
          {errorMessage}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium mb-1"
            style={{ color: lp.textColor, opacity: 0.85 }}
          >
            Password
          </label>
          <input
            type="password"
            id="password"
            name="password"
            placeholder="Enter the password"
            required={!preview}
            disabled={preview}
            autoFocus={!preview}
            className="w-full px-4 py-3 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500"
            style={{
              backgroundColor: "#ffffff",
              borderColor: lp.panelBorderColor,
              color: "#111827",
            }}
          />
        </div>
        <button
          type={preview ? "button" : "submit"}
          disabled={preview}
          className="w-full py-3 px-4 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
        >
          {lp.buttonLabel || "Enter Lobby"}
        </button>
      </div>
    </>
  );

  const panel = (
    <div
      className="rounded-2xl p-8 shadow-2xl border"
      style={{
        backgroundColor: lp.panelBgColor,
        borderColor: lp.panelBorderColor,
      }}
    >
      {preview ? (
        // Plain wrapper so nested inputs/buttons don't accidentally submit.
        // We don't even mount a <form> in preview mode — the editor canvas
        // sometimes lives inside an outer <form> wrapper and we want zero
        // chance of bubbling a submit.
        <div>{fields}</div>
      ) : (
        <Form method="post" action={action} className="space-y-0">
          <input type="hidden" name="_csrf" value={csrfToken ?? ""} />
          {fields}
        </Form>
      )}
    </div>
  );

  return (
    <div
      className="min-h-dvh flex items-center justify-center overflow-hidden"
      style={{ backgroundColor: lp.bgColor }}
      aria-label="Login"
    >
      <div className="w-full max-w-md p-8">
        {panel}
        {belowPanel}
      </div>
    </div>
  );
}
