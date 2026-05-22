import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { cn, useColorMode } from "@secretlobby/ui";
import type { Block, CardBlockContent, Section } from "../state/types";
import { usePageBuilder } from "../state/provider";
import { BLOCK_TYPES, TrashIcon } from "../icons";
import { RenamableLabel } from "./RenamableLabel";
import { SectionSettings } from "./SectionSettings";
import { ColumnSettings } from "./ColumnSettings";
import { BlockSettings } from "./BlockSettings";

// =============================================================================
// SettingsOverlay
// -----------------------------------------------------------------------------
// Full-cover sidebar overlay rendered when state.selection !== "none".
// Layout:
//   - Header: back arrow, breadcrumb (Section / Column / Block), inline rename
//   - Body:   the relevant settings panel (Section / Column / Block)
//   - Footer: full-width destructive Delete button
// Animation: slides in from the right edge of the sidebar (300ms ease-out).
// Closing:   back arrow / Esc → dispatch clearSelection.
// =============================================================================

interface SettingsOverlayProps {
  sections: Section[];
}

function defaultColumnName(index: number): string {
  return `Column ${index + 1}`;
}

function defaultBlockName(block: Block, sameTypeIndex: number): string {
  const meta = BLOCK_TYPES.find((t) => t.type === block.type);
  const label = meta?.label ?? block.type;
  return `${label} ${sameTypeIndex + 1}`;
}

export function SettingsOverlay({ sections }: SettingsOverlayProps) {
  const { state, dispatch } = usePageBuilder();
  const { selection, viewport } = state;
  const { resolvedMode } = useColorMode();
  // In light mode all settings copy must be pure black — including the
  // secondary/muted shades that normally render in gray. We override the
  // theme-text CSS variables on the overlay root so every descendant using
  // a `text-theme-*` utility inherits black without us having to retag each
  // label. Specific color classes (e.g. the destructive red on the footer
  // delete) are unaffected because they don't read these variables.
  const lightModeBlackTextStyle: React.CSSProperties | undefined =
    resolvedMode === "light"
      ? ({
          "--color-text-primary": "#000",
          "--color-text-secondary": "#000",
          "--color-text-muted": "#000",
        } as React.CSSProperties)
      : undefined;

  // Track entrance animation. We set `entered=true` on the next frame after
  // mount so the slide-in transition runs.
  const [entered, setEntered] = useState(false);
  // Modal for "section has blocks" confirm
  const [confirmDelete, setConfirmDelete] = useState<{
    label: string;
    sectionId: string;
    blockCount: number;
  } | null>(null);
  const backArrowRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Esc closes the overlay (or the inner confirm modal first).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (confirmDelete) {
        e.preventDefault();
        setConfirmDelete(null);
        return;
      }
      e.preventDefault();
      dispatch({ type: "clearSelection" });
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [dispatch, confirmDelete]);

  // Tab order: back arrow → name field → settings → delete. Auto-focus the
  // back arrow on mount so keyboard users start at the top of the overlay.
  // `preventScroll: true` is critical here — on first mount the overlay is
  // still translated off-screen (translate-x-full) for the slide-in, so a
  // default focus() asks the browser to scroll the off-screen button into
  // view, producing a visible jump under the still-sliding overlay.
  useEffect(() => {
    backArrowRef.current?.focus({ preventScroll: true });
    // We re-focus when the active selection target changes.
  }, [
    selection.kind,
    selection.kind !== "none" ? selection.sectionId : null,
    selection.kind === "column" || selection.kind === "block"
      ? selection.columnId
      : null,
    selection.kind === "block" ? selection.blockId : null,
  ]);

  // Resolve current selection to live objects. If anything is missing we close
  // the overlay (selection points at deleted state).
  if (selection.kind === "none") return null;

  const section = sections.find((s) => s.id === selection.sectionId);
  if (!section) {
    // Late-arriving selection cleanup. Defer to a microtask so we don't dispatch
    // during render.
    queueMicrotask(() => dispatch({ type: "clearSelection" }));
    return null;
  }
  const sectionIndex = sections.indexOf(section);

  const renderHeaderAndBody = () => {
    if (selection.kind === "section") {
      const placeholder = `Section ${sectionIndex + 1}`;
      return {
        breadcrumb: "Section",
        title: section.name ?? "",
        placeholder,
        onRename: (next: string) =>
          dispatch({
            type: "renameSection",
            sectionId: section.id,
            name: next,
          }),
        body: (
          <SectionSettings
            section={section}
            viewport={viewport}
            onUpdate={(updates) => {
              if (
                updates.name !== undefined &&
                Object.keys(updates).length === 1
              ) {
                dispatch({
                  type: "renameSection",
                  sectionId: section.id,
                  name: updates.name,
                });
                return;
              }
              dispatch({
                type: "updateSection",
                sectionId: section.id,
                updates,
              });
            }}
            onUpdateColumn={(columnId, updates) =>
              dispatch({
                type: "updateColumn",
                sectionId: section.id,
                columnId,
                updates,
              })
            }
          />
        ),
        deleteLabel: "Delete section",
        onDelete: () => {
          const blockCount = section.columns.reduce(
            (n, c) => n + c.blocks.length,
            0
          );
          const label = section.name?.trim() || `Section ${sectionIndex + 1}`;
          if (blockCount === 0) {
            const snapshot = section;
            const insertAt = sectionIndex;
            dispatch({ type: "deleteSection", sectionId: section.id });
            toast.success(`${label} deleted`, {
              duration: 5000,
              action: {
                label: "Undo",
                onClick: () => {
                  const restored = [...state.sections];
                  restored.splice(
                    Math.min(insertAt, restored.length),
                    0,
                    snapshot
                  );
                  dispatch({ type: "setSections", sections: restored });
                },
              },
            });
            return;
          }
          setConfirmDelete({ label, sectionId: section.id, blockCount });
        },
      };
    }

    // Column/block branches need the column.
    const column = section.columns.find((c) => c.id === selection.columnId);
    if (!column) {
      queueMicrotask(() => dispatch({ type: "clearSelection" }));
      return null;
    }
    const columnIndex = section.columns.indexOf(column);

    if (selection.kind === "column") {
      const placeholder = defaultColumnName(columnIndex);
      return {
        breadcrumb: `${
          section.name?.trim() || `Section ${sectionIndex + 1}`
        } / Column`,
        title: column.name ?? "",
        placeholder,
        onRename: (next: string) =>
          dispatch({
            type: "renameColumn",
            sectionId: section.id,
            columnId: column.id,
            name: next,
          }),
        body: (
          <ColumnSettings
            column={column}
            index={columnIndex}
            totalColumns={section.columns.length}
            viewport={viewport}
            onUpdate={(updates) =>
              dispatch({
                type: "updateColumn",
                sectionId: section.id,
                columnId: column.id,
                updates,
              })
            }
          />
        ),
        deleteLabel: "Delete column",
        onDelete: () => {
          const label = column.name?.trim() || defaultColumnName(columnIndex);
          const snapshotColumns = section.columns;
          const nextColumns = section.columns.filter(
            (c) => c.id !== column.id
          );
          dispatch({
            type: "updateSection",
            sectionId: section.id,
            updates: { columns: nextColumns },
          });
          dispatch({ type: "clearSelection" });
          toast.success(`${label} deleted`, {
            duration: 5000,
            action: {
              label: "Undo",
              onClick: () => {
                dispatch({
                  type: "updateSection",
                  sectionId: section.id,
                  updates: { columns: snapshotColumns },
                });
              },
            },
          });
        },
      };
    }

    // Block branch — split into "card-nested" vs "top-of-column".
    const cardBlockId =
      selection.kind === "block" ? selection.cardBlockId : undefined;
    if (cardBlockId) {
      // Card-nested selection: look up the host card first, then the child.
      const cardBlock = column.blocks.find((b) => b.id === cardBlockId);
      if (!cardBlock || cardBlock.type !== "card") {
        queueMicrotask(() => dispatch({ type: "clearSelection" }));
        return null;
      }
      const cardChildren =
        (cardBlock.content as CardBlockContent).blocks ?? [];
      const child = cardChildren.find((b) => b.id === selection.blockId);
      if (!child) {
        queueMicrotask(() => dispatch({ type: "clearSelection" }));
        return null;
      }
      const childIndex = cardChildren.indexOf(child);
      const sameTypeIndex = cardChildren
        .filter((b) => b.type === child.type)
        .indexOf(child);
      const cardLabel =
        cardBlock.name?.trim() ||
        (BLOCK_TYPES.find((t) => t.type === "card")?.label ?? "Card");
      const placeholder = defaultBlockName(child, sameTypeIndex);
      return {
        breadcrumb: `${
          section.name?.trim() || `Section ${sectionIndex + 1}`
        } / ${column.name?.trim() || defaultColumnName(columnIndex)} / ${cardLabel} / ${
          BLOCK_TYPES.find((t) => t.type === child.type)?.label ?? child.type
        }`,
        title: child.name ?? "",
        placeholder,
        // No card-nested rename reducer in this pass — renaming a card-nested
        // block is a no-op for now (the placeholder still shows the
        // type-based default). Promote to a dedicated action if users start
        // asking for it.
        onRename: (_next: string) => {
          void _next;
        },
        body: (
          <BlockSettings
            block={child}
            onUpdate={(content) =>
              dispatch({
                type: "updateBlockInCard",
                cardBlockId: cardBlock.id,
                blockId: child.id,
                content,
              })
            }
            onUpdateMeta={(partial) =>
              dispatch({
                type: "updateBlockMeta",
                blockId: child.id,
                partial,
              })
            }
          />
        ),
        deleteLabel: "Delete block",
        onDelete: () => {
          const label =
            child.name?.trim() || defaultBlockName(child, sameTypeIndex);
          const snapshotChild = child;
          const insertAt = childIndex;
          dispatch({
            type: "deleteBlockFromCard",
            cardBlockId: cardBlock.id,
            blockId: child.id,
          });
          toast.success(`${label} deleted`, {
            duration: 5000,
            action: {
              label: "Undo",
              onClick: () => {
                dispatch({
                  type: "addBlockToCard",
                  cardBlockId: cardBlock.id,
                  block: snapshotChild,
                  index: insertAt,
                });
              },
            },
          });
        },
      };
    }

    // Lookup the block — needed by the block branch.
    const block = column.blocks.find((b) => b.id === selection.blockId);
    if (!block) {
      queueMicrotask(() => dispatch({ type: "clearSelection" }));
      return null;
    }

    const blockIndex = column.blocks.indexOf(block);
    const sameTypeIndex = column.blocks
      .filter((b) => b.type === block.type)
      .indexOf(block);
    const placeholder = defaultBlockName(block, sameTypeIndex);
    return {
      breadcrumb: `${
        section.name?.trim() || `Section ${sectionIndex + 1}`
      } / ${column.name?.trim() || defaultColumnName(columnIndex)} / ${
        BLOCK_TYPES.find((t) => t.type === block.type)?.label ?? block.type
      }`,
      title: block.name ?? "",
      placeholder,
      onRename: (next: string) =>
        dispatch({
          type: "renameBlock",
          sectionId: section.id,
          columnId: column.id,
          blockId: block.id,
          name: next,
        }),
      body: (
        <BlockSettings
          block={block}
          onUpdate={(content) =>
            dispatch({
              type: "updateBlock",
              sectionId: section.id,
              columnId: column.id,
              blockId: block.id,
              content,
            })
          }
          onUpdateMeta={(partial) =>
            dispatch({
              type: "updateBlockMeta",
              blockId: block.id,
              partial,
            })
          }
        />
      ),
      deleteLabel: "Delete block",
      onDelete: () => {
        const label =
          block.name?.trim() || defaultBlockName(block, sameTypeIndex);
        const snapshotBlock = block;
        const insertAt = blockIndex;
        dispatch({
          type: "deleteBlock",
          sectionId: section.id,
          columnId: column.id,
          blockId: block.id,
        });
        toast.success(`${label} deleted`, {
          duration: 5000,
          action: {
            label: "Undo",
            onClick: () => {
              dispatch({
                type: "addBlock",
                sectionId: section.id,
                columnId: column.id,
                block: snapshotBlock,
              });
              // Re-order so the restored block lands at its original position.
              // Reducer is synchronous; we still defer one tick so the next
              // dispatch reads the live state via the React ref bridge.
              setTimeout(() => {
                const liveSection = state.sections.find(
                  (s) => s.id === section.id
                );
                const liveColumn = liveSection?.columns.find(
                  (c) => c.id === column.id
                );
                if (!liveColumn) return;
                const ids = liveColumn.blocks
                  .filter((b) => b.id !== snapshotBlock.id)
                  .map((b) => b.id);
                ids.splice(insertAt, 0, snapshotBlock.id);
                dispatch({
                  type: "reorderBlocks",
                  sectionId: section.id,
                  columnId: column.id,
                  blockIds: ids,
                });
              }, 0);
            },
          },
        });
      },
    };
  };

  const resolved = renderHeaderAndBody();
  if (!resolved) return null;
  const { breadcrumb, title, placeholder, onRename, body, deleteLabel, onDelete } =
    resolved;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div
      className={cn(
        "absolute inset-0 z-20 flex flex-col bg-theme-secondary",
        "border-r border-theme",
        "transition-transform duration-300 ease-out will-change-transform",
        entered ? "translate-x-0" : "translate-x-full"
      )}
      style={lightModeBlackTextStyle}
      role="dialog"
      aria-label={`${breadcrumb} settings`}
    >
      {/* Header */}
      <div className="flex-shrink-0 p-3 border-b border-theme">
        <div className="flex items-center gap-2 mb-2">
          <button
            ref={backArrowRef}
            type="button"
            onClick={() => dispatch({ type: "clearSelection" })}
            className="p-1.5 rounded-lg hover:bg-theme-tertiary text-theme-secondary hover:text-theme-primary transition-colors cursor-pointer"
            title="Back to sections"
            aria-label="Back to sections"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 19.5L8.25 12l7.5-7.5"
              />
            </svg>
          </button>
          <div className="min-w-0 flex-1 text-xs text-theme-muted truncate">
            {breadcrumb}
          </div>
        </div>
        <RenamableLabel
          value={title}
          placeholder={placeholder}
          onChange={onRename}
          className="block w-full text-base font-medium text-theme-primary"
        />
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">{body}</div>

      {/* Footer */}
      <div className="flex-shrink-0 border-t border-theme p-3">
        <button
          type="button"
          onClick={onDelete}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/30 rounded-lg transition-colors cursor-pointer"
        >
          <TrashIcon />
          {deleteLabel}
        </button>
      </div>

      {/* Confirm modal for non-empty section deletion */}
      {confirmDelete && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/60"
          role="dialog"
          aria-modal="true"
          aria-label="Confirm delete"
          onClick={() => setConfirmDelete(null)}
        >
          <div
            className="m-4 w-full max-w-sm bg-theme-primary border border-theme rounded-lg shadow-2xl p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-theme-primary">
              Delete {confirmDelete.label}?
            </h3>
            <p className="text-sm text-theme-secondary">
              This section contains {confirmDelete.blockCount} block
              {confirmDelete.blockCount === 1 ? "" : "s"}. This can&rsquo;t be
              undone.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="px-3 py-1.5 text-sm rounded-lg border border-theme text-theme-secondary hover:bg-theme-tertiary cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  dispatch({
                    type: "deleteSection",
                    sectionId: confirmDelete.sectionId,
                  });
                  setConfirmDelete(null);
                }}
                className="px-3 py-1.5 text-sm rounded-lg bg-red-500 hover:bg-red-600 text-white cursor-pointer"
              >
                Delete section
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
