import type {
  Block,
  BlockContent,
  CardBlockContent,
  CodeBlockBlockContent,
  GalleryBlockContent,
  HeadingBlockContent,
  ImageBlockContent,
  ParagraphBlockContent,
  PlayerBlockContent,
  QuoteBlockContent,
} from "../state/types";
import { ImageBlockSettings } from "./blockSettings/ImageBlockSettings";
import { PlayerBlockSettings } from "./blockSettings/PlayerBlockSettings";
import { CardBlockSettings } from "./blockSettings/CardBlockSettings";
import { GalleryBlockSettings } from "./blockSettings/GalleryBlockSettings";
import { HeadingBlockSettings } from "./blockSettings/HeadingBlockSettings";
import { ParagraphBlockSettings } from "./blockSettings/ParagraphBlockSettings";
import { BulletListBlockSettings } from "./blockSettings/BulletListBlockSettings";
import { OrderedListBlockSettings } from "./blockSettings/OrderedListBlockSettings";
import { QuoteBlockSettings } from "./blockSettings/QuoteBlockSettings";
import { CodeBlockSettings } from "./blockSettings/CodeBlockSettings";
import { CodeBlockBlockSettings } from "./blockSettings/CodeBlockBlockSettings";
import { TableBlockSettings } from "./blockSettings/TableBlockSettings";
import { DividerBlockSettings } from "./blockSettings/DividerBlockSettings";

// Inline Block Settings Panel (rendered inside the SettingsOverlay).
// Dispatches to a per-type settings component based on `block.type`.
interface BlockSettingsProps {
  block: Block;
  onUpdate: (content: Partial<BlockContent>) => void;
}

export function BlockSettings({ block, onUpdate }: BlockSettingsProps) {
  const renderSettings = () => {
    switch (block.type) {
      case "image":
        return (
          <ImageBlockSettings
            content={block.content as ImageBlockContent}
            onUpdate={onUpdate}
          />
        );
      case "player":
        return (
          <PlayerBlockSettings
            blockId={block.id}
            content={block.content as PlayerBlockContent}
            onUpdate={onUpdate}
          />
        );
      case "card":
        return (
          <CardBlockSettings
            blockId={block.id}
            content={block.content as CardBlockContent}
            onUpdate={onUpdate}
          />
        );
      case "gallery":
        return (
          <GalleryBlockSettings
            blockId={block.id}
            content={block.content as GalleryBlockContent}
            onUpdate={onUpdate}
          />
        );
      case "heading":
        return (
          <HeadingBlockSettings
            content={block.content as HeadingBlockContent}
            onUpdate={onUpdate}
          />
        );
      case "paragraph":
        return (
          <ParagraphBlockSettings
            content={block.content as ParagraphBlockContent}
            onUpdate={onUpdate}
          />
        );
      case "bulletList":
        return <BulletListBlockSettings />;
      case "orderedList":
        return <OrderedListBlockSettings />;
      case "quote":
        return (
          <QuoteBlockSettings
            content={block.content as QuoteBlockContent}
            onUpdate={onUpdate}
          />
        );
      case "code":
        return <CodeBlockSettings />;
      case "codeBlock":
        return (
          <CodeBlockBlockSettings
            content={block.content as CodeBlockBlockContent}
            onUpdate={onUpdate}
          />
        );
      case "table":
        return <TableBlockSettings />;
      case "divider":
        return <DividerBlockSettings />;
    }
  };

  return <div className="p-3 space-y-4">{renderSettings()}</div>;
}
