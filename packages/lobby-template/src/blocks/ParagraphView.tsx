// =============================================================================
// ParagraphView
// -----------------------------------------------------------------------------
// Static paragraph renderer for the lobby. Honours the block's optional
// `align` (left / center / right) and `fontSize` override; when `fontSize`
// is unset the paragraph inherits the global `--text-base-size` CSS var
// emitted by the theme.
//
// Block-level wrappers inside the InlineDoc are stripped by InlineContent,
// so a doc that contains a single `paragraph` child renders cleanly inside
// the `<p>` we emit here without producing nested paragraphs.
// =============================================================================

import type { CSSProperties } from "react";
import type { ParagraphBlockContent } from "./types";
import { InlineContent } from "./inlineDoc";

export interface ParagraphViewProps {
  content: ParagraphBlockContent;
}

export function ParagraphView({ content }: ParagraphViewProps) {
  const style: CSSProperties = {};
  if (content.fontSize) style.fontSize = content.fontSize;
  if (content.align === "center") style.textAlign = "center";
  else if (content.align === "right") style.textAlign = "right";

  return (
    <p className="w-full" style={style}>
      <InlineContent doc={content.inline} />
    </p>
  );
}
