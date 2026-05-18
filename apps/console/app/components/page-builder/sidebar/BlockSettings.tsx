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
  SocialLinksBlockContent,
} from "../state/types";
import { CssLengthInput } from "~/components/css-length-input";
import { RefreshIcon } from "../icons";
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
import { SocialLinksBlockSettings } from "./blockSettings/SocialLinksBlockSettings";

// Inline Block Settings Panel (rendered inside the SettingsOverlay).
// Dispatches to a per-type settings component based on `block.type`.
interface BlockSettingsProps {
  block: Block;
  onUpdate: (content: Partial<BlockContent>) => void;
  // Updates Block-level fields (everything outside `content`). Today drives
  // `marginBottom`; kept generic so future universal block fields can ride
  // through this callback without growing the component's API.
  onUpdateMeta: (partial: Partial<Omit<Block, "id" | "type" | "content">>) => void;
}

export function BlockSettings({ block, onUpdate, onUpdateMeta }: BlockSettingsProps) {
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
      case "socialLinks":
        return (
          <SocialLinksBlockSettings
            content={block.content as SocialLinksBlockContent}
            onUpdate={onUpdate}
          />
        );
    }
  };

  // Universal Spacing section — rendered for EVERY block type before the
  // type-specific panel. Keeps the layout-level controls in one consistent
  // place so users always know where to find "how much room sits below this
  // block".
  const marginBottom = block.marginBottom ?? "0";
  const marginBottomModified =
    block.marginBottom !== undefined && block.marginBottom !== "0";

  return (
    <div className="p-3 space-y-4">
      {renderSettings()}
      {/* Universal Spacing section pinned to the bottom of every block's
          settings panel so type-specific controls stay on top and the
          layout-level "how much room sits below" lives in one consistent
          place across all block types. */}
      <div className="space-y-1 pt-3 border-t border-theme">
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs text-theme-muted flex items-center gap-1.5">
            <span>Margin bottom</span>
            {marginBottomModified && (
              <span
                className="w-1.5 h-1.5 rounded-full bg-[var(--color-brand-red)] flex-shrink-0"
                aria-label="Modified from default"
                title="Modified from default (0)"
              />
            )}
          </label>
          {marginBottomModified && (
            <button
              type="button"
              onClick={() => onUpdateMeta({ marginBottom: undefined })}
              className="p-1 rounded text-theme-muted hover:text-theme-primary hover:bg-theme-tertiary cursor-pointer transition-colors"
              title="Reset to 0"
              aria-label="Reset margin bottom to 0"
            >
              <RefreshIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <CssLengthInput
          value={marginBottom}
          onChange={(next) =>
            onUpdateMeta({ marginBottom: next === "0" ? undefined : next })
          }
          min={0}
          max={512}
          ariaLabel="Block margin bottom"
          placeholder="0"
        />
      </div>
    </div>
  );
}
