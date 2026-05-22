// =============================================================================
// DividerView
// -----------------------------------------------------------------------------
// Visual horizontal rule. Picks up `--color-border` from the surrounding
// theme variables (set by the lobby's `<main style={themeVars}>` and the
// editor's themed canvas wrapper), so it sits naturally inside whatever
// surface it's dropped on. No props — the divider has no per-instance
// content; the theme drives the color and the parent's margin/spacing drives
// the gap.
// =============================================================================

export function DividerView() {
  return (
    <hr
      className="w-full my-2"
      style={{ border: "none", borderTop: "1px solid var(--color-border)" }}
    />
  );
}
