// =============================================================================
// BulletListView
// -----------------------------------------------------------------------------
// Static unordered list. Each item is an `InlineDoc` — same shape the editor's
// ListEditor reads / writes — so we render every item through `InlineContent`
// to apply marks (bold, italic, links, etc.) consistently with the other text
// views.
// =============================================================================

import type { BulletListBlockContent } from "./types";
import { InlineContent } from "./inlineDoc";

export interface BulletListViewProps {
  content: BulletListBlockContent;
}

export function BulletListView({ content }: BulletListViewProps) {
  if (!Array.isArray(content.items) || content.items.length === 0) return null;
  return (
    <ul className="w-full list-disc pl-6 space-y-1">
      {content.items.map((item, i) => (
        <li key={i}>
          <InlineContent doc={item} />
        </li>
      ))}
    </ul>
  );
}
