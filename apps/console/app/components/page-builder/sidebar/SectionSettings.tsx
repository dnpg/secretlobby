import { useMemo } from "react";
import { cn } from "@secretlobby/ui";
import type { Column, Section, ViewportSize } from "../state/types";
import {
  generateId,
  getEqualColumnWidth,
  parseWidthToPercent,
} from "../state/helpers";
import { MobileIcon } from "../icons";

// Inline Section Settings Panel (rendered inside the SettingsOverlay).
// Phase 3: deletion is owned by the overlay footer, so no Delete button here.
interface SectionSettingsProps {
  section: Section;
  onUpdate: (updates: Partial<Section>) => void;
  onUpdateColumn: (columnId: string, updates: Partial<Column>) => void;
  viewport: ViewportSize;
}

export function SectionSettings({
  section,
  onUpdate,
  onUpdateColumn,
  viewport,
}: SectionSettingsProps) {
  const columnCount = section.columns.length;

  // Check if columns have been manually resized (not equal widths)
  const hasManualWidths = useMemo(() => {
    if (columnCount <= 1) return false;
    const percents = section.columns.map((col) => parseWidthToPercent(col.width, columnCount));
    const equalPercent = 100 / columnCount;
    // Check if any column differs from equal by more than 1%
    return percents.some((p) => Math.abs(p - equalPercent) > 1);
  }, [section.columns, columnCount]);

  // Handle changing column count
  const handleColumnCountChange = (newCount: number) => {
    if (newCount === columnCount) return;

    if (!hasManualWidths) {
      // Columns are equal - just set new equal widths
      const equalWidth = getEqualColumnWidth(newCount);
      const newColumns = Array.from({ length: newCount }, (_, i) => ({
        id: i < section.columns.length ? section.columns[i].id : generateId("col"),
        width: equalWidth,
        blocks: i < section.columns.length ? section.columns[i].blocks : [],
      }));
      onUpdate({ columns: newColumns });
    } else if (newCount > columnCount) {
      // Adding columns - shrink existing ones proportionally to make room
      const columnsToAdd = newCount - columnCount;

      // Calculate current percentages
      const currentPercents = section.columns.map((col) =>
        parseWidthToPercent(col.width, columnCount)
      );
      const currentTotal = currentPercents.reduce((sum, p) => sum + p, 0);

      // New column gets equal share of what would be equal distribution
      const newColumnPercent = 100 / newCount;
      const spaceForNewColumns = newColumnPercent * columnsToAdd;
      const remainingSpace = 100 - spaceForNewColumns;

      // Scale down existing columns proportionally (store clean percentages)
      const scaleFactor = remainingSpace / currentTotal;
      const updatedColumns = section.columns.map((col, i) => {
        const newPercent = Math.round(currentPercents[i] * scaleFactor * 10) / 10;
        return {
          ...col,
          width: `${newPercent}%`,
        };
      });

      // Add new columns with percentage width
      const newColumns = Array.from({ length: columnsToAdd }, () => ({
        id: generateId("col"),
        width: `${newColumnPercent.toFixed(2)}%`,
        blocks: [],
      }));

      onUpdate({ columns: [...updatedColumns, ...newColumns] });
    } else {
      // Removing columns - redistribute space to remaining columns
      const columnsToKeep = section.columns.slice(0, newCount);
      const currentPercents = columnsToKeep.map((col) =>
        parseWidthToPercent(col.width, columnCount)
      );
      const currentTotal = currentPercents.reduce((sum, p) => sum + p, 0);

      // Scale up remaining columns to fill 100%
      const scaleFactor = 100 / currentTotal;
      const updatedColumns = columnsToKeep.map((col, i) => {
        const newPercent = Math.round(currentPercents[i] * scaleFactor * 10) / 10;
        return {
          ...col,
          width: newCount === 1 ? "100%" : `${newPercent}%`,
        };
      });

      onUpdate({ columns: updatedColumns });
    }
  };

  return (
    <div className="p-3 space-y-4">
          {/* Column Count */}
          <div>
            <label className="block text-sm font-medium text-theme-primary mb-2">Columns</label>
            <div className="grid grid-cols-4 gap-2">
              {([1, 2, 3, 4] as const).map((num) => (
                <button
                  key={num}
                  onClick={() => handleColumnCountChange(num)}
                  className={cn(
                    "p-2 text-sm rounded-lg border transition-colors cursor-pointer",
                    columnCount === num
                      ? "bg-[var(--color-brand-red-muted)] border-[var(--color-brand-red)] text-[var(--color-brand-red)]"
                      : "border-theme text-theme-secondary hover:bg-theme-tertiary hover:text-theme-primary"
                  )}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          {/* Column Widths */}
          {columnCount > 1 && (
            <div>
              <label className="block text-sm font-medium text-theme-primary mb-2">
                Column Widths
                {viewport === "tablet" && <span className="text-xs text-theme-secondary ml-2">(Tablet)</span>}
                {viewport === "mobile" && <span className="text-xs text-theme-secondary ml-2">(Mobile)</span>}
              </label>
              {viewport === "mobile" && section.mobileLayout === "stack" ? (
                <p className="text-sm text-theme-secondary">Columns are stacked at 100% width on mobile</p>
              ) : (
                <>
                  <div className="space-y-2">
                    {section.columns.map((col, idx) => {
                      // Show tabletWidth on tablet if set, otherwise fall back to width
                      const displayValue = viewport === "tablet"
                        ? (col.tabletWidth || col.width)
                        : col.width;

                      return (
                        <div key={col.id} className="flex items-center gap-2">
                          <span className="text-xs text-theme-secondary w-12">Col {idx + 1}</span>
                          <input
                            type="text"
                            value={displayValue}
                            onChange={(e) => {
                              if (viewport === "tablet") {
                                onUpdateColumn(col.id, { tabletWidth: e.target.value });
                              } else {
                                onUpdateColumn(col.id, { width: e.target.value });
                              }
                            }}
                            placeholder="50%, 33.33%"
                            className="flex-1 px-2 py-1 text-sm bg-theme-tertiary border border-theme rounded text-theme-primary placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-red)]"
                          />
                          {viewport === "tablet" && col.tabletWidth && (
                            <button
                              onClick={() => onUpdateColumn(col.id, { tabletWidth: undefined })}
                              className="text-xs text-theme-muted hover:text-red-400 cursor-pointer"
                              title="Reset to desktop width"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-theme-secondary mt-1">
                    {viewport === "tablet" ? "Tablet overrides desktop widths" : "Desktop widths (base)"}
                  </p>
                </>
              )}
            </div>
          )}

          {/* Column Gap */}
          <div>
            <label className="block text-sm font-medium text-theme-primary mb-2">Column Gap</label>
            <input
              type="text"
              value={section.columnGap}
              onChange={(e) => onUpdate({ columnGap: e.target.value })}
              placeholder="e.g., 16, 1rem, 10%"
              className="w-full px-3 py-2 text-sm bg-theme-tertiary border border-theme rounded-lg text-theme-primary placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-red)] focus:border-transparent"
            />
            <p className="text-xs text-theme-secondary mt-1">Numbers default to px</p>
          </div>

          {/* Row Gap */}
          <div>
            <label className="block text-sm font-medium text-theme-primary mb-2">Row Gap</label>
            <input
              type="text"
              value={section.rowGap}
              onChange={(e) => onUpdate({ rowGap: e.target.value })}
              placeholder="e.g., 16, 1rem, 10%"
              className="w-full px-3 py-2 text-sm bg-theme-tertiary border border-theme rounded-lg text-theme-primary placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-red)] focus:border-transparent"
            />
            <p className="text-xs text-theme-secondary mt-1">Numbers default to px</p>
          </div>

          {/* Mobile Layout */}
          <div className="pt-2 border-t border-theme">
            <label className="flex items-center gap-2 text-sm font-medium text-theme-primary mb-2">
              <MobileIcon /> Mobile Layout
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name={`mobile-${section.id}`}
                  checked={section.mobileLayout === "stack"}
                  onChange={() => onUpdate({ mobileLayout: "stack" })}
                  className="accent-[var(--color-brand-red)]"
                />
                <span className="text-sm text-theme-secondary">Stack (1 column)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name={`mobile-${section.id}`}
                  checked={section.mobileLayout === "keep"}
                  onChange={() => onUpdate({ mobileLayout: "keep", mobileColumns: 2 })}
                  className="accent-[var(--color-brand-red)]"
                />
                <span className="text-sm text-theme-secondary">Keep columns</span>
              </label>
              {section.mobileLayout === "keep" && (
                <div className="ml-6 flex items-center gap-2">
                  <span className="text-xs text-theme-secondary">Columns:</span>
                  <div className="flex gap-1">
                    {([1, 2] as const).map((num) => (
                      <button
                        key={num}
                        onClick={() => onUpdate({ mobileColumns: num })}
                        className={cn(
                          "px-2 py-1 text-xs rounded border transition-colors cursor-pointer",
                          section.mobileColumns === num
                            ? "bg-[var(--color-brand-red-muted)] border-[var(--color-brand-red)] text-[var(--color-brand-red)]"
                            : "border-theme text-theme-secondary hover:bg-theme-tertiary"
                        )}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name={`mobile-${section.id}`}
                  checked={section.mobileLayout === "slider"}
                  onChange={() => onUpdate({ mobileLayout: "slider" })}
                  className="accent-[var(--color-brand-red)]"
                />
                <span className="text-sm text-theme-secondary">Horizontal slider</span>
              </label>
            </div>
          </div>

    </div>
  );
}
