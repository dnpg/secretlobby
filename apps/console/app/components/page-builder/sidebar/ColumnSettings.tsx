import type { Column, ViewportSize } from "../state/types";

// Inline Column Settings Panel
interface ColumnSettingsProps {
  column: Column;
  index: number;
  totalColumns: number;
  viewport: ViewportSize;
  onUpdate: (updates: Partial<Column>) => void;
}

export function ColumnSettings({ column, index, totalColumns, viewport, onUpdate }: ColumnSettingsProps) {
  const displayWidth = viewport === "tablet" ? (column.tabletWidth || column.width) : column.width;

  return (
    <div className="p-3 space-y-4">
      <div>
        <label className="block text-sm font-medium text-white mb-2">
          Column {index + 1} of {totalColumns}
        </label>
      </div>

      {/* Block Gap (gap between blocks in this column) */}
      <div>
        <label className="block text-sm font-medium text-white mb-2">Block Gap</label>
        <input
          type="text"
          value={column.blockGap || "8"}
          onChange={(e) => onUpdate({ blockGap: e.target.value })}
          placeholder="e.g., 8, 1rem"
          className="w-full px-3 py-2 text-sm bg-theme-tertiary border border-theme rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
        />
        <p className="text-xs text-gray-400 mt-1">Vertical spacing between blocks. Numbers default to px.</p>
      </div>

      {/* Width */}
      {totalColumns > 1 && (
        <div>
          <label className="block text-sm font-medium text-white mb-2">
            Width
            {viewport === "tablet" && <span className="text-xs text-gray-400 ml-2">(Tablet)</span>}
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={displayWidth}
              onChange={(e) => {
                if (viewport === "tablet") {
                  onUpdate({ tabletWidth: e.target.value });
                } else {
                  onUpdate({ width: e.target.value });
                }
              }}
              placeholder="50%, 33.33%"
              className="flex-1 px-3 py-2 text-sm bg-theme-tertiary border border-theme rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            {viewport === "tablet" && column.tabletWidth && (
              <button
                onClick={() => onUpdate({ tabletWidth: undefined })}
                className="text-xs text-gray-500 hover:text-red-400 cursor-pointer px-2"
                title="Reset to desktop width"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
