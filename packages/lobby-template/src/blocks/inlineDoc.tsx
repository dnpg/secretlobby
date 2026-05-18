// =============================================================================
// inlineDoc — static React renderer for InlineDoc (Tiptap JSONContent)
// -----------------------------------------------------------------------------
// The editor stores rich text as a Tiptap JSON doc. To paint it on the lobby
// (where we don't want to mount a full editor) we walk the JSON tree and emit
// real React elements. Tiptap ships `@tiptap/html#generateHTML` for the same
// job but it requires us to instantiate every extension we want to support;
// for the inline-only doc shape the lobby cares about, a hand-rolled walker
// is smaller, faster, and lets us emit proper React (no dangerouslySetInnerHTML).
//
// Coverage: every node/mark the editor's inline StarterKit + Underline + Link
// can emit:
//   - text nodes with bold / italic / underline / strike / code / link marks
//   - hardBreak nodes (`<br />`)
// Block-level nodes (paragraph, heading, lists, blockquote) are NOT emitted
// here — the wrapping View component owns the block element. We strip them
// when we encounter them inside the inline doc, recursing into their content
// so a `doc → paragraph → text` chain renders as just the text.
//
// Unknown nodes / marks are skipped silently. This matters when persisted
// content was created with an extension we haven't enabled yet (or removed):
// the lobby still renders the parts it understands instead of throwing.
// =============================================================================

import { Fragment, type ReactNode } from "react";
import type { InlineDoc } from "./types";

// Loose structural shape — we accept whatever Tiptap stored. Tiptap's own
// `JSONContent` is recursive and uses `Record<string, any>` for attrs, so
// keeping the walker untyped at the node level is the simplest correct
// approach. The renderer never trusts the shape blindly; each branch checks
// the discriminator before reading attrs.
type Node = { type?: string; text?: string; marks?: Mark[]; content?: Node[]; attrs?: Record<string, unknown> };
type Mark = { type?: string; attrs?: Record<string, unknown> };

export interface InlineContentProps {
  /** The Tiptap JSON doc to render. Block-level wrappers (`doc`, `paragraph`,
   *  etc.) are walked into; only the inline content emits DOM. */
  doc: InlineDoc | undefined | null;
}

export function InlineContent({ doc }: InlineContentProps) {
  if (!doc) return null;
  return <>{renderChildren((doc as Node).content)}</>;
}

function renderChildren(nodes: Node[] | undefined): ReactNode[] {
  if (!Array.isArray(nodes)) return [];
  const out: ReactNode[] = [];
  nodes.forEach((node, i) => {
    const rendered = renderNode(node, i);
    if (rendered !== null) out.push(rendered);
  });
  return out;
}

function renderNode(node: Node, key: number): ReactNode {
  if (!node || typeof node !== "object") return null;
  switch (node.type) {
    case "text": {
      const text = typeof node.text === "string" ? node.text : "";
      return applyMarks(text, node.marks, key);
    }
    case "hardBreak":
      return <br key={key} />;
    // Block-level wrappers — strip the wrapper but render the children inline.
    // Wrapping a heading in `<h1><p>…</p></h1>` would emit invalid HTML and
    // visually double the line-height; we want just `<h1>…</h1>`.
    case "doc":
    case "paragraph":
    case "heading":
    case "blockquote":
      return <Fragment key={key}>{renderChildren(node.content)}</Fragment>;
    default:
      // Unknown node — skip it. Persisted content may carry nodes from an
      // extension we don't recognise; render nothing rather than crash.
      return null;
  }
}

// Apply marks from the innermost out so the rendered tree matches Tiptap's
// canonical output (`<a><strong><em>text</em></strong></a>`). Mark attrs are
// only used for the `link` mark (href + target).
function applyMarks(text: string, marks: Mark[] | undefined, key: number): ReactNode {
  let el: ReactNode = text;
  if (Array.isArray(marks)) {
    for (const mark of marks) {
      if (!mark || typeof mark !== "object") continue;
      switch (mark.type) {
        case "bold":
          el = <strong>{el}</strong>;
          break;
        case "italic":
          el = <em>{el}</em>;
          break;
        case "underline":
          el = <u>{el}</u>;
          break;
        case "strike":
          el = <s>{el}</s>;
          break;
        case "code":
          el = <code>{el}</code>;
          break;
        case "link": {
          const href =
            typeof mark.attrs?.href === "string" ? mark.attrs.href : "#";
          const target =
            typeof mark.attrs?.target === "string"
              ? mark.attrs.target
              : "_blank";
          el = (
            <a href={href} target={target} rel="noopener noreferrer">
              {el}
            </a>
          );
          break;
        }
        default:
          // Unknown mark — skip silently. See file header for rationale.
          break;
      }
    }
  }
  return <Fragment key={key}>{el}</Fragment>;
}
