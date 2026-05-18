// =============================================================================
// OrderedListView
// -----------------------------------------------------------------------------
// Static numbered list. Mirrors BulletListView — same item shape, same
// InlineContent walker, just `<ol>` for browser-managed numbering.
// =============================================================================

import type { OrderedListBlockContent } from "./types";
import { InlineContent } from "./inlineDoc";

export interface OrderedListViewProps {
  content: OrderedListBlockContent;
}

export function OrderedListView({ content }: OrderedListViewProps) {
  if (!Array.isArray(content.items) || content.items.length === 0) return null;
  return (
    <ol className="w-full list-decimal pl-6 space-y-1">
      {content.items.map((item, i) => (
        <li key={i}>
          <InlineContent doc={item} />
        </li>
      ))}
    </ol>
  );
}
