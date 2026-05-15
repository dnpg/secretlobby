import { useMemo } from "react";
import { cn } from "@secretlobby/ui";
import type {
  Block,
  CardBlockContent,
  ImageBlockContent,
  PlayerBlockContent,
  ThemeSettings,
} from "../state/types";
import { usePageBuilder } from "../state/provider";
import { ImageBlock } from "./blocks/ImageBlock";
import { PlayerBlock } from "./blocks/PlayerBlock";
import { CardBlock } from "./blocks/CardBlock";

interface BlockRendererProps {
  block: Block;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  // When false (preview mode), the block does not attach selection click
  // handlers, selection rings, or the delete affordance.
  isEditing?: boolean;
}

// Thin dispatcher: chooses the right block component for `block.type`, wraps
// it with selection highlight + delete affordance shared across types.
export function BlockRenderer({
  block,
  isSelected,
  onSelect,
  onDelete,
  isEditing = true,
}: BlockRendererProps) {
  // The DragOverlay also lives inside PageBuilderProvider so context is safe
  // here. Effective theme = global lobby theme overlaid with block.themeOverrides.
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
            content={block.content as CardBlockContent}
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
        isEditing && isSelected
          ? "ring-2 ring-[var(--color-brand-red)] ring-offset-2 ring-offset-[var(--color-bg-primary)]"
          : isEditing
            ? "hover:ring-1 hover:ring-gray-500"
            : ""
      )}
    >
      {renderBlockContent()}

      {/* Delete button — only shown in edit mode and when selected. */}
      {isEditing && isSelected && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute -top-2 -right-2 p-1 bg-red-500 rounded-full text-white hover:bg-red-600 transition-colors cursor-pointer"
          title="Delete block"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
