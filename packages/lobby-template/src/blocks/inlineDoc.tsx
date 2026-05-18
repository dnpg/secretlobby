// =============================================================================
// inlineDoc — static React renderer for Tiptap InlineDoc (JSONContent)
// -----------------------------------------------------------------------------
// The editor stores rich text as a Tiptap JSON doc. To paint it on the lobby
// (where we don't want to mount a full Tiptap editor) we walk the JSON tree
// and emit real React elements that mirror Tiptap's HTML output:
//
//   <div class="tiptap ProseMirror">
//     <p>...inline content...</p>
//     <p>...inline content...</p>
//   </div>
//
// Two entry points:
//   - `<TiptapMirror doc={...} />` — full block-level mirror. Emits a
//     `tiptap ProseMirror` wrapper plus per-paragraph `<p>` / heading /
//     blockquote / list nodes. This is what ParagraphView / QuoteView use
//     so a multi-paragraph paragraph block renders as multiple `<p>` tags
//     just like the editor's Tiptap render produces.
//   - `<InlineContent doc={...} />` — strips ALL block-level wrappers and
//     emits ONLY the inline content (text + marks + hardBreak). Use this
//     when the wrapping block element is being emitted by the parent
//     (e.g. HeadingView's single `<h{level}>`).
//
// Mark support: bold / italic / underline / strike / code / link. Unknown
// marks render as-is (no wrapping). Unknown nodes are skipped silently so
// persisted content authored with a future extension still renders the
// parts we understand.
// =============================================================================

import { Fragment, type ReactNode } from "react";
import type { InlineDoc } from "./types";

// Loose structural shape — Tiptap stores arbitrary attrs as a Record. Each
// branch validates the discriminator before reading attrs, so the untyped
// shape doesn't leak into the React tree.
type Node = {
  type?: string;
  text?: string;
  marks?: Mark[];
  content?: Node[];
  attrs?: Record<string, unknown>;
};
type Mark = { type?: string; attrs?: Record<string, unknown> };

export interface InlineContentProps {
  /** The Tiptap JSON doc to render. Block-level wrappers (`doc`,
   *  `paragraph`, etc.) are walked into; only the inline content emits DOM.
   *  Use `<TiptapMirror>` instead if you need block-level paragraphs. */
  doc: InlineDoc | undefined | null;
}

export function InlineContent({ doc }: InlineContentProps) {
  if (!doc) return null;
  return <>{renderInlineChildren((doc as Node).content)}</>;
}

export interface TiptapMirrorProps {
  /** The Tiptap JSON doc to render. Top-level block nodes (paragraph,
   *  heading, blockquote, bulletList, orderedList) emit matching HTML
   *  elements inside a `tiptap ProseMirror` wrapper — same shape Tiptap's
   *  own renderer produces when mounting the doc in a static editor. */
  doc: InlineDoc | undefined | null;
}

export function TiptapMirror({ doc }: TiptapMirrorProps) {
  if (!doc) return null;
  const topLevel = (doc as Node).content;
  if (!Array.isArray(topLevel) || topLevel.length === 0) {
    // Empty doc still emits the wrapper — the editor's Tiptap mount does
    // the same when there's no content. Keeps DOM diffing stable when the
    // user empties and re-fills a block.
    return <div className="tiptap ProseMirror" />;
  }
  return (
    <div className="tiptap ProseMirror">
      {topLevel.map((node, i) => renderBlockNode(node, i))}
    </div>
  );
}

// Block-level node renderer. Walks `paragraph` / `heading` / `blockquote` /
// `bulletList` / `orderedList` etc. and emits the matching HTML element.
// Inline content inside each block flows through `renderInlineChildren`.
function renderBlockNode(node: Node, key: number): ReactNode {
  if (!node || typeof node !== "object") return null;
  switch (node.type) {
    case "paragraph": {
      const inline = renderInlineChildren(node.content);
      // Empty paragraphs render with a trailing `<br>` to match Tiptap's
      // "ProseMirror-trailingBreak" behaviour (otherwise the paragraph
      // collapses to zero height and the vertical gap disappears).
      return (
        <p key={key}>
          {inline.length === 0 ? <br className="ProseMirror-trailingBreak" /> : inline}
        </p>
      );
    }
    case "heading": {
      const level = (() => {
        const l = node.attrs?.level;
        if (typeof l === "number" && l >= 1 && l <= 6) return l;
        return 1;
      })();
      const inner = renderInlineChildren(node.content);
      switch (level) {
        case 1:
          return <h1 key={key}>{inner}</h1>;
        case 2:
          return <h2 key={key}>{inner}</h2>;
        case 3:
          return <h3 key={key}>{inner}</h3>;
        case 4:
          return <h4 key={key}>{inner}</h4>;
        case 5:
          return <h5 key={key}>{inner}</h5>;
        case 6:
          return <h6 key={key}>{inner}</h6>;
        default:
          return <h1 key={key}>{inner}</h1>;
      }
    }
    case "blockquote":
      return (
        <blockquote key={key}>
          {Array.isArray(node.content)
            ? node.content.map((child, i) => renderBlockNode(child, i))
            : null}
        </blockquote>
      );
    case "bulletList":
      return (
        <ul key={key}>
          {Array.isArray(node.content)
            ? node.content.map((child, i) => renderBlockNode(child, i))
            : null}
        </ul>
      );
    case "orderedList":
      return (
        <ol key={key}>
          {Array.isArray(node.content)
            ? node.content.map((child, i) => renderBlockNode(child, i))
            : null}
        </ol>
      );
    case "listItem":
      // List items wrap their children (typically paragraphs) — Tiptap emits
      // `<li><p>...</p></li>` so we preserve that structure rather than
      // flattening to `<li>...inline...</li>`.
      return (
        <li key={key}>
          {Array.isArray(node.content)
            ? node.content.map((child, i) => renderBlockNode(child, i))
            : null}
        </li>
      );
    case "hardBreak":
      return <br key={key} />;
    default:
      // Unknown block-level node — try the inline path so any inline text
      // it carries still renders. Doc nodes hit this branch too.
      return <Fragment key={key}>{renderInlineChildren(node.content)}</Fragment>;
  }
}

function renderInlineChildren(nodes: Node[] | undefined): ReactNode[] {
  if (!Array.isArray(nodes)) return [];
  const out: ReactNode[] = [];
  nodes.forEach((node, i) => {
    const rendered = renderInlineNode(node, i);
    if (rendered !== null) out.push(rendered);
  });
  return out;
}

function renderInlineNode(node: Node, key: number): ReactNode {
  if (!node || typeof node !== "object") return null;
  switch (node.type) {
    case "text": {
      const text = typeof node.text === "string" ? node.text : "";
      return applyMarks(text, node.marks, key);
    }
    case "hardBreak":
      return <br key={key} />;
    // Block-level wrappers nested inside inline content — recurse into the
    // inline children so e.g. `paragraph → text` inside an inline doc
    // still renders the text. Matches `<InlineContent>`'s strip-wrapper
    // behaviour for callers that only want inline output.
    case "doc":
    case "paragraph":
    case "heading":
    case "blockquote":
      return <Fragment key={key}>{renderInlineChildren(node.content)}</Fragment>;
    default:
      return null;
  }
}

// Apply marks innermost-out so the rendered tree matches Tiptap's canonical
// HTML output (`<a><strong><em>text</em></strong></a>`). Link mark uses
// `inline-link` class so app-level CSS (anchors styled via `var(--color-link)`)
// picks it up the same way the editor's InlineEditor output does.
function applyMarks(
  text: string,
  marks: Mark[] | undefined,
  key: number
): ReactNode {
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
          const rel =
            typeof mark.attrs?.rel === "string"
              ? mark.attrs.rel
              : "noopener noreferrer nofollow";
          el = (
            <a
              href={href}
              target={target}
              rel={rel}
              className="inline-link"
            >
              {el}
            </a>
          );
          break;
        }
        default:
          // Unknown mark — render the inner element unchanged.
          break;
      }
    }
  }
  return <Fragment key={key}>{el}</Fragment>;
}
