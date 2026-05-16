import { cn } from "@secretlobby/ui";
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
}: HeadingBlockProps) {
  const level = content.level ?? 1;
  return (
    <div role="heading" aria-level={level} className="w-full">
      <InlineEditor
        value={content.inline}
        onChange={(next) => onUpdate?.({ inline: next } as Partial<BlockContent>)}
        isSelected={isSelected}
        isEditing={isEditing}
        placeholder={`Heading ${level}`}
        contentClassName={cn(LEVEL_CLASS[level], "text-theme-primary")}
      />
    </div>
  );
}
