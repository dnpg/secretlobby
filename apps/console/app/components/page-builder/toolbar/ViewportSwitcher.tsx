import { cn } from "@secretlobby/ui";
import type { ViewportSize } from "../state/types";
import { DesktopIcon, MobileIcon, TabletIcon } from "../icons";

interface ViewportSwitcherProps {
  viewport: ViewportSize;
  onChange: (viewport: ViewportSize) => void;
}

// Three-up viewport toggle in the top bar. Mirrors the original inline pill
// group — keeps title attributes for the size-in-px hint.
export function ViewportSwitcher({ viewport, onChange }: ViewportSwitcherProps) {
  return (
    <div className="flex items-center gap-1 bg-theme-tertiary rounded-lg p-1">
      <button
        onClick={() => onChange("desktop")}
        className={cn(
          "p-2 rounded-md transition-colors cursor-pointer",
          viewport === "desktop"
            ? "bg-[var(--color-brand-red-muted)] text-[var(--color-brand-red)]"
            : "text-theme-secondary hover:text-theme-primary hover:bg-theme-secondary"
        )}
        title="Desktop (1440px)"
      >
        <DesktopIcon />
      </button>
      <button
        onClick={() => onChange("tablet")}
        className={cn(
          "p-2 rounded-md transition-colors cursor-pointer",
          viewport === "tablet"
            ? "bg-[var(--color-brand-red-muted)] text-[var(--color-brand-red)]"
            : "text-theme-secondary hover:text-theme-primary hover:bg-theme-secondary"
        )}
        title="Tablet (768px)"
      >
        <TabletIcon />
      </button>
      <button
        onClick={() => onChange("mobile")}
        className={cn(
          "p-2 rounded-md transition-colors cursor-pointer",
          viewport === "mobile"
            ? "bg-[var(--color-brand-red-muted)] text-[var(--color-brand-red)]"
            : "text-theme-secondary hover:text-theme-primary hover:bg-theme-secondary"
        )}
        title="Mobile (375px)"
      >
        <MobileIcon />
      </button>
    </div>
  );
}
