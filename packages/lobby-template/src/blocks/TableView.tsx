// =============================================================================
// TableView
// -----------------------------------------------------------------------------
// Static table renderer. The persisted shape is a rectangular grid where each
// cell is an `InlineDoc`, plus a `headerRow` flag indicating whether the
// first row should be styled as `<th>` cells inside a `<thead>`.
//
// Empty / malformed tables (no rows, or zero columns) render as nothing —
// matches the editor's behaviour and avoids painting a 0×0 visual artifact.
// =============================================================================

import type { TableBlockContent } from "./types";
import { InlineContent } from "./inlineDoc";

export interface TableViewProps {
  content: TableBlockContent;
}

export function TableView({ content }: TableViewProps) {
  const rows = Array.isArray(content.rows) ? content.rows : [];
  if (rows.length === 0) return null;
  if (!rows[0]?.cells || rows[0].cells.length === 0) return null;

  const headerRow = content.headerRow ? rows[0] : null;
  const bodyRows = headerRow ? rows.slice(1) : rows;

  return (
    <table
      className="w-full border-collapse text-sm"
      style={{ borderColor: "var(--color-border)" }}
    >
      {headerRow && (
        <thead>
          <tr>
            {headerRow.cells.map((cell, ci) => (
              <th
                key={ci}
                className="border px-3 py-2 text-left font-semibold"
                style={{ borderColor: "var(--color-border)" }}
              >
                <InlineContent doc={cell} />
              </th>
            ))}
          </tr>
        </thead>
      )}
      <tbody>
        {bodyRows.map((row, ri) => (
          <tr key={ri}>
            {row.cells.map((cell, ci) => (
              <td
                key={ci}
                className="border px-3 py-2 align-top"
                style={{ borderColor: "var(--color-border)" }}
              >
                <InlineContent doc={cell} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
