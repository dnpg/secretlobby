// =============================================================================
// QuoteView
// -----------------------------------------------------------------------------
// Static blockquote renderer. Optional alignment mirrors ParagraphView.
// Visual treatment matches the editor's prose-content quote styling: a
// 3px left border in `--color-accent` plus a small left padding. Defined
// inline (rather than referencing a CSS class) so the package stays
// independent of any host-app stylesheet.
// =============================================================================

import type { CSSProperties } from "react";
import type { QuoteBlockContent } from "./types";
import { InlineContent } from "./inlineDoc";

export interface QuoteViewProps {
  content: QuoteBlockContent;
}

export function QuoteView({ content }: QuoteViewProps) {
  const style: CSSProperties = {
    borderLeft: "3px solid var(--color-accent, #6366f1)",
    paddingLeft: "1rem",
    margin: "0.5rem 0",
    opacity: 0.8,
  };
  if (content.align === "center") style.textAlign = "center";
  else if (content.align === "right") style.textAlign = "right";

  return (
    <blockquote className="w-full" style={style}>
      <InlineContent doc={content.inline} />
    </blockquote>
  );
}
