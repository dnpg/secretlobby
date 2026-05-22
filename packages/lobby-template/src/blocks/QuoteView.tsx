// =============================================================================
// QuoteView
// -----------------------------------------------------------------------------
// Static blockquote renderer. Mirrors the editor's `<QuoteBlock>` →
// `<InlineEditor>` chain — same wrapper structure so the canvas preview
// and the lobby paint identical HTML. Multi-paragraph quote content
// renders as multiple `<p>` tags inside the blockquote via TiptapMirror.
// =============================================================================

import type { CSSProperties } from "react";
import type { QuoteBlockContent } from "./types";
import { TiptapMirror } from "./inlineDoc";

export interface QuoteViewProps {
  content: QuoteBlockContent;
}

export function QuoteView({ content }: QuoteViewProps) {
  const wrapperStyle: CSSProperties = {
    color: "var(--color-text-content, var(--color-text-primary))",
    borderLeft: "3px solid var(--color-accent, #6366f1)",
    paddingLeft: "1rem",
    margin: "0.5rem 0",
    opacity: 0.8,
  };
  const align = content.align ?? "left";
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
