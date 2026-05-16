import { cn } from "@secretlobby/ui";
import type { BlockContent, ParagraphBlockContent } from "../../state/types";
import { InlineEditor } from "./inline/InlineEditor";

interface ParagraphBlockProps {
  content: ParagraphBlockContent;
  isSelected: boolean;
  isEditing: boolean;
  onUpdate?: (content: Partial<BlockContent>) => void;
  // Notion-style hooks forwarded into the InlineEditor. See InlineEditor.tsx
  // for the trigger rules (slash at the start of an empty doc; Enter without
  // shift in a non-empty doc; auto-focus on pending-focus token).
  onSlash?: (anchorEl: HTMLElement) => void;
  onEnter?: () => void;
  pendingFocus?: boolean;
  onFocusConsumed?: () => void;
}

export function ParagraphBlock({
  content,
  isSelected,
  isEditing,
  onUpdate,
  onSlash,
  onEnter,
  pendingFocus,
  onFocusConsumed,
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
      placeholder="Press '/' for commands"
      contentClassName={cn(
        "text-base text-theme-primary",
        align === "center" && "text-center",
        align === "right" && "text-right"
      )}
      onSlash={onSlash}
      onEnter={onEnter}
      pendingFocus={pendingFocus}
      onFocusConsumed={onFocusConsumed}
    />
  );
}
