import { useState } from "react";
import { BubbleMenu } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import { cn } from "@secretlobby/ui";

interface InlineBubbleMenuProps {
  editor: Editor;
}

// Floating mark-toolbar that appears above any non-empty text selection.
// Buttons are styled with the page-builder theme utilities (brand-red accent
// for the active state). Built on @tiptap/extension-bubble-menu so we get
// the positioning + show/hide logic for free.
export function InlineBubbleMenu({ editor }: InlineBubbleMenuProps) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

  const isActive = (mark: string) => editor.isActive(mark);

  const openLink = () => {
    const existing = editor.getAttributes("link").href as string | undefined;
    setLinkUrl(existing ?? "");
    setLinkOpen(true);
  };

  const applyLink = () => {
    const url = linkUrl.trim();
    if (!url) {
      editor.chain().focus().unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }
    setLinkOpen(false);
  };

  const btnClass = (active: boolean) =>
    cn(
      "px-2 py-1 text-xs rounded cursor-pointer transition-colors",
      active
        ? "bg-[var(--color-brand-red)] text-white"
        : "text-theme-secondary hover:text-theme-primary hover:bg-theme-tertiary"
    );

  return (
    <BubbleMenu
      editor={editor}
      // tippy options live on the menu's `options` prop in v2.11. We accept
      // the defaults: above-selection placement, simple fade-in transition.
      shouldShow={({ editor, from, to }) => {
        if (!editor.isEditable) return false;
        return from !== to;
      }}
    >
      <div
        data-no-dnd-keyboard="true"
        className={cn(
          "flex items-center gap-1 px-1 py-1 rounded-md shadow-lg",
          "bg-theme-secondary border border-theme"
        )}
        onMouseDown={(e) => e.preventDefault()}
      >
        {linkOpen ? (
          <>
            <input
              autoFocus
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyLink();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setLinkOpen(false);
                }
              }}
              placeholder="https://"
              className="px-2 py-1 text-xs bg-transparent border border-theme rounded text-theme-primary placeholder:text-theme-muted outline-none focus:border-[var(--color-brand-red)]"
            />
            <button
              type="button"
              onClick={applyLink}
              className="px-2 py-1 text-xs rounded bg-[var(--color-brand-red)] text-white cursor-pointer"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={() => setLinkOpen(false)}
              className="px-2 py-1 text-xs rounded text-theme-secondary hover:text-theme-primary cursor-pointer"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              title="Bold (Cmd-B)"
              className={btnClass(isActive("bold"))}
              onClick={() => editor.chain().focus().toggleBold().run()}
            >
              <span className="font-bold">B</span>
            </button>
            <button
              type="button"
              title="Italic (Cmd-I)"
              className={btnClass(isActive("italic"))}
              onClick={() => editor.chain().focus().toggleItalic().run()}
            >
              <span className="italic">I</span>
            </button>
            <button
              type="button"
              title="Underline (Cmd-U)"
              className={btnClass(isActive("underline"))}
              onClick={() => editor.chain().focus().toggleUnderline().run()}
            >
              <span className="underline">U</span>
            </button>
            <button
              type="button"
              title="Inline code"
              className={btnClass(isActive("code"))}
              onClick={() => editor.chain().focus().toggleCode().run()}
            >
              <span className="font-mono">{"</>"}</span>
            </button>
            <button
              type="button"
              title="Link"
              className={btnClass(isActive("link"))}
              onClick={openLink}
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13.828 10.172a4 4 0 015.656 5.656l-3 3a4 4 0 01-5.656 0M10.172 13.828a4 4 0 01-5.656-5.656l3-3a4 4 0 015.656 0"
                />
              </svg>
            </button>
          </>
        )}
      </div>
    </BubbleMenu>
  );
}
