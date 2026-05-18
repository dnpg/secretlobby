// =============================================================================
// LoginAutoplayToggle
// -----------------------------------------------------------------------------
// "Music will play automatically" switch rendered below the login panel on the
// password-gated lobby page. Lifted out of apps/lobby so the page-builder
// canvas can preview the toggle alongside the rest of the login template;
// the lobby and the editor render the exact same component.
//
// State is owned by the parent: pass `enabled` + `onToggle` and the toggle
// is fully interactive (real lobby) or driven by a local useState that lets
// the designer click between visual states (editor preview).
//
// Colors come from `LoginPageSettings` — same palette the LoginPanel uses,
// so the toggle stays in lock-step with whatever the designer picks in the
// LoginPageSettingsPanel.
// =============================================================================

import type { LoginPageSettings } from "./LoginPanel";

export interface LoginAutoplayToggleProps {
  /** Current toggle state. Drives the icon, label, and the `aria-checked`
   *  attribute. */
  enabled: boolean;
  /** Fires on every click. Parent owns the boolean — keeps this component
   *  stateless so the lobby + the preview share one render path. */
  onToggle: () => void;
  /** Login-page colors. The toggle's bg/border/text track the panel's
   *  palette so the two surfaces read as a single visual group. */
  settings: LoginPageSettings;
}

export function LoginAutoplayToggle({
  enabled,
  onToggle,
  settings,
}: LoginAutoplayToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={
        enabled
          ? "Autoplay is on. Press to disable autoplay"
          : "Autoplay is off. Press to enable autoplay"
      }
      onClick={onToggle}
      className="mt-4 w-full flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all duration-200 hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-offset-2"
      style={{
        backgroundColor: settings.panelBgColor,
        border: `1px solid ${settings.panelBorderColor}`,
        // Use panel border color for focus ring offset to match the background.
        // @ts-expect-error CSS custom property
        "--tw-ring-offset-color": settings.bgColor,
        "--tw-ring-color": "#3b82f6",
      }}
    >
      <span
        className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-transform duration-200"
        style={{
          backgroundColor: enabled
            ? "rgba(59, 130, 246, 0.25)"
            : "rgba(128, 128, 128, 0.25)",
        }}
        aria-hidden="true"
      >
        {enabled ? (
          <svg
            className="w-5 h-5"
            style={{ color: "#3b82f6" }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
            />
          </svg>
        ) : (
          <svg
            className="w-5 h-5"
            style={{ color: settings.textColor, opacity: 0.5 }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
            />
          </svg>
        )}
      </span>
      <span className="flex-1 text-left">
        <span
          className="block text-sm font-medium"
          style={{ color: settings.textColor }}
          aria-live="polite"
        >
          {enabled ? "Music will play automatically" : "Autoplay disabled"}
        </span>
        <span
          className="block text-xs"
          style={{ color: settings.textColor, opacity: 0.7 }}
        >
          {enabled ? "Click to enter silently" : "Click to enable autoplay"}
        </span>
      </span>
    </button>
  );
}
