import type {
  BlockContent,
  HeadingBlockContent,
} from "../../state/types";
import { InlineEditor } from "./inline/InlineEditor";

interface HeadingBlockProps {
  content: HeadingBlockContent;
  isSelected: boolean;
  isEditing: boolean;
  onUpdate?: (content: Partial<BlockContent>) => void;
  // Notion-style hooks forwarded into the InlineEditor.
  onSlash?: (anchorEl: HTMLElement) => void;
  onEnter?: () => void;
  pendingFocus?: boolean;
  onFocusConsumed?: () => void;
  onEmptyDelete?: () => void;
}

// Tailwind font-size + weight mapping per heading level. Headings render as
// regular <div role="heading" aria-level={N}> wrappers; the editor's root is
// a paragraph (StarterKit's default) which we paint as the heading using
// these classes. Rendering the editor inside an <h1>/<h2>/... would force
// Tiptap to swap to the Heading node — we want to keep the doc inline-only.
const LEVEL_CLASS: Record<HeadingBlockContent["level"], string> = {
  1: "text-4xl font-bold leading-tight",
  2: "text-3xl font-bold leading-tight",
  3: "text-2xl font-semibold leading-snug",
  4: "text-xl font-semibold leading-snug",
  5: "text-lg font-semibold leading-snug",
  6: "text-base font-semibold leading-snug",
};

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
        value={content.inline}
        onChange={(next) => onUpdate?.({ inline: next } as Partial<BlockContent>)}
        isSelected={isSelected}
        isEditing={isEditing}
        placeholder={`Heading ${level}`}
        // No explicit `text-theme-primary` — let the wrapper's `color`
        // style flow through inheritance so the card override above wins.
        contentClassName={LEVEL_CLASS[level]}
        onSlash={onSlash}
        onEnter={onEnter}
        pendingFocus={pendingFocus}
        onFocusConsumed={onFocusConsumed}
        onEmptyDelete={onEmptyDelete}
      />
    </div>
  );
}
