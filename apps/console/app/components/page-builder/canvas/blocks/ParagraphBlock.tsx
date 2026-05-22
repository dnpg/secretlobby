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
  onEmptyDelete?: () => void;
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
  onEmptyDelete,
}: ParagraphBlockProps) {
  const align = content.align ?? "left";
  // Wrapper style:
  //   - `fontSize` override per paragraph (falls back to the canvas-root
  //     `--text-base-size` via CSS inheritance when unset).
  //   - `color` reads `--color-text-content` so cards (which override that
  //     variable to `--card-content-color`) re-color paragraphs nested
  //     inside them; outside a card the variable is unset and we fall
  //     back to `--color-text-primary` — the global text color.
  const wrapperStyle: React.CSSProperties = {
    color: "var(--color-text-content, var(--color-text-primary))",
    ...(content.fontSize ? { fontSize: content.fontSize } : {}),
  };
  return (
    <div style={wrapperStyle} className="w-full">
      <InlineEditor
        value={content.inline}
        onChange={(next) =>
          onUpdate?.({ inline: next } as Partial<BlockContent>)
        }
        isSelected={isSelected}
        isEditing={isEditing}
        placeholder="Press / to add blocks"
        // No explicit text color — let the wrapper's `color` win via
        // CSS inheritance so the card override flows through.
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
    </div>
  );
}
