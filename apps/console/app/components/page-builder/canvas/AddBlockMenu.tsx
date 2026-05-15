import { useState } from "react";
import { cn } from "@secretlobby/ui";
import { BLOCK_TYPES, PlusIcon } from "../icons";
import type { BlockType } from "../state/types";

interface AddBlockMenuProps {
  onAdd: (type: BlockType) => void;
  // True when the column is empty — bumps the button padding so it reads as a
  // bigger drop target.
  emptyColumn: boolean;
}

// Inline "+ Add Block" button rendered at the bottom of each column while
// layout-edit mode is active. Opens a small grid of block-type choices below.
export function AddBlockMenu({ onAdd, emptyColumn }: AddBlockMenuProps) {
  const [showBlockMenu, setShowBlockMenu] = useState(false);

  return (
    <div className="relative mt-2">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setShowBlockMenu(!showBlockMenu);
        }}
        className={cn(
          "w-full py-2 border border-dashed border-[var(--color-brand-red)]/30 rounded-lg text-gray-500 hover:text-white hover:border-[var(--color-brand-red)]/60 transition-colors cursor-pointer flex items-center justify-center gap-1",
          emptyColumn && "py-4"
        )}
      >
        <PlusIcon className="w-4 h-4" />
        <span className="text-xs">Add Block</span>
      </button>

      {/* Block type menu */}
      {showBlockMenu && (
        <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-theme-secondary border border-theme rounded-lg shadow-xl p-2 grid grid-cols-2 gap-1">
          {BLOCK_TYPES.map(({ type, label, icon: Icon }) => (
            <button
              key={type}
              onClick={(e) => {
                e.stopPropagation();
                onAdd(type);
                setShowBlockMenu(false);
              }}
              className="flex items-center gap-2 px-3 py-2 rounded hover:bg-theme-tertiary text-gray-300 hover:text-white transition-colors cursor-pointer text-left"
            >
              <Icon className="w-4 h-4" />
              <span className="text-xs">{label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
