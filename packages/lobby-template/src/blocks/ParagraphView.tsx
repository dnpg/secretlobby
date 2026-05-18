// =============================================================================
// ParagraphView
// -----------------------------------------------------------------------------
// Static paragraph renderer. Emits the SAME DOM the editor's
// `<ParagraphBlock>` → `<InlineEditor>` chain produces when Tiptap is
// mounted, so the lobby paints byte-for-byte identical HTML to the editor
// preview. Multi-paragraph content (when the editor user pressed Enter
// inside the block) is preserved as multiple `<p>` tags via TiptapMirror —
// previously the lobby flattened every paragraph into one and lost the
// vertical gaps.
//
// Wrapper style:
//   - `color: var(--color-text-content, var(--color-text-primary))` so a
//     paragraph nested inside a card picks up the card's text-content color
//     via the `--color-text-content` CSS var the card sets on its wrapper;
//     outside a card the variable is unset and the value falls back to the
//     global text-primary token.
//   - `fontSize` only when content.fontSize is set; otherwise the paragraph
//     inherits the global `--text-base-size`.
// =============================================================================

import type { CSSProperties } from "react";
import type { ParagraphBlockContent } from "./types";
import { TiptapMirror } from "./inlineDoc";

export interface ParagraphViewProps {
  content: ParagraphBlockContent;
}

export function ParagraphView({ content }: ParagraphViewProps) {
  const wrapperStyle: CSSProperties = {
    color: "var(--color-text-content, var(--color-text-primary))",
    ...(content.fontSize ? { fontSize: content.fontSize } : {}),
  };

  const align = content.align ?? "left";
  // Same alignment classes the editor's InlineEditor passes as
  // `contentClassName`. Live on the `inline-editor-content` div, not on
  // each `<p>`, so the alignment cascades to every paragraph in a
  // multi-paragraph block.
  const alignClass =
    align === "center"
      ? "text-center"
      : align === "right"
        ? "text-right"
        : "";

  return (
    <div className="w-full" style={wrapperStyle}>
      <div
        data-no-dnd-keyboard="true"
        className="inline-editor relative w-full"
      >
        <div
          className={`inline-editor-content outline-none w-full ${alignClass}`.trim()}
        >
          <TiptapMirror doc={content.inline} />
        </div>
      </div>
    </div>
  );
}
