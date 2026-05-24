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
  // editing. `atStart` is true when the cursor is at position 0 of a
  // non-empty doc — the parent inserts ABOVE in that case (pushing the
  // current content down), matching text-editor feel. Tiptap's default
  // Enter-splits-paragraph is suppressed.
  // Shift+Enter still inserts a hard break for soft line wraps.
  onEnter?: (opts: { atStart: boolean }) => void;
  // When true, the editor focuses itself once on mount/update and then
  // synchronously calls `onFocusConsumed` so the parent can clear its
  // pending-focus token. Used to chase the caret onto a freshly inserted
  // paragraph after Enter.
  pendingFocus?: boolean;
  onFocusConsumed?: () => void;
  // Notion-style empty-block delete. Fires when the user presses Backspace
  // or Delete while the doc is empty (no text content). The parent removes
  // the surrounding block — the reducer auto-restores a fresh empty
  // paragraph if that was the column's last block, so the editor never
  // gets stuck in a state with no block to type into.
  onEmptyDelete?: () => void;
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
  onEmptyDelete,
}: InlineEditorProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  // Keep the latest slash/enter/change callbacks in refs so the editor's
  // ProseMirror `handleKeyDown` + `onUpdate` can read fresh closures
  // without forcing the editor to be re-created when the parent re-renders.
  const onSlashRef = useRef(onSlash);
  const onEnterRef = useRef(onEnter);
  const onChangeRef = useRef(onChange);
  const onEmptyDeleteRef = useRef(onEmptyDelete);
  onSlashRef.current = onSlash;
  onEnterRef.current = onEnter;
  onChangeRef.current = onChange;
  onEmptyDeleteRef.current = onEmptyDelete;

  // The editor is built ONCE per mount. Do NOT pass `[isEditing, isSelected]`
  // as deps: that destroys + recreates the underlying ProseMirror view on
  // every click-to-select. The old view's `destroy()` detaches DOM nodes
  // that React still has live fiber refs to, and the next commit throws
  // `NotFoundError: Failed to execute 'removeChild' on 'Node'`. Toggle
  // editable in place via `editor.setEditable()` in the effect below.
  const editor = useEditor({
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
        // Always render the hint, not only when the editor is editable.
        // Because we toggle `editor.setEditable(isEditing && isSelected)`
        // to gate writes, leaving this true would hide the placeholder
        // for every non-selected empty block — but the user expects the
        // "Press / to add blocks" affordance to stay visible on every
        // empty paragraph so they know where to click.
        showOnlyWhenEditable: false,
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
        // Enter: fire `onEnter` so the parent inserts a new paragraph.
        // When the cursor is at the very start of the doc we pass
        // `{ atStart: true }` so the parent inserts ABOVE (pushing the
        // current block down) — matches the expected text-editor feel
        // where Enter at position 0 opens a blank line above.
        // Shift+Enter still inserts a `hardBreak` (soft line break) via
        // StarterKit's HardBreak extension — we don't intercept it.
        if (event.key === "Enter" && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
          if (onEnterRef.current) {
            event.preventDefault();
            const atStart = view.state.selection.from <= 1 && view.state.doc.textContent.length > 0;
            onEnterRef.current({ atStart });
            return true;
          }
        }
        // Notion-style empty-doc delete: Backspace or Delete on an
        // empty doc removes the surrounding block. We probe via
        // `doc.textContent.length` (same cheap probe as the slash
        // branch) and bail when modifiers are held so Cmd+Backspace
        // line-clear and friends keep their browser default.
        if (
          (event.key === "Backspace" || event.key === "Delete") &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey
        ) {
          if (
            view.state.doc.textContent.length === 0 &&
            onEmptyDeleteRef.current
          ) {
            event.preventDefault();
            onEmptyDeleteRef.current();
            return true;
          }
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      onChangeRef.current(editor.getJSON());
    },
  });

  // Toggle editable in place instead of rebuilding the editor (see the long
  // comment on `useEditor` above for why rebuilding crashes React).
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.setEditable(isEditing && isSelected);
  }, [editor, isEditing, isSelected]);

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
      {/*
        BubbleMenu is mounted unconditionally for the editor's whole
        lifetime. Do NOT gate it on `isSelected` (or any per-render flag).
        @tiptap/extension-bubble-menu calls `this.element.remove()` on its
        wrapper <div> during plugin init to reparent it under tippy's
        popper — React's vdom still thinks that div is a child of the
        wrapper above, so unmounting the conditional later throws
        `NotFoundError: Failed to execute 'removeChild' on 'Node'`. Visibility
        is correctly gated by `shouldShow` (see InlineBubbleMenu) plus the
        `setEditable(...)` toggle above: when the block isn't selected, the
        editor is read-only and the menu stays hidden.
      */}
      <InlineBubbleMenu editor={editor} />
    </div>
  );
}

// Re-exported so callers can type-narrow without re-importing tiptap.
export type { Editor };
