// =============================================================================
// CodeBlockView
// -----------------------------------------------------------------------------
// Multi-line `<pre><code>` block. Renders the stored `text` as-is — no
// syntax highlighting in this pass (a follow-up can wire Shiki / Prism when
// we know which `language` values are in use).
//
// The editor uses a `<textarea>` so users can edit and tab-indent; the lobby
// only ever displays, so a plain `<pre><code>` is correct and lets the
// browser's default monospace + selection work naturally.
// =============================================================================

import type { CodeBlockBlockContent } from "./types";

export interface CodeBlockViewProps {
  content: CodeBlockBlockContent;
}

export function CodeBlockView({ content }: CodeBlockViewProps) {
  const text = content.text ?? "";
  return (
    <pre
      className="w-full rounded p-3 overflow-x-auto font-mono text-sm"
      style={{
        background: "rgba(0,0,0,0.45)",
        color: "var(--color-text-primary)",
      }}
    >
      <code data-language={content.language || undefined}>{text}</code>
    </pre>
  );
}
