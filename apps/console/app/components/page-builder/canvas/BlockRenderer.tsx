import { useMemo } from "react";
import { cn } from "@secretlobby/ui";
import type {
  Block,
  BlockContent,
  BulletListBlockContent,
  CardBlockContent,
  CodeBlockBlockContent,
  CodeBlockContent,
  DividerBlockContent,
  GalleryBlockContent,
  HeadingBlockContent,
  ImageBlockContent,
  OrderedListBlockContent,
  ParagraphBlockContent,
  PlayerBlockContent,
  QuoteBlockContent,
  TableBlockContent,
  ThemeSettings,
} from "../state/types";
import { usePageBuilder } from "../state/provider";
import { ImageBlock } from "./blocks/ImageBlock";
import { PlayerBlock } from "./blocks/PlayerBlock";
import { CardBlock } from "./blocks/CardBlock";
import { GalleryBlock } from "./blocks/GalleryBlock";
import { HeadingBlock } from "./blocks/HeadingBlock";
import { ParagraphBlock } from "./blocks/ParagraphBlock";
import { BulletListBlock } from "./blocks/BulletListBlock";
import { OrderedListBlock } from "./blocks/OrderedListBlock";
import { QuoteBlock } from "./blocks/QuoteBlock";
import { CodeBlock } from "./blocks/CodeBlock";
import { CodeBlockBlock } from "./blocks/CodeBlockBlock";
import { TableBlock } from "./blocks/TableBlock";
import { DividerBlock } from "./blocks/DividerBlock";

interface BlockRendererProps {
  block: Block;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  // Text-ish blocks push their Tiptap doc updates back through this.
  onUpdate?: (content: Partial<BlockContent>) => void;
  // When false (preview mode), the block does not attach selection click
  // handlers, selection rings, or the delete affordance.
  isEditing?: boolean;
  // Notion-style hooks forwarded into the per-block inline editors.
  // - `onSlash` opens the BlockListSurface's slash menu anchored to the
  //   editor's DOM node when the user types `/` as the first character of
  //   an empty inline editor.
  // - `onEnter` is fired when the user hits Enter (no shift) in a non-empty
  //   inline editor; the surface appends a paragraph and routes pending
  //   focus back via `pendingFocus`.
  // - `pendingFocus` + `onFocusConsumed` chase the caret onto a freshly
  //   inserted paragraph.
  onSlash?: (anchorEl: HTMLElement) => void;
  onEnter?: () => void;
  pendingFocus?: boolean;
  onFocusConsumed?: () => void;
}

// Thin dispatcher: chooses the right block component for `block.type`, wraps
// it with selection highlight + delete affordance shared across types.
export function BlockRenderer({
  block,
  isSelected,
  onSelect,
  onDelete: _onDelete,
  onUpdate,
  isEditing = true,
  onSlash,
  onEnter,
  pendingFocus,
  onFocusConsumed,
}: BlockRendererProps) {
  // Effective theme = global lobby theme overlaid with block.themeOverrides.
  const { state } = usePageBuilder();
  const effectiveTheme = useMemo<ThemeSettings>(
    () => ({ ...state.theme, ...(block.themeOverrides ?? {}) }),
    [state.theme, block.themeOverrides]
  );

  // Visibility: a hidden block is fully removed from the canvas in every
  // mode. The sidebar still surfaces it so the user can toggle it back on.
  const blockHidden = block.hidden === true;
  if (blockHidden) return null;

  const renderBlockContent = () => {
    switch (block.type) {
      case "image":
        return (
          <ImageBlock
            content={block.content as ImageBlockContent}
            theme={effectiveTheme}
          />
        );
      case "player":
        return (
          <PlayerBlock
            content={block.content as PlayerBlockContent}
            theme={effectiveTheme}
          />
        );
      case "card":
        return (
          <CardBlock
            blockId={block.id}
            content={block.content as CardBlockContent}
            theme={effectiveTheme}
            isEditing={isEditing}
          />
        );
      case "gallery":
        return (
          <GalleryBlock
            content={block.content as GalleryBlockContent}
            theme={effectiveTheme}
          />
        );
      case "heading":
        return (
          <HeadingBlock
            content={block.content as HeadingBlockContent}
            isSelected={isSelected}
            isEditing={isEditing}
            onUpdate={onUpdate}
            onSlash={onSlash}
            onEnter={onEnter}
            pendingFocus={pendingFocus}
            onFocusConsumed={onFocusConsumed}
          />
        );
      case "paragraph":
        return (
          <ParagraphBlock
            content={block.content as ParagraphBlockContent}
            isSelected={isSelected}
            isEditing={isEditing}
            onUpdate={onUpdate}
            onSlash={onSlash}
            onEnter={onEnter}
            pendingFocus={pendingFocus}
            onFocusConsumed={onFocusConsumed}
          />
        );
      case "bulletList":
        return (
          <BulletListBlock
            content={block.content as BulletListBlockContent}
            isSelected={isSelected}
            isEditing={isEditing}
            onUpdate={onUpdate}
          />
        );
      case "orderedList":
        return (
          <OrderedListBlock
            content={block.content as OrderedListBlockContent}
            isSelected={isSelected}
            isEditing={isEditing}
            onUpdate={onUpdate}
          />
        );
      case "quote":
        return (
          <QuoteBlock
            content={block.content as QuoteBlockContent}
            isSelected={isSelected}
            isEditing={isEditing}
            onUpdate={onUpdate}
            onSlash={onSlash}
            onEnter={onEnter}
            pendingFocus={pendingFocus}
            onFocusConsumed={onFocusConsumed}
          />
        );
      case "code":
        return (
          <CodeBlock
            content={block.content as CodeBlockContent}
            isSelected={isSelected}
            isEditing={isEditing}
            onUpdate={onUpdate}
            onSlash={onSlash}
            onEnter={onEnter}
            pendingFocus={pendingFocus}
            onFocusConsumed={onFocusConsumed}
          />
        );
      case "codeBlock":
        return (
          <CodeBlockBlock
            content={block.content as CodeBlockBlockContent}
            isSelected={isSelected}
            isEditing={isEditing}
            onUpdate={onUpdate}
          />
        );
      case "table":
        return (
          <TableBlock
            content={block.content as TableBlockContent}
            isSelected={isSelected}
            isEditing={isEditing}
            onUpdate={onUpdate}
          />
        );
      case "divider":
        return (
          <DividerBlock
            content={block.content as DividerBlockContent}
            theme={effectiveTheme}
          />
        );
    }
  };

  return (
    <div
      onClick={
        isEditing
          ? (e) => {
              e.stopPropagation();
              onSelect();
            }
          : undefined
      }
      className={cn(
        "relative group rounded transition-all",
        isEditing && "cursor-pointer",
        // The active-block outline now lives on the SortableBlock wrapper
        // (console-blue ring with white / neutral-950 offset halo). Hover
        // affordance stays here so users still get visual feedback before
        // selecting.
        isEditing && !isSelected ? "hover:ring-1 hover:ring-gray-500" : ""
      )}
    >
      {renderBlockContent()}
      {/* Per-block delete affordance lives in the left rail (trash icon on
          the layer row) and at the bottom of the SettingsOverlay. The canvas
          stays clean. */}
    </div>
  );
}
