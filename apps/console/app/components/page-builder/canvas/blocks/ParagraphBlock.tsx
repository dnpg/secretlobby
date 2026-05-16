import { cn } from "@secretlobby/ui";
import type { BlockContent, ParagraphBlockContent } from "../../state/types";
import { InlineEditor } from "./inline/InlineEditor";

interface ParagraphBlockProps {
  content: ParagraphBlockContent;
  isSelected: boolean;
  isEditing: boolean;
  onUpdate?: (content: Partial<BlockContent>) => void;
}

export function ParagraphBlock({
  content,
  isSelected,
  isEditing,
  onUpdate,
}: ParagraphBlockProps) {
  const align = content.align ?? "left";
  return (
    <InlineEditor
      value={content.inline}
      onChange={(next) =>
        onUpdate?.({ inline: next } as Partial<BlockContent>)
      }
      isSelected={isSelected}
      isEditing={isEditing}
      placeholder="Type here..."
      contentClassName={cn(
        "text-base text-theme-primary",
        align === "center" && "text-center",
        align === "right" && "text-right"
      )}
    />
  );
}
