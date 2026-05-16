import { cn } from "@secretlobby/ui";
import type { BlockContent, QuoteBlockContent } from "../../state/types";
import { InlineEditor } from "./inline/InlineEditor";

interface QuoteBlockProps {
  content: QuoteBlockContent;
  isSelected: boolean;
  isEditing: boolean;
  onUpdate?: (content: Partial<BlockContent>) => void;
}

export function QuoteBlock({
  content,
  isSelected,
  isEditing,
  onUpdate,
}: QuoteBlockProps) {
  const align = content.align ?? "left";
  return (
    <blockquote
      className="pl-4 italic"
      style={{ borderLeft: "3px solid var(--color-brand-red)" }}
    >
      <InlineEditor
        value={content.inline}
        onChange={(next) =>
          onUpdate?.({ inline: next } as Partial<BlockContent>)
        }
        isSelected={isSelected}
        isEditing={isEditing}
        placeholder="Quote..."
        contentClassName={cn(
          "text-base text-theme-secondary",
          align === "center" && "text-center",
          align === "right" && "text-right"
        )}
      />
    </blockquote>
  );
}
