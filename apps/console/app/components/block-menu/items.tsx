import type { FC } from "react";
import type { BlockType } from "~/components/page-builder/state/types";
import { BLOCK_TYPES } from "~/components/page-builder/icons";

// Adapter that exposes the page-builder's BLOCK_TYPES registry as a list of
// menu-friendly items with keywords for cmdk's fuzzy filter. Each entry maps
// 1:1 to a BlockType so the menu can dispatch addBlock with the chosen type.
export interface BlockMenuItem {
  type: BlockType;
  title: string;
  description: string;
  icon: FC<{ className?: string }>;
  keywords: string[];
}

const TYPE_KEYWORDS: Partial<Record<BlockType, string[]>> = {
  heading: ["heading", "title", "h1", "h2", "h3"],
  paragraph: ["paragraph", "text", "p"],
  bulletList: ["bullet", "list", "ul", "unordered"],
  orderedList: ["numbered", "list", "ol", "ordered"],
  quote: ["quote", "blockquote", "citation"],
  code: ["code", "inline"],
  codeBlock: ["code", "block", "pre", "snippet"],
  table: ["table", "grid"],
  divider: ["divider", "hr", "separator", "rule"],
  image: ["image", "picture", "photo"],
  player: ["player", "audio", "music"],
  card: ["card", "container"],
  gallery: ["gallery", "photos"],
  socialLinks: [
    "social",
    "links",
    "instagram",
    "facebook",
    "tiktok",
    "spotify",
    "follow",
  ],
};

export function getBlockMenuItems(): BlockMenuItem[] {
  return BLOCK_TYPES.map((b) => ({
    type: b.type,
    title: b.label,
    description: b.description,
    icon: b.icon,
    keywords: TYPE_KEYWORDS[b.type] ?? [b.label.toLowerCase()],
  }));
}
