import { useEffect, useRef } from "react";
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
  // Notion-style slash hook. Fires when the user types `/` as the first
  // character of an empty inline editor (cursor at doc start, doc effectively
  // empty). The parent uses `anchorEl` — the editor's outer DOM node — as
  // the BlockMenu's positioning anchor. The original `/` keystroke is
  // suppressed so the menu opens cleanly without inserting the character.
  onSlash?: (anchorEl: HTMLElement) => void;
  // Notion-style Enter hook. Fires when the user hits Enter (no shift) while
  // editing a NON-empty doc, so the parent can append a fresh paragraph
  // below the block. Tiptap's default Enter-splits-paragraph is suppressed.
  // Shift+Enter still inserts a hard break for soft line wraps.
  onEnter?: () => void;
  // When true, the editor focuses itself once on mount/update and then
  // synchronously calls `onFocusConsumed` so the parent can clear its
  // pending-focus token. Used to chase the caret onto a freshly inserted
  // paragraph after Enter.
  pendingFocus?: boolean;
  onFocusConsumed?: () => void;
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
  onSlash,
  onEnter,
  pendingFocus,
  onFocusConsumed,
}: InlineEditorProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  // Keep the latest slash/enter callbacks in refs so the editor's
  // ProseMirror `handleKeyDown` can read fresh closures without forcing the
  // editor to be re-created when the parent re-renders.
  const onSlashRef = useRef(onSlash);
  const onEnterRef = useRef(onEnter);
  onSlashRef.current = onSlash;
  onEnterRef.current = onEnter;

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
      editorProps: {
        handleKeyDown: (view, event) => {
          // Slash interception: only fire when the user types `/` AS THE
          // FIRST CHARACTER of an effectively-empty doc (cursor at start,
          // the doc is a single empty paragraph). `doc.textContent` is the
          // cheapest reliable "is the doc empty" probe — beats
          // `doc.size <= 2` since empty marks can shift the size by a few
          // units even when there's no visible text.
          if (event.key === "/" && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
            const isEmpty = view.state.doc.textContent.length === 0;
            const atStart = view.state.selection.from <= 2;
            if (isEmpty && atStart && onSlashRef.current && wrapperRef.current) {
              event.preventDefault();
              onSlashRef.current(wrapperRef.current);
              return true;
            }
          }
          // Enter: fire `onEnter` so the parent appends a new paragraph
          // below. Tiptap's default Enter splits the current paragraph;
          // we suppress that here because the page-builder column owns
          // block structure (no in-doc paragraph splits).
          // Shift+Enter still inserts a `hardBreak` (soft line break) via
          // StarterKit's HardBreak extension — we don't intercept it.
          if (event.key === "Enter" && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
            if (onEnterRef.current) {
              event.preventDefault();
              onEnterRef.current();
              return true;
            }
          }
          return false;
        },
      },
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

  // Pending-focus: when the parent flags this editor as the freshly created
  // paragraph after Enter, focus once and report consumption back.
  useEffect(() => {
    if (!editor || !pendingFocus) return;
    // `focus("end")` puts the caret at the doc end (the empty paragraph
    // has no content yet so this is effectively start of doc).
    editor.commands.focus("end");
    onFocusConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, pendingFocus]);

  // Auto-focus when the editor flips to editable (user selected this block).
  // Without this the user has to click a second time to put the caret inside
  // the ProseMirror view — and `handleKeyDown` doesn't fire until the view
  // is focused, so slash + Enter interception would be broken on first
  // click. Skipping when pendingFocus is true (handled above) avoids double-
  // focusing.
  useEffect(() => {
    if (!editor || !isSelected || !isEditing || pendingFocus) return;
    if (!editor.isFocused) {
      editor.commands.focus("end");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, isSelected, isEditing]);

  if (!editor) return null;

  return (
    <div
      ref={wrapperRef}
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
