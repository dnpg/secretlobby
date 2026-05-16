import { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import type { JSONContent, Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import { cn } from "@secretlobby/ui";
import { InlineBubbleMenu } from "./InlineBubbleMenu";

interface InlineEditorProps {
  value: JSONContent;
  onChange: (next: JSONContent) => void;
  isSelected: boolean;
  isEditing: boolean;
  placeholder: string;
  className?: string;
  // Optional style applied to the editor's content root — used by heading
  // blocks to map level → tailwind font size + weight.
  contentClassName?: string;
}

// Per-block Tiptap editor configured for inline content only. StarterKit's
// block-level extensions (heading, lists, blockquote, codeBlock,
// horizontalRule) are disabled — the page-builder column owns block
// structure. We keep marks (bold/italic/code) plus the underline + link
// extensions, and the document is always a single paragraph wrapper.
//
// `data-no-dnd-keyboard` on the wrapper tells the EditorAware* sensors to
// ignore key + pointer events that originate here, so typing inside an
// editor never starts a dnd-kit drag on the surrounding SortableBlock.
export function InlineEditor({
  value,
  onChange,
  isSelected,
  isEditing,
  placeholder,
  className,
  contentClassName,
}: InlineEditorProps) {
  const editor = useEditor(
    {
      editable: isEditing && isSelected,
      extensions: [
        StarterKit.configure({
          // Disable every block-level node — the page-builder column owns
          // those. Keep marks + paragraph + the inline `code` mark.
          heading: false,
          bulletList: false,
          orderedList: false,
          listItem: false,
          blockquote: false,
          codeBlock: false,
          horizontalRule: false,
          // History is per-block — fine, since each editor has its own
          // undo stack scoped to that block.
        }),
        Underline,
        Link.configure({
          openOnClick: false,
          HTMLAttributes: { class: "inline-link" },
        }),
        Placeholder.configure({
          placeholder,
          showOnlyWhenEditable: true,
        }),
      ],
      content: value,
      onUpdate: ({ editor }) => {
        onChange(editor.getJSON());
      },
    },
    // Recreate when the editable flag flips so Tiptap re-evaluates readonly.
    [isEditing, isSelected]
  );

  // Hydrate from out-of-band updates (e.g. switching blocks); skip when
  // structurally equal to avoid the setContent → onUpdate echo loop.
  useEffect(() => {
    if (!editor) return;
    const current = editor.getJSON();
    if (JSON.stringify(current) === JSON.stringify(value)) return;
    editor.commands.setContent(value, false);
  }, [editor, value]);

  if (!editor) return null;

  return (
    <div
      data-no-dnd-keyboard="true"
      className={cn("inline-editor relative w-full", className)}
    >
      <EditorContent
        editor={editor}
        className={cn(
          "inline-editor-content outline-none w-full",
          contentClassName
        )}
      />
      {isEditing && isSelected && <InlineBubbleMenu editor={editor} />}
    </div>
  );
}

// Re-exported so callers can type-narrow without re-importing tiptap.
export type { Editor };
