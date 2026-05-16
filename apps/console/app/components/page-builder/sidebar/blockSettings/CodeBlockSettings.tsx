// Inline-code blocks have no per-block settings — formatting happens
// inline via the bubble menu. Stub kept so BlockSettings can dispatch.
export function CodeBlockSettings() {
  return (
    <div className="text-xs text-theme-muted">
      Inline code — formatting happens on the canvas via the bubble menu.
    </div>
  );
}
