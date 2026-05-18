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
// @secretlobby/lobby-template onto the console app. The shape mirrors the
// canonical type in apps/console/app/lib/content.server.ts — keep the two
// in sync (small + stable; both are written by the same team).
//
// Submit button styling: the button reads its bg / text / border / radius
// from the GLOBAL theme button CSS vars (`--btn-bg`, `--btn-text`,
// `--btn-border-*`, `--btn-border-radius`), so it stays in lock-step with
// the same Buttons theme section that drives every other lobby button
// (LogoutButton + per-block buttons). Hover and pressed states are wired
// the same way as LogoutButton — see HOVER_STYLE_CSS below.
// =============================================================================

import { Form } from "react-router";
import { ResponsiveImage } from "@secretlobby/ui";
import type { ImageBackground } from "@secretlobby/theme";

export interface LoginPageSettings {
  title: string;
  description: string;
  logoType: "svg" | "image" | null;
  logoSvg: string;
  logoImage: string;
  /** Percentage 10–100, controls the logo's max width relative to the panel. */
  logoMaxWidth: number;
  bgColor: string;
  /** Optional background image layered ON TOP of `bgColor`. Mirrors the
   *  `theme.background.image` shape used by the lobby template so the
   *  designer gets the same size / position / repeat / overlay knobs.
   *  Absent for legacy / fresh login pages; LoginPanel only renders the
   *  image layer when this is set. */
  bgImage?: ImageBackground;
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

// All theme-var-driven styling for the submit button lives in this CSS
// block (NOT inline `style`) — inline styles outrank `:hover` / `:active`
// class rules, so an inline `background: var(--btn-bg)` would silently
// win and the button would never paint its hover / pressed state. Same
// trade-off the LogoutButton makes; keep the two patterns aligned.
//
// `background` (not `background-color`) so the var can carry a gradient
// string when the user picks a gradient swatch.
//
// `:active` maps to the `pressed` state vars (which is what `:active`
// semantically represents in CSS — the mouse-down moment).
const LOGIN_SUBMIT_CSS = `
.lobby-login-submit {
  background: var(--btn-bg);
  color: var(--btn-text);
  border-radius: var(--btn-border-radius);
  border-width: var(--btn-border-width);
  border-style: var(--btn-border-style, solid);
  border-color: var(--btn-border-color);
}
.lobby-login-submit:hover {
  background: var(--btn-hover-bg);
  color: var(--btn-hover-text);
}
.lobby-login-submit:active {
  background: var(--btn-pressed-bg);
  color: var(--btn-pressed-text);
}
`;

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
  // Layered background — bgColor underneath, optional image overlay on top.
  // Matches the lobby template's themed-surface pattern so designers can drop
  // an image into the login page and have it composite the same way (with
  // the color layer showing through any transparency).
  const wrapperStyle = computeWrapperStyle(lp);

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
          // Preview mode renders a non-interactive button (no `disabled`
          // because `:active` doesn't fire on disabled buttons in some
          // browsers, and we want the designer to see the pressed-state
          // preview when they click it inside the editor canvas).
          onClick={preview ? (e) => e.preventDefault() : undefined}
          className={`lobby-login-submit w-full py-3 px-4 font-semibold focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors ${preview ? "cursor-default" : "cursor-pointer"}`}
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
    <>
      <style>{LOGIN_SUBMIT_CSS}</style>
      <div
        className="min-h-dvh flex items-center justify-center overflow-hidden"
        style={wrapperStyle}
        aria-label="Login"
      >
        <div className="w-full max-w-md p-8">
          {panel}
          {belowPanel}
        </div>
      </div>
    </>
  );
}

// Build the outer wrapper's CSS. `bgColor` is the always-present base; when
// `bgImage` is set we add `background-image` + supporting properties so it
// layers on top exactly the way the lobby template's themed surface does.
// Kept as a free function (not a hook) so it stays cheap and trivially
// shareable between SSR and CSR — no memoisation needed for a flat object.
function computeWrapperStyle(lp: LoginPageSettings): React.CSSProperties {
  const base: React.CSSProperties = { backgroundColor: lp.bgColor };
  const img = lp.bgImage;
  if (!img) return base;
  return {
    ...base,
    backgroundImage: `url("${img.mediaUrl}")`,
    backgroundSize: img.size,
    backgroundPosition: img.position,
    backgroundRepeat: img.repeat,
    backgroundAttachment: img.attachment ?? "scroll",
  };
}
