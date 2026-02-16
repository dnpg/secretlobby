import { Link, useLocation } from "react-router";

/**
 * Bar shown when viewing a lobby in preview mode (e.g. from console).
 * Lets the user exit preview at any time; exiting clears the preview cookie so the next load shows normal behavior (e.g. not found if unpublished).
 */
export function PreviewBar() {
  const location = useLocation();
  const redirectTo = location.pathname || "/";

  return (
    <div
      role="banner"
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between gap-4 px-4 py-2 bg-amber-500/95 text-gray-900 text-sm font-medium shadow-md"
      style={{ minHeight: 44 }}
    >
      <span>You're previewing this lobby</span>
      <Link
        to={`/exit-preview?redirect=${encodeURIComponent(redirectTo)}`}
        className="shrink-0 px-3 py-1.5 rounded-md bg-gray-900 text-amber-100 hover:bg-gray-800 transition"
      >
        Exit preview
      </Link>
    </div>
  );
}
