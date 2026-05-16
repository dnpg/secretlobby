import { cn } from "@secretlobby/ui";
import type {
  BlockContent,
  InlineDoc,
  TableBlockContent,
} from "../../state/types";
import { InlineEditor } from "./inline/InlineEditor";

interface TableBlockProps {
  content: TableBlockContent;
  isSelected: boolean;
  isEditing: boolean;
  onUpdate?: (content: Partial<BlockContent>) => void;
}

function emptyInlineDoc(): InlineDoc {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

// Editable table. Each cell mounts its own tiny inline editor; the
// contextual toolbar (visible when selected) drives row/column mutations on
// the content shape.
export function TableBlock({
  content,
  isSelected,
  isEditing,
  onUpdate,
}: TableBlockProps) {
  const { rows, headerRow } = content;
  const colCount = rows[0]?.cells.length ?? 0;

  const update = (next: Partial<TableBlockContent>) =>
    onUpdate?.(next as Partial<BlockContent>);

  const updateCell = (rowIdx: number, colIdx: number, value: InlineDoc) => {
    const nextRows = rows.map((row, rIdx) =>
      rIdx !== rowIdx
        ? row
        : {
            cells: row.cells.map((cell, cIdx) =>
              cIdx === colIdx ? value : cell
            ),
          }
    );
    update({ rows: nextRows });
  };

  const addRow = (at: number) => {
    const newRow = {
      cells: Array.from({ length: colCount }, () => emptyInlineDoc()),
    };
    const nextRows = [...rows];
    nextRows.splice(at, 0, newRow);
    update({ rows: nextRows });
  };

  const deleteRow = (idx: number) => {
    if (rows.length <= 1) return;
    update({ rows: rows.filter((_, i) => i !== idx) });
  };

  const addColumn = (at: number) => {
    const nextRows = rows.map((row) => {
      const cells = [...row.cells];
      cells.splice(at, 0, emptyInlineDoc());
      return { cells };
    });
    update({ rows: nextRows });
  };

  const deleteColumn = (idx: number) => {
    if (colCount <= 1) return;
    const nextRows = rows.map((row) => ({
      cells: row.cells.filter((_, i) => i !== idx),
    }));
    update({ rows: nextRows });
  };

  const toggleHeader = () => update({ headerRow: !headerRow });

  return (
    <div className="w-full">
      {isEditing && isSelected && (
        <div
          data-no-dnd-keyboard="true"
          className="mb-2 flex flex-wrap gap-1 text-[11px]"
        >
          <ToolbarButton onClick={() => addRow(rows.length)}>+ Row below</ToolbarButton>
          <ToolbarButton onClick={() => addRow(Math.max(0, rows.length - 1))}>+ Row above</ToolbarButton>
          <ToolbarButton onClick={() => deleteRow(rows.length - 1)}>Del last row</ToolbarButton>
          <ToolbarButton onClick={() => addColumn(colCount)}>+ Col right</ToolbarButton>
          <ToolbarButton onClick={() => addColumn(0)}>+ Col left</ToolbarButton>
          <ToolbarButton onClick={() => deleteColumn(colCount - 1)}>Del last col</ToolbarButton>
          <ToolbarButton onClick={toggleHeader}>
            {headerRow ? "Plain rows" : "Header row"}
          </ToolbarButton>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <tbody>
            {rows.map((row, rowIdx) => {
              const isHeader = headerRow && rowIdx === 0;
              const CellTag = isHeader ? "th" : "td";
              return (
                <tr key={rowIdx}>
                  {row.cells.map((cell, colIdx) => (
                    <CellTag
                      key={colIdx}
                      className={cn(
                        "align-top p-2 min-w-[80px]",
                        isHeader && "font-semibold"
                      )}
                      style={{ border: "1px solid var(--color-border)" }}
                    >
                      <InlineEditor
                        value={cell}
                        onChange={(next) => updateCell(rowIdx, colIdx, next)}
                        isSelected={isSelected}
                        isEditing={isEditing}
                        placeholder={isHeader ? "Heading" : "Cell"}
                      />
                    </CellTag>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ToolbarButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={(e) => e.stopPropagation()}
      className="px-2 py-1 rounded bg-theme-tertiary border border-theme text-theme-secondary hover:text-theme-primary hover:border-[var(--color-brand-red)] cursor-pointer"
    >
      {children}
    </button>
  );
}
