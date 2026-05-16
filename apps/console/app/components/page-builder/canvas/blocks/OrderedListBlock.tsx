import { useMemo } from "react";
import type { JSONContent } from "@tiptap/react";
import type {
  BlockContent,
  InlineDoc,
  OrderedListBlockContent,
} from "../../state/types";
import { ListEditor } from "./inline/ListEditor";

interface OrderedListBlockProps {
  content: OrderedListBlockContent;
  isSelected: boolean;
  isEditing: boolean;
  onUpdate?: (content: Partial<BlockContent>) => void;
}

function itemsToDoc(items: InlineDoc[]): JSONContent {
  const listItems = items.map((item) => {
    const children =
      item.type === "doc" && Array.isArray(item.content) ? item.content : [item];
    return { type: "listItem", content: children };
  });
  return {
    type: "doc",
    content: [
      {
        type: "orderedList",
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
    content: Array.isArray(listItem.content)
      ? listItem.content
      : [{ type: "paragraph" }],
  }));
}

export function OrderedListBlock({
  content,
  isSelected,
  isEditing,
  onUpdate,
}: OrderedListBlockProps) {
  const doc = useMemo(() => itemsToDoc(content.items), [content.items]);
  return (
    <ListEditor
      value={doc}
      onChange={(next) =>
        onUpdate?.({ items: docToItems(next) } as Partial<BlockContent>)
      }
      kind="orderedList"
      isSelected={isSelected}
      isEditing={isEditing}
    />
  );
}
