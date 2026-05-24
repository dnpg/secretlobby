import { useMemo } from "react";
import { cn } from "@secretlobby/ui";
import {
  DividerView,
  GalleryView,
  ImageBlockView,
  SocialLinksBlockView,
} from "@secretlobby/lobby-template";
import { GalleryIcon, ImageIcon } from "../icons";
import type {
  Block,
  BlockContent,
  BulletListBlockContent,
  CardBlockContent,
  CodeBlockBlockContent,
  CodeBlockContent,
  GalleryBlockContent,
  HeadingBlockContent,
  ImageBlockContent,
  OrderedListBlockContent,
  ParagraphBlockContent,
  PlayerBlockContent,
  QuoteBlockContent,
  SocialLinksBlockContent,
  TableBlockContent,
  ThemeSettings,
} from "../state/types";
import { usePageBuilder } from "../state/provider";
import { PlayerBlock } from "./blocks/PlayerBlock";
import { CardBlock } from "./blocks/CardBlock";
import { HeadingBlock } from "./blocks/HeadingBlock";
import { ParagraphBlock } from "./blocks/ParagraphBlock";
import { BulletListBlock } from "./blocks/BulletListBlock";
import { OrderedListBlock } from "./blocks/OrderedListBlock";
import { QuoteBlock } from "./blocks/QuoteBlock";
import { CodeBlock } from "./blocks/CodeBlock";
import { CodeBlockBlock } from "./blocks/CodeBlockBlock";
import { TableBlock } from "./blocks/TableBlock";

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
  onEnter?: (opts: { atStart: boolean }) => void;
  pendingFocus?: boolean;
  onFocusConsumed?: () => void;
}

// Thin dispatcher: chooses the right block component for `block.type`, wraps
// it with selection highlight + delete affordance shared across types.
export function BlockRenderer({
  block,
  isSelected,
  onSelect,
  onDelete,
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
      case "image": {
        // Editor-only "Add Image" placeholder for empty blocks — the lobby
        // version of ImageBlockView returns null when there's no media,
        // which would collapse the column on the canvas and hide the
        // affordance the designer needs to click into. We paint the
        // theme-tertiary box + icon here and delegate to ImageBlockView
        // as soon as a media URL lands. `simulatedViewport` tells the
        // shared view to honour the canvas's previewed viewport chip
        // (Mobile / Tablet) even though the browser's actual width is
        // desktop.
        const c = block.content as ImageBlockContent;
        if (!c.mediaUrl) {
          return (
            <div
              className="w-full aspect-video bg-theme-tertiary flex items-center justify-center text-gray-500"
              style={{
                borderRadius:
                  typeof c.imageBorderRadius === "number"
                    ? `${c.imageBorderRadius}px`
                    : undefined,
              }}
            >
              <div className="text-center">
                <ImageIcon className="w-8 h-8 mx-auto mb-1" />
                <span className="text-xs">Add Image</span>
              </div>
            </div>
          );
        }
        return (
          <ImageBlockView
            content={c}
            theme={effectiveTheme}
            simulatedViewport={state.viewport}
          />
        );
      }
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
      case "gallery": {
        // Editor "Add images" empty-state placeholder. The shared
        // GalleryView returns null when the gallery has no images — that's
        // the right call for the lobby (collapse the column) but on the
        // canvas the designer needs an affordance to know the block is
        // there. Same pattern as the image case above.
        const c = block.content as GalleryBlockContent;
        if (!c.images || c.images.length === 0) {
          return (
            <div className="w-full aspect-video bg-theme-tertiary flex items-center justify-center text-gray-500">
              <div className="text-center">
                <GalleryIcon className="w-8 h-8 mx-auto mb-1" />
                <span className="text-xs">Add images</span>
              </div>
            </div>
          );
        }
        return <GalleryView content={c} theme={effectiveTheme} />;
      }
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
            onEmptyDelete={onDelete}
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
            onEmptyDelete={onDelete}
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
            onEmptyDelete={onDelete}
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
            onEmptyDelete={onDelete}
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
        // Divider has no editor-specific behaviour (no Tiptap, no edit
        // state). Drop through to the shared view in @secretlobby/lobby-template
        // so the editor and the published lobby render identical markup.
        return <DividerView />;
      case "socialLinks":
        // Same pattern as divider — the social-links block is purely
        // display, just configured. We hand it the lobby's resolved
        // social-links settings from page-builder state so it can merge
        // the block's per-instance overrides on top.
        return (
          <SocialLinksBlockView
            content={block.content as SocialLinksBlockContent}
            socialLinks={state.socialLinks}
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
        // Cursor — text-bearing blocks (paragraph, heading, bullet/ordered
        // list) get the I-beam so the user reads them as editable straight
        // away. Every other block stays on the click-to-select pointer.
        isEditing &&
          (block.type === "paragraph" ||
          block.type === "heading" ||
          block.type === "bulletList" ||
          block.type === "orderedList"
            ? "cursor-text"
            : "cursor-pointer"),
        // The active-block outline now lives on the SortableBlock wrapper
        // (Figma-blue dashed rectangle). Hover affordance stays here so
        // users still get visual feedback before selecting.
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
