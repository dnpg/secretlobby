import { useEffect, useRef, useState } from "react";
import { BubbleMenu } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import { cn } from "@secretlobby/ui";

// Structural subset of a tippy.js Instance. We can't import `tippy.js`
// directly here — it's a transitive dependency of @tiptap/extension-bubble-
// menu and isn't listed in this app's package.json — so we declare just the
// shape we touch (popperInstance.update on link-toggle reflow).
type TippyInstanceLike = {
  popperInstance: { update: () => void } | null | undefined;
};

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
  // Capture the underlying tippy instance so we can ask popper to recompute
  // when the menu's inner content reflows (e.g. expanding into the link
  // input view). Tippy's MutationObserver doesn't watch size changes, so
  // without an explicit `update()` the popover keeps its pre-expansion
  // position and slides off the right edge of the viewport.
  const tippyRef = useRef<TippyInstanceLike | null>(null);

  useEffect(() => {
    const inst = tippyRef.current;
    if (!inst) return;
    inst.popperInstance?.update();
  }, [linkOpen]);

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

  // Matches the SortableBlock top-left toolbar palette: editor-chrome only
  // (light/dark mode driven by `.dark` on <html>), never theme tokens — so
  // bold/italic/link buttons stay legible regardless of the lobby theme.
  const btnClass = (active: boolean) =>
    cn(
      "px-2 py-1 text-xs rounded cursor-pointer transition-colors",
      active
        ? "bg-[var(--color-brand-red)] text-white"
        : "text-black dark:text-neutral-300 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800"
    );

  return (
    <BubbleMenu
      editor={editor}
      // Append to <body> + viewport-bound flip/preventOverflow so the menu
      // (and the link input it expands into) shifts horizontally and flips
      // vertically whenever the selection is near a viewport edge. Without
      // these explicit popper modifiers tippy uses the offset parent's box
      // as its boundary, which clips the popover at the canvas edge in
      // narrow viewports.
      tippyOptions={{
        placement: "top",
        appendTo: () => document.body,
        onCreate: (instance) => {
          tippyRef.current = instance;
        },
        onDestroy: () => {
          tippyRef.current = null;
        },
        popperOptions: {
          modifiers: [
            {
              name: "flip",
              options: {
                fallbackPlacements: ["bottom", "top-start", "top-end"],
                boundary: "viewport",
                padding: 8,
              },
            },
            {
              name: "preventOverflow",
              options: {
                boundary: "viewport",
                padding: 8,
                altAxis: true,
              },
            },
          ],
        },
      }}
      shouldShow={({ editor, from, to }) => {
        if (!editor.isEditable) return false;
        return from !== to;
      }}
    >
      <div
        data-no-dnd-keyboard="true"
        // Same chrome as the per-block toolbar in SortableBlock: solid
        // white/dark-neutral background with a 1px border + shadow ring, so
        // the menu (and the link popover) never bleeds the lobby theme
        // through.
        className={cn(
          "flex items-center gap-1 px-1 py-1 rounded-md",
          "bg-white dark:bg-neutral-900",
          "text-black dark:text-white",
          "border border-neutral-200 dark:border-neutral-800",
          "shadow-md ring-1 ring-black/10 dark:ring-white/10"
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
              className="px-2 py-1 text-xs bg-transparent border border-neutral-200 dark:border-neutral-800 rounded text-black dark:text-white placeholder:text-neutral-500 dark:placeholder:text-neutral-400 outline-none focus:border-[var(--color-brand-red)]"
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
              className="px-2 py-1 text-xs rounded text-black dark:text-neutral-300 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
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
