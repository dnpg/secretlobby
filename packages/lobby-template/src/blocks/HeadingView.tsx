// =============================================================================
// HeadingView
// -----------------------------------------------------------------------------
// Static heading renderer. Mirrors the editor's `<HeadingBlock>` →
// `<InlineEditor>` chain byte-for-byte: the outer wrapper uses
// `role="heading" aria-level={N}` (NOT a `<h{N}>`) because the editor's
// InlineEditor root is a Tiptap paragraph node — rendering the editor inside
// a real `<h{N}>` would force Tiptap to swap to the Heading node and we
// keep the doc inline-only. The lobby's render matches that structure so
// the canvas preview and the published lobby are visually identical.
//
// The level-class ladder (`text-4xl font-bold leading-tight`, etc.) lives
// on the `inline-editor-content` div — same place the editor's
// InlineEditor's `contentClassName` lands.
// =============================================================================

import type { HeadingBlockContent } from "./types";
import { TiptapMirror } from "./inlineDoc";

export interface HeadingViewProps {
  content: HeadingBlockContent;
}

// Tailwind class mapping per heading level. Exported so the editor's
// HeadingBlock (and any other consumer that needs to style something as a
// heading without rendering one — slash-menu previews, etc.) can read from
// a single source instead of duplicating the strings.
export const HEADING_LEVEL_CLASSES: Record<HeadingBlockContent["level"], string> = {
  1: "text-4xl font-bold leading-tight",
  2: "text-3xl font-bold leading-tight",
  3: "text-2xl font-semibold leading-snug",
  4: "text-xl font-semibold leading-snug",
  5: "text-lg font-semibold leading-snug",
  6: "text-base font-semibold leading-snug",
};

export function HeadingView({ content }: HeadingViewProps) {
  const level = (content.level ?? 1) as HeadingBlockContent["level"];
  return (
    <div
      role="heading"
      aria-level={level}
      className="w-full pb-heading-gradient"
    >
      <div
        data-no-dnd-keyboard="true"
        className="inline-editor relative w-full"
      >
        <div
          className={`inline-editor-content outline-none w-full ${HEADING_LEVEL_CLASSES[level]}`}
        >
          <TiptapMirror doc={content.inline} />
        </div>
      </div>
    </div>
  );
}
