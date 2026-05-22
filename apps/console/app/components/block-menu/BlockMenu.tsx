import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Command } from "cmdk";
import { cn } from "@secretlobby/ui";
import type { BlockType } from "~/components/page-builder/state/types";
import { getBlockMenuItems, type BlockMenuItem } from "./items";

// Anchor for positioning the menu. Viewport-relative rect coords — typically
// `getBoundingClientRect()` from the trigger element. The menu renders in a
// React portal mounted to `document.body` with `position: fixed`, so it
// always sits above every sibling / overflow / stacking context (sections,
// columns, cards, etc.).
export interface BlockMenuAnchor {
  top: number;
  left: number;
  bottom: number;
}

interface BlockMenuProps {
  anchor: BlockMenuAnchor;
  initialQuery?: string;
  // Picks which entries to show. Currently all block types are listed; the
  // hook is here for level-2 / context-specific menus later.
  filter?: (item: BlockMenuItem) => boolean;
  // Triggered when the user picks a block type. The caller decides where to
  // insert (column-empty / between-blocks / after-this-block).
  onPick: (type: BlockType) => void;
  onClose: () => void;
}

// Standalone block-type picker reused everywhere the user can insert a new
// page-builder block: empty-column placeholder, between-blocks hover gap, and
// the per-block toolbar "+". Built on cmdk for arrow-nav + fuzzy filter + the
// roving-tab-index / aria semantics.
export function BlockMenu({
  anchor,
  initialQuery = "",
  filter,
  onPick,
  onClose,
}: BlockMenuProps) {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [search, setSearch] = useState(initialQuery);

  useEffect(() => {
    setSearch(initialQuery);
  }, [initialQuery]);

  // Compute popover position after layout so we can measure our own size
  // for the flip + clamp decisions. Coords are viewport-relative (fixed
  // positioning) — the menu is portal'd to <body> so it can't be clipped by
  // a parent's `overflow` or buried beneath a sibling's stacking context.
  // Vertical: flip above the anchor when there isn't enough room below.
  // Horizontal: clamp `left` into [VIEWPORT_PAD, viewportW − popoverW − PAD]
  // so the menu stays fully on-screen even when the anchor sits near the
  // right edge (or a left-margin layout pushes it past the left edge).
  useLayoutEffect(() => {
    const VIEWPORT_PAD = 8;
    const popoverHeight = popoverRef.current?.offsetHeight ?? 320;
    const popoverWidth = popoverRef.current?.offsetWidth ?? 288;
    const spaceBelow = window.innerHeight - anchor.bottom;
    const flipUp = spaceBelow < popoverHeight + 16;
    const top = flipUp ? anchor.top - popoverHeight - 4 : anchor.bottom + 4;
    const maxLeft = window.innerWidth - popoverWidth - VIEWPORT_PAD;
    const left = Math.max(VIEWPORT_PAD, Math.min(anchor.left, maxLeft));
    setPos({ top, left });
  }, [anchor]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [onClose]);

  // Click outside closes — but we only listen while mounted so this never
  // racks up listeners.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const items = getBlockMenuItems().filter((it) =>
    filter ? filter(it) : true
  );

  if (!pos) return null;

  // Only render in the browser — SSR doesn't have a `document` to portal to.
  // The reducer dispatches the menu after a user keystroke, so this short
  // bail-out is purely a hydration guard.
  if (typeof document === "undefined") return null;

  const popover = (
    // The BlockMenu is an EDITOR tool — it must NEVER inherit `--color-*`
    // theme variables (those are the lobby's design tokens; the user picks
    // them freely, and a deep-black lobby theme would otherwise render the
    // dropdown invisible). All chrome here is hard-coded against the
    // console's own light/dark mode, which `useColorMode` toggles via the
    // `.dark` class on <html>. So: `bg-white dark:bg-neutral-900`, black /
    // white text, neutral borders — no theme tokens, no transparency.
    <div
      ref={popoverRef}
      data-no-dnd-keyboard="true"
      className={cn(
        // High z-index because the menu can sit above sections / cards /
        // layered surfaces; the portal also escapes ancestor overflow.
        "fixed z-[9999] w-72 rounded-lg overflow-hidden",
        "border border-neutral-200 dark:border-neutral-800",
        "bg-white dark:bg-neutral-900",
        "text-black dark:text-white",
        "shadow-2xl ring-1 ring-black/10 dark:ring-white/10"
      )}
      style={{ top: pos.top, left: pos.left }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <Command loop className="flex flex-col">
        <Command.Input
          value={search}
          onValueChange={setSearch}
          autoFocus
          placeholder="Type to search blocks..."
          className={cn(
            "w-full px-3 py-2 text-sm bg-transparent outline-none focus-visible:ring-0",
            "border-b border-neutral-200 dark:border-neutral-800",
            "text-black dark:text-white",
            "placeholder:text-neutral-500 dark:placeholder:text-neutral-400"
          )}
        />
        <Command.List className="max-h-72 overflow-y-auto py-1">
          <Command.Empty className="px-3 py-2 text-xs text-neutral-500 dark:text-neutral-400">
            No matches
          </Command.Empty>
          {items.map((item) => (
            <Command.Item
              key={item.type}
              value={item.title}
              keywords={item.keywords}
              onSelect={() => onPick(item.type)}
              className={cn(
                "flex items-center gap-2 mx-1 px-2 py-1.5 rounded text-sm cursor-pointer",
                "text-neutral-700 dark:text-neutral-300",
                "data-[selected=true]:bg-neutral-100 dark:data-[selected=true]:bg-neutral-800",
                "data-[selected=true]:text-black dark:data-[selected=true]:text-white",
                "aria-selected:bg-neutral-100 dark:aria-selected:bg-neutral-800",
                "aria-selected:text-black dark:aria-selected:text-white"
              )}
            >
              <span
                className={cn(
                  "w-6 h-6 flex items-center justify-center rounded flex-shrink-0",
                  "bg-neutral-100 dark:bg-neutral-800",
                  "text-black dark:text-white"
                )}
              >
                <item.icon className="w-4 h-4" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block truncate text-black dark:text-white">
                  {item.title}
                </span>
                <span className="block truncate text-xs text-neutral-500 dark:text-neutral-400">
                  {item.description}
                </span>
              </span>
            </Command.Item>
          ))}
        </Command.List>
      </Command>
    </div>
  );

  return createPortal(popover, document.body);
}
