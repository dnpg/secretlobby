// =============================================================================
// ColumnSettings
// -----------------------------------------------------------------------------
// Right-rail settings panel for a selected column. v3 dropped the per-column
// width input — column sizing now lives on the parent section's grid template
// (`Section.gridTemplateDesktop` / `gridTemplateTablet` / `gridTemplateMobile`).
// To edit a column's width, designers open the SECTION settings and drag the
// track-resize handle or type a new `grid-template-columns` string.
//
// This panel still owns:
//   - Block gap (vertical spacing between blocks inside this column).
//   - Column identity / position (read-only labels).
// =============================================================================

import type { Column, ViewportSize } from "../state/types";

interface ColumnSettingsProps {
  column: Column;
  index: number;
  totalColumns: number;
  viewport: ViewportSize;
  onUpdate: (updates: Partial<Column>) => void;
  disableColumnSizeEditor: boolean;
}

export function ColumnSettings({
  column,
  index,
  totalColumns,
  viewport: _viewport,
  onUpdate,
  disableColumnSizeEditor,
}: ColumnSettingsProps) {
  void _viewport; // v3: width no longer varies per viewport at the column level
  return (
    <div className="p-3 space-y-4">
      <div>
        <label className="block text-sm font-medium text-theme-primary mb-2">
          Column {index + 1} of {totalColumns}
        </label>
      </div>

      {/* Block Gap (gap between blocks in this column) */}
      <div>
        <label className="block text-sm font-medium text-theme-primary mb-2">Block Gap</label>
        <input
          type="text"
          value={column.blockGap || "8"}
          onChange={(e) => onUpdate({ blockGap: e.target.value })}
          placeholder="e.g., 8, 1rem"
          className="w-full px-3 py-2 text-sm bg-theme-tertiary border border-theme rounded-lg text-theme-primary placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
        />
        <p className="text-xs text-theme-secondary mt-1">Vertical spacing between blocks. Numbers default to px.</p>
      </div>

      {/* v3 sizing hint — points designers at the section panel. Hidden
          when the platform-wide flag disables column sizing controls,
          since there's nothing actionable to point the user to. */}
      {totalColumns > 1 && !disableColumnSizeEditor && (
        <div className="rounded-md border border-theme bg-theme-tertiary/40 p-3 text-xs text-theme-secondary">
          Column widths are now set on the parent section's grid template. Open
          the section settings to drag the track-resize handle or edit
          <code className="mx-1 px-1 py-0.5 rounded bg-theme-tertiary font-mono">
            grid-template-columns
          </code>
          directly.
        </div>
      )}
    </div>
  );
}
