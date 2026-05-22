// =============================================================================
// OrderedListView
// -----------------------------------------------------------------------------
// Static numbered list. Mirrors BulletListView — same item shape, same
// wrapping chain, `<ol>` instead of `<ul>` for browser-managed numbering.
// =============================================================================

import type { CSSProperties } from "react";
import type { OrderedListBlockContent } from "./types";
import { TiptapMirror } from "./inlineDoc";

export interface OrderedListViewProps {
  content: OrderedListBlockContent;
}

export function OrderedListView({ content }: OrderedListViewProps) {
  if (!Array.isArray(content.items) || content.items.length === 0) return null;
  const wrapperStyle: CSSProperties = {
    color: "var(--color-text-content, var(--color-text-primary))",
  };
  return (
    <div className="w-full" style={wrapperStyle}>
      <div
        data-no-dnd-keyboard="true"
        className="inline-editor relative w-full"
      >
        <div className="inline-editor-content outline-none w-full">
          <ol>
            {content.items.map((item, i) => (
              <li key={i}>
                <TiptapMirror doc={item} />
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
