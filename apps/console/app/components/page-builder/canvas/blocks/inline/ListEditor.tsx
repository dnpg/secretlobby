import { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import type { JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import { cn } from "@secretlobby/ui";
import { InlineBubbleMenu } from "./InlineBubbleMenu";

interface ListEditorProps {
  // Single Tiptap doc carrying a `bulletList` or `orderedList` root node.
  value: JSONContent;
  onChange: (next: JSONContent) => void;
  kind: "bulletList" | "orderedList";
  isSelected: boolean;
  isEditing: boolean;
}

// Per-item inline editors looked appealing but become fiddly with shared
// keyboard semantics (Enter to add item / Backspace at start to remove).
// Pragmatic shortcut: store the whole list as a Tiptap doc and let
// StarterKit's BulletList/OrderedList extensions handle item add/remove.
// We disable everything else (headings, blockquote, code-block, etc.) so the
// editor is fully inline-only with list nodes only.
export function ListEditor({
  value,
  onChange,
  kind,
  isSelected,
  isEditing,
}: ListEditorProps) {
  const editor = useEditor(
    {
      editable: isEditing && isSelected,
      extensions: [
        StarterKit.configure({
          heading: false,
          blockquote: false,
          codeBlock: false,
          horizontalRule: false,
          // BulletList + OrderedList + ListItem stay enabled.
          bulletList: kind === "bulletList" ? {} : false,
          orderedList: kind === "orderedList" ? {} : false,
        }),
        Underline,
        Link.configure({ openOnClick: false }),
        Placeholder.configure({
          placeholder: "List item...",
          showOnlyWhenEditable: true,
          includeChildren: true,
        }),
      ],
      content: value,
      onUpdate: ({ editor }) => onChange(editor.getJSON()),
    },
    [isEditing, isSelected, kind]
  );

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
      className={cn(
        "list-editor relative w-full text-theme-primary",
        // Tailwind's typography reset doesn't paint list markers by default
        // because we strip the prose plugin. Re-enable via inline classes
        // on the editor's UL/OL.
        kind === "bulletList"
          ? "[&_ul]:list-disc [&_ul]:pl-6"
          : "[&_ol]:list-decimal [&_ol]:pl-6"
      )}
    >
      <EditorContent editor={editor} className="outline-none" />
      {isEditing && isSelected && <InlineBubbleMenu editor={editor} />}
    </div>
  );
}
