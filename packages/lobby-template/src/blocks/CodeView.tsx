// =============================================================================
// CodeView
// -----------------------------------------------------------------------------
// Inline-styled code chunk — a single styled line/run, distinct from the
// multi-line CodeBlockView. The editor stores this as an `InlineDoc` with
// `code` marks; we wrap the rendered inline content in a `<code>` element
// so the styling is correctly scoped even when the user removes the mark.
// =============================================================================

import type { CodeBlockContent } from "./types";
import { InlineContent } from "./inlineDoc";

export interface CodeViewProps {
  content: CodeBlockContent;
}

export function CodeView({ content }: CodeViewProps) {
  return (
    <p className="w-full">
      <code
        className="font-mono text-sm rounded px-1"
        style={{ background: "rgba(0,0,0,0.45)" }}
      >
        <InlineContent doc={content.inline} />
      </code>
    </p>
  );
}
