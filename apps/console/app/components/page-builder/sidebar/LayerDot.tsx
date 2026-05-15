import { cn } from "@secretlobby/ui";
import { LAYER_COLORS } from "../state/helpers";

interface LayerDotProps {
  tone: "section" | "column" | "block";
}

// Color-coded layer accent dot used in the LeftRail accordion.
export function LayerDot({ tone }: LayerDotProps) {
  return (
    <span
      className={cn("inline-block w-2 h-2 rounded-full flex-shrink-0", LAYER_COLORS[tone].accent)}
      aria-hidden
    />
  );
}
