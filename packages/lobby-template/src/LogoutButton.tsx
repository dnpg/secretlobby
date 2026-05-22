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
import { trackEvent } from "./analytics";

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

// All theme-var-driven properties live in a sibling <style> block rather
// than React's inline `style`. Inline styles have higher specificity than
// `:hover` / `:active` class rules, so an inline `background: var(--btn-bg)`
// would silently win over `.cls:hover { background: var(--btn-hover-bg) }`
// and the button would never paint its hover / pressed state. Keeping every
// theme-var read in CSS lets the pseudo-classes do their job.
//
// The selectors target a stable class so the rules apply to every
// LogoutButton instance regardless of host app (console canvas preview +
// published lobby) without requiring each consumer to import a separate
// stylesheet.
//
// `:active` maps to the `pressed` state vars (which is what `:active`
// semantically represents in CSS — the mouse-down moment). The `active`
// state vars (`--btn-active-*`) are reserved for selected/toggled buttons
// like nav links and aren't surfaced here because LogoutButton is never
// "active" in that sense.
//
// `background` (not `background-color`) so the var can carry a gradient
// string — `--btn-bg` resolves to `linear-gradient(...)` when the user
// picks a gradient swatch, and `background-color` only accepts a single
// colour, so a gradient would silently fall back to transparent.
const LOGOUT_BUTTON_CSS = `
.lobby-logout-button {
  background: var(--btn-bg);
  color: var(--btn-text);
  border-radius: var(--btn-border-radius);
  border-width: var(--btn-border-width);
  border-style: var(--btn-border-style, solid);
  border-color: var(--btn-border-color);
}
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
        <style>{LOGOUT_BUTTON_CSS}</style>
        <button
          type="button"
          // No-op handler — the preview button is non-interactive but we
          // still want the visual :hover / :active states for the designer.
          onClick={(e) => e.preventDefault()}
          className={`lobby-logout-button px-4 py-2 text-sm cursor-default transition-colors ${className ?? ""}`.trim()}
          aria-label="Logout (preview)"
        >
          Logout
        </button>
      </>
    );
  }

  return (
    <>
      <style>{LOGOUT_BUTTON_CSS}</style>
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
