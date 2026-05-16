import { useMemo } from "react";
import type { JSONContent } from "@tiptap/react";
import type {
  BlockContent,
  BulletListBlockContent,
  InlineDoc,
} from "../../state/types";
import { ListEditor } from "./inline/ListEditor";

interface BulletListBlockProps {
  content: BulletListBlockContent;
  isSelected: boolean;
  isEditing: boolean;
  onUpdate?: (content: Partial<BlockContent>) => void;
}

// We store the list as an array of InlineDoc items in the block content so
// the data shape stays simple to serialise + reason about. The editor itself
// works on a single Tiptap doc containing a `bulletList` node — we convert
// in and out here at the boundary.

function itemsToDoc(items: InlineDoc[]): JSONContent {
  const listItems = items.map((item) => {
    // Strip the wrapping `doc` and re-wrap the contents as a list item's
    // paragraph children. Items may already be `{ type: "doc", content: [...] }`.
    const children =
      item.type === "doc" && Array.isArray(item.content) ? item.content : [item];
    return { type: "listItem", content: children };
  });
  return {
    type: "doc",
    content: [
      {
        type: "bulletList",
        content:
          listItems.length > 0
            ? listItems
            : [
                {
                  type: "listItem",
                  content: [{ type: "paragraph" }],
                },
              ],
      },
    ],
  };
}

function docToItems(doc: JSONContent): InlineDoc[] {
  const list = doc.content?.[0];
  if (!list || !Array.isArray(list.content)) return [];
  return list.content.map((listItem) => ({
    type: "doc",
    content: Array.isArray(listItem.content) ? listItem.content : [{ type: "paragraph" }],
  }));
}

export function BulletListBlock({
  content,
  isSelected,
  isEditing,
  onUpdate,
}: BulletListBlockProps) {
  const doc = useMemo(() => itemsToDoc(content.items), [content.items]);
  return (
    <ListEditor
      value={doc}
      onChange={(next) =>
        onUpdate?.({ items: docToItems(next) } as Partial<BlockContent>)
      }
      kind="bulletList"
      isSelected={isSelected}
      isEditing={isEditing}
    />
  );
}
