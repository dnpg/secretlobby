import { cn } from "@secretlobby/ui";
import type { BlockContent, QuoteBlockContent } from "../../state/types";
import { InlineEditor } from "./inline/InlineEditor";

interface QuoteBlockProps {
  content: QuoteBlockContent;
  isSelected: boolean;
  isEditing: boolean;
  onUpdate?: (content: Partial<BlockContent>) => void;
  // Notion-style hooks forwarded into the InlineEditor.
  onSlash?: (anchorEl: HTMLElement) => void;
  onEnter?: (opts: { atStart: boolean }) => void;
  pendingFocus?: boolean;
  onFocusConsumed?: () => void;
  onEmptyDelete?: () => void;
}

export function QuoteBlock({
  content,
  isSelected,
  isEditing,
  onUpdate,
  onSlash,
  onEnter,
  pendingFocus,
  onFocusConsumed,
  onEmptyDelete,
}: QuoteBlockProps) {
  const align = content.align ?? "left";
  return (
    <blockquote
      className="pl-4 italic"
      style={{
        borderLeft: "3px solid var(--color-brand-red)",
        // Cards override `--color-text-content` so quotes inside a card
        // pick up the card content color; outside a card we fall back to
        // the global secondary text token.
        color: "var(--color-text-content, var(--color-text-secondary))",
      }}
    >
      <InlineEditor
        value={content.inline}
        onChange={(next) =>
          onUpdate?.({ inline: next } as Partial<BlockContent>)
        }
        isSelected={isSelected}
        isEditing={isEditing}
        placeholder="Quote..."
        // Drop `text-base text-theme-secondary` — let the wrapper's color
        // + the canvas-root font-size flow through inheritance.
        contentClassName={cn(
          align === "center" && "text-center",
          align === "right" && "text-right"
        )}
        onSlash={onSlash}
        onEnter={onEnter}
        pendingFocus={pendingFocus}
        onFocusConsumed={onFocusConsumed}
        onEmptyDelete={onEmptyDelete}
      />
    </blockquote>
  );
}
