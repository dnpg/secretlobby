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
import { ResponsiveImage, useImageTransform } from "@secretlobby/ui";
import {
  BACKGROUND_IMAGE_SET_WIDTHS,
  type ImageBackground,
} from "@secretlobby/theme";

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

/**
 * Composition of identity methods + password gate active on a lobby.
 * When LoginPanel receives this prop it renders the new multi-method
 * form (email magic link, Google sign-in, optional shared password).
 * When omitted, LoginPanel falls back to the legacy password-only
 * form — same shape the lobby's `_index` action posts to.
 */
export interface LoginAccessMode {
  /** Show an email input that, on submit, requests a magic link. */
  identityEmail: boolean;
  /** Show a "Continue with Google" anchor that links to the central
   *  OAuth proxy. The href is supplied by the caller via `googleSignInUrl`. */
  identityGoogle: boolean;
  /** Layer a shared-password input on top of the email form. The lobby
   *  password is a shared secret — "wrong password" is safe to surface,
   *  unlike invite-list membership which must stay private. */
  passwordRequired: boolean;
  /** URL the Google button links to. Required when `identityGoogle` is
   *  true and `preview` is false. */
  googleSignInUrl?: string | null;
  /** Slug of the lobby the visitor is signing into. Embedded as a hidden
   *  form field so the request-link action knows which lobby to scope
   *  the magic-link issuance to. */
  lobbySlug?: string | null;
}

export interface LoginPanelProps {
  settings: LoginPageSettings;
  /** Public URL for the logo image — resolved by the loader so we don't have
   *  to know about S3/R2 in here. Ignored when settings.logoType !== "image". */
  logoImageUrl?: string | null;
  /** Intrinsic pixel width of the logo media. Forwarded to the `<img>` so
   *  the browser can reserve the right aspect ratio before the bitmap loads
   *  (kills layout shift on first paint). Optional — when missing, no
   *  width attribute is emitted. */
  logoImageWidth?: number | null;
  /** Intrinsic pixel height of the logo media. Pairs with `logoImageWidth`. */
  logoImageHeight?: number | null;
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
  /** Override for the outer wrapper's layout classes. Defaults to
   *  `"min-h-dvh flex items-center justify-center overflow-hidden"` so
   *  the panel fills the viewport on its own. Callers that wrap LoginPanel
   *  inside a parent already controlling full-height layout (e.g. the
   *  live lobby's `<main>` that is `flex-col` + reserves a footer slot)
   *  pass `"flex-1 flex items-center justify-center overflow-hidden"` so
   *  the panel grows to fill ONLY the available content area — preventing
   *  the panel + footer combo from forcing the page to scroll when the
   *  content already fits the viewport. */
  wrapperClassName?: string;
  /** When set, render the multi-method sign-in form (email + Google +
   *  optional password) wired for /auth/request-link. When omitted, falls
   *  back to the legacy password-only form. */
  accessMode?: LoginAccessMode;
  /** When true (only meaningful with `accessMode`), render the post-submit
   *  "check your email" success state in place of the form. */
  submitted?: boolean;
  /** Number of days before the magic link expires — surfaced in the
   *  success copy. Only used with `accessMode`. */
  magicLinkExpiresInDays?: number;
  /** Optional copy override for the "We've sent you a link" success
   *  state. Lets a lobby owner customize the message via login settings
   *  in a future iteration without further LoginPanel changes. */
  submittedMessage?: string;
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
  logoImageWidth,
  logoImageHeight,
  preview = false,
  errorMessage,
  csrfToken,
  action,
  belowPanel,
  wrapperClassName = "min-h-dvh flex items-center justify-center overflow-hidden",
  accessMode,
  submitted = false,
  magicLinkExpiresInDays = 7,
  submittedMessage,
}: LoginPanelProps) {
  // Bg image gets a resolution-aware `image-set(url 1x, url 2x)` so retina
  // displays pull the higher-DPR variant — the transform pattern (Cloudflare
  // Images / r2 etc.) is supplied by the host app via ImageTransformProvider.
  const { transformUrl } = useImageTransform();
  const lp = settings;
  const title = lp.title || null;
  const description = lp.description || null;
  const showImage = lp.logoType === "image" && !!logoImageUrl;
  const showSvg = lp.logoType === "svg" && !!lp.logoSvg.trim();
  // Layered background — bgColor underneath, optional image overlay on top.
  // Matches the lobby template's themed-surface pattern so designers can drop
  // an image into the login page and have it composite the same way (with
  // the color layer showing through any transparency).
  const wrapperStyle = computeWrapperStyle(lp, transformUrl);

  // Logo + title + description block. Reused across both rendering
  // branches (legacy password-only and the new multi-method form).
  const chrome = (
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
            {...(logoImageWidth && logoImageHeight
              ? { width: logoImageWidth, height: logoImageHeight }
              : {})}
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
  );

  const errorBlock =
    !preview && errorMessage ? (
      <div
        className="mb-6 text-red-400 text-sm text-center bg-red-500/10 py-3 px-4 rounded-lg"
        role="alert"
        aria-live="polite"
      >
        {errorMessage}
      </div>
    ) : null;

  // Legacy password-only fields — used when accessMode is omitted. Keeps
  // the existing lobby_index → action-handles-password flow working
  // unchanged.
  const legacyFields = (
    <>
      {chrome}
      {errorBlock}
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

  // Multi-method content used when accessMode is set. Layout depends
  // on whether the lobby requires the shared password:
  //
  //   * passwordRequired=true  → ONE form: password field at the top,
  //     then a Google submit button (if identityGoogle) and an email
  //     field + submit (if identityEmail). The form's `intent` field
  //     carries which path the user picked. Critical for security:
  //     the password is POSTed with whichever button was clicked, so
  //     the lobby's action verifies it BEFORE either flow continues.
  //   * passwordRequired=false → Google stays an anchor (no password to
  //     gate), and the email form (if enabled) sits below.
  //
  // On submit-success the form is replaced by the "check your email"
  // message but the chrome stays so the visitor still sees the lobby
  // branding.
  const inputStyle = {
    backgroundColor: "#ffffff",
    borderColor: lp.panelBorderColor,
    color: "#111827",
  };
  const labelStyle = { color: lp.textColor, opacity: 0.85 };
  const helpStyle = { color: lp.textColor, opacity: 0.6 };

  // Google brand icon — used by both the anchor (no-password mode) and
  // the submit button (password-gated mode). Factored out so the SVG
  // doesn't appear in source 4× across the preview/live branches.
  const googleIcon = (
    <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );

  const orDivider = (
    <div
      className="my-4 flex items-center gap-3 text-xs uppercase tracking-wider"
      style={{ color: lp.textColor, opacity: 0.5 }}
    >
      <div className="flex-1 h-px" style={{ backgroundColor: lp.panelBorderColor }} />
      <span>or</span>
      <div className="flex-1 h-px" style={{ backgroundColor: lp.panelBorderColor }} />
    </div>
  );

  const passwordField = accessMode?.passwordRequired ? (
    <div>
      <label
        htmlFor="password"
        className="block text-sm font-medium mb-1"
        style={labelStyle}
      >
        Lobby password
      </label>
      <input
        type="password"
        id="password"
        name="password"
        placeholder="Shared password"
        required={!preview}
        disabled={preview}
        autoComplete="off"
        autoFocus={!preview}
        className="w-full px-4 py-3 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500"
        style={inputStyle}
      />
      <p className="mt-1 text-xs" style={helpStyle}>
        Enter the password the lobby owner shared with you to continue.
      </p>
    </div>
  ) : null;

  // Submitted "check your email" message — replaces the form in both
  // preview and live branches once the magic link has been requested.
  const submittedBlock = accessMode ? (
    <div
      className="text-sm rounded-lg p-4"
      style={{
        backgroundColor: "rgba(16, 185, 129, 0.1)",
        border: "1px solid rgba(16, 185, 129, 0.3)",
        color: lp.textColor,
      }}
    >
      {submittedMessage ??
        `If that email is authorized to access this lobby, we've sent a sign-in link. The link expires in ${magicLinkExpiresInDays} day${magicLinkExpiresInDays === 1 ? "" : "s"} and can only be used once. Check your spam folder if you don't see it.`}
    </div>
  ) : null;

  // Misconfiguration banner — only ever shows when an admin has turned
  // off ALL sign-in methods. The console mutation layer guards against
  // this on save, but render-time defense is cheap.
  const noMethodsBlock = accessMode && !accessMode.identityEmail && !accessMode.identityGoogle && !accessMode.passwordRequired ? (
    <div
      className="text-sm rounded-lg p-4 text-center"
      style={{
        backgroundColor: "rgba(234, 179, 8, 0.1)",
        border: "1px solid rgba(234, 179, 8, 0.3)",
        color: lp.textColor,
      }}
    >
      This lobby has no sign-in method configured. Please contact the lobby owner.
    </div>
  ) : null;

  // Decide what to render INSIDE the panel card.
  //
  // Legacy mode (no accessMode) keeps the password-only form posting
  // to the lobby root — same behavior the original lobby has had since
  // the password gate was introduced.
  //
  // Multi-method mode (accessMode set) splits on `passwordRequired`:
  //
  //   gated (passwordRequired=true): everything lives inside ONE
  //   form. Password input at the top, then a Google submit button
  //   (intent=google), an "or" divider, and the email field + email
  //   submit (intent=email). Whichever button the user clicks, the
  //   password POSTs alongside so the server can verify it BEFORE
  //   handing control to Google or issuing a magic link.
  //
  //   open (passwordRequired=false): Google is an anchor (no password
  //   to gate); the email form sits below as before.
  //
  // The submitted state and "no methods configured" banner share both
  // branches (declared above).
  let panelInner: React.ReactNode;
  if (accessMode) {
    if (submitted) {
      panelInner = (
        <div>
          {chrome}
          {errorBlock}
          {submittedBlock}
        </div>
      );
    } else if (noMethodsBlock) {
      panelInner = (
        <div>
          {chrome}
          {errorBlock}
          {noMethodsBlock}
        </div>
      );
    } else if (accessMode.passwordRequired) {
      // Password-gated branch: single form, password first, then
      // identity buttons. Visually consistent regardless of preview
      // mode; only the inputs/buttons go inert in preview.
      const fields = (
        <>
          {csrfToken !== undefined && csrfToken !== null && (
            <input type="hidden" name="_csrf" value={csrfToken} />
          )}
          {accessMode.lobbySlug && (
            <input type="hidden" name="lobbySlug" value={accessMode.lobbySlug} />
          )}
          {passwordField}
          {accessMode.identityGoogle && (
            <button
              type={preview ? "button" : "submit"}
              name={preview ? undefined : "intent"}
              value={preview ? undefined : "google"}
              // `formNoValidate` skips HTML5 form validation when THIS
              // button submits — necessary because the form also contains
              // the (required) email input meant for the email-submit
              // path. Without this, clicking "Continue with Google"
              // would bounce off the empty-email validation even when
              // the visitor's only intent is to use Google. The server
              // still validates the password (which is the field that
              // actually matters here).
              formNoValidate={!preview}
              onClick={preview ? (e) => e.preventDefault() : undefined}
              className={`w-full inline-flex items-center justify-center gap-3 px-4 py-3 bg-white text-gray-900 hover:bg-gray-100 font-medium rounded-lg ${preview ? "cursor-default" : "cursor-pointer"} transition-colors`}
              aria-disabled={preview ? true : undefined}
            >
              {googleIcon}
              Continue with Google
            </button>
          )}
          {accessMode.identityEmail && accessMode.identityGoogle && orDivider}
          {accessMode.identityEmail && (
            <>
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium mb-1"
                  style={labelStyle}
                >
                  Email
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  placeholder="you@example.com"
                  required={!preview}
                  disabled={preview}
                  autoComplete="email"
                  className="w-full px-4 py-3 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={inputStyle}
                />
              </div>
              <button
                type={preview ? "button" : "submit"}
                name={preview ? undefined : "intent"}
                value={preview ? undefined : "email"}
                onClick={preview ? (e) => e.preventDefault() : undefined}
                className={`lobby-login-submit w-full py-3 px-4 font-semibold focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors ${preview ? "cursor-default" : "cursor-pointer"}`}
              >
                {lp.buttonLabel || "Send sign-in link"}
              </button>
            </>
          )}
        </>
      );
      panelInner = (
        <div>
          {chrome}
          {errorBlock}
          {preview ? (
            <div className="space-y-4">{fields}</div>
          ) : (
            <Form method="post" action={action} className="space-y-4">
              {fields}
            </Form>
          )}
        </div>
      );
    } else {
      // Open branch (no shared password): Google anchor + email form,
      // each independently submittable. Anchor lives outside the email
      // <Form> so clicking it can't accidentally submit the form.
      panelInner = (
        <div>
          {chrome}
          {errorBlock}
          {accessMode.identityGoogle && (
            <a
              href={accessMode.googleSignInUrl ?? "#"}
              onClick={preview ? (e) => e.preventDefault() : undefined}
              className={`w-full mb-4 inline-flex items-center justify-center gap-3 px-4 py-3 bg-white text-gray-900 hover:bg-gray-100 font-medium rounded-lg ${preview ? "cursor-default" : "cursor-pointer"} transition-colors`}
              aria-disabled={preview ? true : undefined}
            >
              {googleIcon}
              Continue with Google
            </a>
          )}
          {accessMode.identityEmail && accessMode.identityGoogle && orDivider}
          {accessMode.identityEmail && (
            preview ? (
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium mb-1"
                    style={labelStyle}
                  >
                    Email
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    placeholder="you@example.com"
                    disabled
                    autoComplete="email"
                    className="w-full px-4 py-3 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500"
                    style={inputStyle}
                  />
                </div>
                <button
                  type="button"
                  onClick={(e) => e.preventDefault()}
                  className="lobby-login-submit w-full py-3 px-4 font-semibold focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors cursor-default"
                >
                  {lp.buttonLabel || "Send sign-in link"}
                </button>
              </div>
            ) : (
              <Form method="post" action={action} className="space-y-4">
                {csrfToken !== undefined && csrfToken !== null && (
                  <input type="hidden" name="_csrf" value={csrfToken} />
                )}
                {accessMode.lobbySlug && (
                  <input
                    type="hidden"
                    name="lobbySlug"
                    value={accessMode.lobbySlug}
                  />
                )}
                <input type="hidden" name="intent" value="email" />
                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium mb-1"
                    style={labelStyle}
                  >
                    Email
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    placeholder="you@example.com"
                    required
                    autoFocus
                    autoComplete="email"
                    className="w-full px-4 py-3 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500"
                    style={inputStyle}
                  />
                </div>
                <button
                  type="submit"
                  className="lobby-login-submit w-full py-3 px-4 font-semibold focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors cursor-pointer"
                >
                  {lp.buttonLabel || "Send sign-in link"}
                </button>
              </Form>
            )
          )}
        </div>
      );
    }
  } else if (preview) {
    // Legacy preview branch — plain wrapper so nested inputs/buttons
    // don't accidentally submit. The editor canvas sometimes lives
    // inside an outer <form> wrapper and we want zero chance of
    // bubbling a submit.
    panelInner = <div>{legacyFields}</div>;
  } else {
    panelInner = (
      <Form method="post" action={action} className="space-y-0">
        <input type="hidden" name="_csrf" value={csrfToken ?? ""} />
        {legacyFields}
      </Form>
    );
  }

  const panel = (
    <div
      className="rounded-2xl p-8 shadow-2xl border"
      style={{
        backgroundColor: lp.panelBgColor,
        borderColor: lp.panelBorderColor,
      }}
    >
      {panelInner}
    </div>
  );

  return (
    <>
      <style>{LOGIN_SUBMIT_CSS}</style>
      <div
        className={wrapperClassName}
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
//
// `transformUrl` is the resolution-aware URL transformer surfaced by
// `useImageTransform` — when present we emit an `image-set(...)` so retina
// devices pull a higher-DPR variant. Without it (e.g. tests / SSR before
// the provider is set up) we fall back to a plain `url(...)`.
function computeWrapperStyle(
  lp: LoginPageSettings,
  transformUrl: (src: string, options: { width: number }) => string
): React.CSSProperties {
  const base: React.CSSProperties = { backgroundColor: lp.bgColor };
  const img = lp.bgImage;
  if (!img) return base;
  const entries = BACKGROUND_IMAGE_SET_WIDTHS.map(({ dpr, width }) => {
    const variant = transformUrl(img.mediaUrl, { width });
    return `url(${JSON.stringify(variant)}) ${dpr}x`;
  }).join(", ");
  return {
    ...base,
    backgroundImage: `image-set(${entries})`,
    backgroundSize: img.size,
    backgroundPosition: img.position,
    backgroundRepeat: img.repeat,
    backgroundAttachment: img.attachment ?? "scroll",
  };
}
