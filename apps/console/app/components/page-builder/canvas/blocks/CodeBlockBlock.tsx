import type {
  BlockContent,
  CodeBlockBlockContent,
} from "../../state/types";

interface CodeBlockBlockProps {
  content: CodeBlockBlockContent;
  isSelected: boolean;
  isEditing: boolean;
  onUpdate?: (content: Partial<BlockContent>) => void;
}

// Multi-line `<pre><code>` block. We use a styled `<textarea>` rather than a
// Tiptap CodeBlock extension because the latter brings its own block-level
// node and we want the canvas column to own block structure. A textarea is
// also closer to user expectations for code — Tab inserts indentation, the
// browser handles line wrapping, no markdown surprises.
export function CodeBlockBlock({
  content,
  isSelected,
  isEditing,
  onUpdate,
}: CodeBlockBlockProps) {
  const editable = isEditing && isSelected;
  return (
    <pre
      data-no-dnd-keyboard="true"
      className="rounded p-3 overflow-x-auto"
      style={{
        background: "rgba(0,0,0,0.45)",
        color: "var(--color-text-primary)",
      }}
    >
      <textarea
        value={content.text}
        onChange={(e) =>
          onUpdate?.({ text: e.target.value } as Partial<BlockContent>)
        }
        readOnly={!editable}
        spellCheck={false}
        placeholder={content.language ? `${content.language}…` : "Code..."}
        className="w-full min-h-[3rem] bg-transparent outline-none resize-y font-mono text-sm text-theme-primary placeholder:text-theme-muted"
      />
    </pre>
  );
}
