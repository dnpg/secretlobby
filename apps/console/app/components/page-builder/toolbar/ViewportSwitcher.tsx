import { cn } from "@secretlobby/ui";
import type { ViewportSize } from "../state/types";
import { DesktopIcon, MobileIcon, TabletIcon } from "../icons";

interface ViewportSwitcherProps {
  viewport: ViewportSize;
  onChange: (viewport: ViewportSize) => void;
}

// Three-up viewport toggle in the top bar. Visually mirrors ColorModeToggle
// so the two controls read as a matched pair.
export function ViewportSwitcher({ viewport, onChange }: ViewportSwitcherProps) {
  const buttonBase =
    "p-1 rounded-lg transition cursor-pointer [&_svg]:w-4 [&_svg]:h-4";
  const idle =
    "text-theme-secondary hover:text-theme-primary hover:bg-(--color-accent-muted)";
  const active = "btn-primary";

  return (
    <div className="flex items-center bg-theme-secondary rounded-lg p-1.5 gap-1 border border-theme">
      <button
        type="button"
        onClick={() => onChange("desktop")}
        className={cn(buttonBase, viewport === "desktop" ? active : idle)}
        title="Desktop (1440px)"
      >
        <DesktopIcon />
      </button>
      <button
        type="button"
        onClick={() => onChange("tablet")}
        className={cn(buttonBase, viewport === "tablet" ? active : idle)}
        title="Tablet (768px)"
      >
        <TabletIcon />
      </button>
      <button
        type="button"
        onClick={() => onChange("mobile")}
        className={cn(buttonBase, viewport === "mobile" ? active : idle)}
        title="Mobile (375px)"
      >
        <MobileIcon />
      </button>
    </div>
  );
}
