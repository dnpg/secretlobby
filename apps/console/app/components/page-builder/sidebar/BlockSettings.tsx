import type {
  Block,
  BlockContent,
  CardBlockContent,
  ImageBlockContent,
  PlayerBlockContent,
} from "../state/types";
import { ImageBlockSettings } from "./blockSettings/ImageBlockSettings";
import { PlayerBlockSettings } from "./blockSettings/PlayerBlockSettings";
import { CardBlockSettings } from "./blockSettings/CardBlockSettings";

// Inline Block Settings Panel (rendered inside the SettingsOverlay).
// Dispatches to a per-type settings component based on `block.type`.
// Phase 3: deletion is owned by the overlay footer.
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
    }
  };

  return <div className="p-3 space-y-4">{renderSettings()}</div>;
}
