// =============================================================================
// LogoutButton
// -----------------------------------------------------------------------------
// Shared logout-button surface for the password-gated lobby. Lifted out of
// PlayerView so the page-builder editor preview and the published lobby
// render through the exact same component.
//
// Styling is driven ENTIRELY by the theme's button CSS variables — the
// same ones every other button in the lobby uses (`--btn-bg`, `--btn-text`,
// `--btn-border-*`, `--btn-border-radius`). That keeps the Logout button
// in lock-step with whatever the designer sets in the global Buttons
// theme section; there are no hardcoded fallbacks here. The variables
// are emitted by `generateThemeCSS` and applied on the canvas root in
// the editor + the lobby root in production.
//
// Why `background` (not `background-color`): the theme's `--btn-bg` var can
// resolve to a gradient string (e.g. `linear-gradient(...)`) when the user
// picks a gradient swatch or builds a custom gradient. `background-color`
// only accepts a single colour, so a gradient would silently fall back to
// transparent. `background` accepts both, so a solid hex and a gradient
// render correctly.
//
// Modes:
//   - preview=true  — render a plain `<button>` with `type="button"`. No
//                     <Form>; clicking does nothing. Used by the editor
//                     canvas so designers see a faithful preview (including
//                     hover / pressed states) without accidentally posting
//                     to /logout. We do NOT use `disabled` here because the
//                     `:active` pseudo doesn't fire on disabled buttons in
//                     some browsers, which would hide the pressed-state
//                     preview the designer is trying to inspect.
//   - preview=false — render the real <Form method="post" action="/logout"
//                     reloadDocument> with the CSRF hidden input. Used by
//                     the published lobby; the button actually logs out.
// =============================================================================

import { Form } from "react-router";

// Helper function to track events in both Google Analytics (gtag) and Google
// Tag Manager (dataLayer). Mirrors the implementation in PlayerView — kept
// local so this file has no dependency on PlayerView's internals.
function trackEvent(eventName: string, params: Record<string, unknown>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof (window as any).gtag === "function") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).gtag("event", eventName, params);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (Array.isArray((window as any).dataLayer)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).dataLayer.push({
      event: eventName,
      ...params,
    });
  }
}

export interface LogoutButtonProps {
  /** Required when `preview` is false — the real button posts this back to
   *  /logout. Ignored when `preview` is true. */
  csrfToken: string | null;
  /** Preview mode: button is rendered standalone (no `<Form>`) and clicking
   *  is a no-op so editor clicks don't fire a real logout. Visual treatment
   *  (including hover / pressed state) matches the real button — same theme
   *  vars, same class. */
  preview?: boolean;
  /** Extra wrapper classes — used by callers that need to position the
   *  button inside their own layout (e.g. `absolute top-4 right-4`). */
  className?: string;
}

// Every property reads from the theme's button-* CSS variables. The border
// collapses to nothing when `--btn-border-style` resolves to `none`, so the
// legacy borderless default keeps working without a separate `show` gate.
// `background` (not `background-color`) so the var can carry a gradient
// string — see file header for the full reasoning.
const buttonStyle: React.CSSProperties = {
  background: "var(--btn-bg)",
  color: "var(--btn-text)",
  borderRadius: "var(--btn-border-radius)",
  borderWidth: "var(--btn-border-width)",
  borderStyle: "var(--btn-border-style, solid)",
  borderColor: "var(--btn-border-color)",
};

// Hover and pressed CSS lives in a sibling <style> tag rather than inline
// `style` because React's inline styles can't express pseudo-classes. Using
// `background` here (not `background-color`) for the same gradient-support
// reason as the base style. The selectors target a stable class so the
// rules apply to every LogoutButton instance regardless of host app
// (console canvas preview + published lobby) without requiring each
// consumer to import a separate stylesheet.
//
// `:active` maps to the `pressed` state vars (which is what `:active`
// semantically represents in CSS — the mouse-down moment). The `active`
// state vars (`--btn-active-*`) are reserved for selected/toggled buttons
// like nav links and aren't surfaced here because LogoutButton is never
// "active" in that sense.
const HOVER_STYLE_CSS = `
.lobby-logout-button:hover {
  background: var(--btn-hover-bg);
  color: var(--btn-hover-text);
}
.lobby-logout-button:active {
  background: var(--btn-pressed-bg);
  color: var(--btn-pressed-text);
}
`;

export function LogoutButton({
  csrfToken,
  preview = false,
  className,
}: LogoutButtonProps) {
  if (preview) {
    return (
      <>
        <style>{HOVER_STYLE_CSS}</style>
        <button
          type="button"
          // No-op handler — the preview button is non-interactive but we
          // still want the visual :hover / :active states for the designer.
          onClick={(e) => e.preventDefault()}
          className={`lobby-logout-button px-4 py-2 text-sm cursor-default transition-colors ${className ?? ""}`.trim()}
          style={buttonStyle}
          aria-label="Logout (preview)"
        >
          Logout
        </button>
      </>
    );
  }

  return (
    <>
      <style>{HOVER_STYLE_CSS}</style>
      <Form
        method="post"
        action="/logout"
        reloadDocument
        className={className}
      >
        <input type="hidden" name="_csrf" value={csrfToken ?? ""} />
        <button
          type="submit"
          className="lobby-logout-button px-4 py-2 text-sm transition-colors cursor-pointer"
          style={buttonStyle}
          onClick={() => {
            trackEvent("logout", {
              event_category: "authentication",
              method: "button_click",
            });
          }}
        >
          Logout
        </button>
      </Form>
    </>
  );
}
