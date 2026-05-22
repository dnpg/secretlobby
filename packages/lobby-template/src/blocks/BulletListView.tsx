// =============================================================================
// BulletListView
// -----------------------------------------------------------------------------
// Static unordered list. Mirrors the editor's `<BulletListBlock>` →
// `<ListEditor>` chain. The persisted shape is one `InlineDoc` per item;
// each item's doc renders into a `<li>` via TiptapMirror so multi-
// paragraph items (when allowed) preserve their structure.
// =============================================================================

import type { CSSProperties } from "react";
import type { BulletListBlockContent } from "./types";
import { TiptapMirror } from "./inlineDoc";

export interface BulletListViewProps {
  content: BulletListBlockContent;
}

export function BulletListView({ content }: BulletListViewProps) {
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
          <ul>
            {content.items.map((item, i) => (
              <li key={i}>
                <TiptapMirror doc={item} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
