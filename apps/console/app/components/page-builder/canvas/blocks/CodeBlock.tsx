import type { BlockContent, CodeBlockContent } from "../../state/types";
import { InlineEditor } from "./inline/InlineEditor";

interface CodeBlockProps {
  content: CodeBlockContent;
  isSelected: boolean;
  isEditing: boolean;
  onUpdate?: (content: Partial<BlockContent>) => void;
  // Notion-style hooks forwarded into the InlineEditor.
  onSlash?: (anchorEl: HTMLElement) => void;
  onEnter?: () => void;
  pendingFocus?: boolean;
  onFocusConsumed?: () => void;
}

// Inline-styled "code" chunk. Visually a single styled block but the doc is
// just a paragraph wrapped in a `code`-mark by default — the user can type
// normally; we paint the surrounding chrome.
export function CodeBlock({
  content,
  isSelected,
  isEditing,
  onUpdate,
  onSlash,
  onEnter,
  pendingFocus,
  onFocusConsumed,
}: CodeBlockProps) {
  return (
    <div
      className="rounded px-3 py-2 font-mono text-sm"
      style={{
        background: "rgba(0,0,0,0.25)",
        color: "var(--color-text-primary)",
      }}
    >
      <InlineEditor
        value={content.inline}
        onChange={(next) =>
          onUpdate?.({ inline: next } as Partial<BlockContent>)
        }
        isSelected={isSelected}
        isEditing={isEditing}
        placeholder="Inline code..."
        contentClassName="font-mono text-sm"
        onSlash={onSlash}
        onEnter={onEnter}
        pendingFocus={pendingFocus}
        onFocusConsumed={onFocusConsumed}
      />
    </div>
  );
}
