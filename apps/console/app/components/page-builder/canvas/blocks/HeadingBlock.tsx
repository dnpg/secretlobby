import { useMemo } from "react";
import { HEADING_LEVEL_CLASSES } from "@secretlobby/lobby-template";
import type {
  BlockContent,
  HeadingBlockContent,
  InlineDoc,
} from "../../state/types";
import { InlineEditor } from "./inline/InlineEditor";

interface HeadingBlockProps {
  content: HeadingBlockContent;
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

// Heading-level typography mapping is shared with the lobby's static
// HeadingView in `@secretlobby/lobby-template` — kept in one place so the
// editor and the published lobby paint identically. Headings render as
// regular `<div role="heading" aria-level={N}>` wrappers (the InlineEditor's
// root is a StarterKit paragraph) because rendering the editor inside an
// `<h1>` would force Tiptap to swap to the Heading node and we want the doc
// to stay inline-only.

export function HeadingBlock({
  content,
  isSelected,
  isEditing,
  onUpdate,
  onSlash,
  onEnter,
  pendingFocus,
  onFocusConsumed,
  onEmptyDelete,
}: HeadingBlockProps) {
  const level = content.level ?? 1;

  // The InlineEditor has `heading: false` in its Tiptap config — it only
  // supports paragraph nodes. Migrated content may store `{ type: "heading" }`
  // nodes (for the lobby's TiptapMirror which renders `<h5>`), so we
  // normalize them to `{ type: "paragraph" }` before passing to the editor.
  // The visual heading style comes from the CSS classes on the wrapper.
  const editorValue = useMemo((): InlineDoc => {
    const doc = content.inline;
    if (!doc || !Array.isArray(doc.content)) return doc;
    const needsNormalize = doc.content.some(
      (n: { type?: string }) => n.type === "heading"
    );
    if (!needsNormalize) return doc;
    return {
      ...doc,
      content: doc.content.map((n) => {
        const node = n as { type?: string; [k: string]: unknown };
        if (node.type !== "heading") return n;
        const { attrs: _attrs, ...rest } = node;
        return { ...rest, type: "paragraph" };
      }),
    };
  }, [content.inline]);

  return (
    <div
      role="heading"
      aria-level={level}
      // `pb-heading-gradient` carries the legacy Card title pattern:
      //   background: <gradient>;
      //   -webkit-background-clip: text;
      //   -webkit-text-fill-color: transparent;
      //   color: <fallback hex>;
      // See `apps/console/app/app.css` for the rule. The class also
      // applies the styles to the nested Tiptap `.ProseMirror` element —
      // setting `background-clip: text` only on this wrapper would miss
      // the descendant that actually paints the glyphs. CardBlock seeds
      // the three CSS vars (`--color-text-heading{,-image,-fill}`) on its
      // wrapper; outside a card those vars are unset and the rule falls
      // back to the global text-primary color with no gradient.
      className="w-full pb-heading-gradient"
    >
      <InlineEditor
        value={editorValue}
        onChange={(next) => onUpdate?.({ inline: next } as Partial<BlockContent>)}
        isSelected={isSelected}
        isEditing={isEditing}
        placeholder={`Heading ${level}`}
        // No explicit `text-theme-primary` — let the wrapper's `color`
        // style flow through inheritance so the card override above wins.
        contentClassName={`${HEADING_LEVEL_CLASSES[level]}${content.align === "center" ? " text-center" : content.align === "right" ? " text-right" : ""}`}
        onSlash={onSlash}
        onEnter={onEnter}
        pendingFocus={pendingFocus}
        onFocusConsumed={onFocusConsumed}
        onEmptyDelete={onEmptyDelete}
      />
    </div>
  );
}
