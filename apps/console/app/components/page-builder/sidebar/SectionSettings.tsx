// =============================================================================
// SectionSettings (v3 grid)
// -----------------------------------------------------------------------------
// Right-rail settings panel for a selected section. v3 replaces the old
// per-column width inputs with a single `grid-template-columns` text input
// per viewport (desktop / tablet) plus an optional mobile template that's
// only consulted when `mobileLayout === "grid"`.
//
// Column count still drives how many columns are in the section, but the
// sizing is owned entirely by the section's grid template. Switching count
// rebuilds the template with an even fr split (`"1fr 1fr"` for 2 cols,
// `"1fr 1fr 1fr"` for 3, …) — designers can edit the string after the fact
// to swap in pixel / minmax / repeat tokens.
// =============================================================================

import { cn } from "@secretlobby/ui";
import { equalGridTemplate } from "@secretlobby/lobby-template";
import type { Column, Section, ViewportSize } from "../state/types";
import { generateId } from "../state/helpers";
import { MobileIcon } from "../icons";

// Inline Section Settings Panel (rendered inside the SettingsOverlay).
// Phase 3: deletion is owned by the overlay footer, so no Delete button here.
interface SectionSettingsProps {
  section: Section;
  onUpdate: (updates: Partial<Section>) => void;
  onUpdateColumn: (columnId: string, updates: Partial<Column>) => void;
  viewport: ViewportSize;
}

// Quick-pick presets surfaced as buttons next to the desktop template input.
// Tuned to the common designer patterns (two equal columns, sidebar-on-right,
// sidebar-on-left, three equal columns). Each preset overwrites the template
// untouched — designers can fine-tune the string after picking.
const DESKTOP_PRESETS: Array<{ label: string; template: string; columns: number }> = [
  { label: "1fr", template: "1fr", columns: 1 },
  { label: "1fr 1fr", template: "1fr 1fr", columns: 2 },
  { label: "1fr 300px", template: "1fr 300px", columns: 2 },
  { label: "300px 1fr", template: "300px 1fr", columns: 2 },
  { label: "2fr 1fr", template: "2fr 1fr", columns: 2 },
  { label: "1fr 1fr 1fr", template: "1fr 1fr 1fr", columns: 3 },
];

export function SectionSettings({
  section,
  onUpdate,
  onUpdateColumn: _onUpdateColumn,
  viewport,
}: SectionSettingsProps) {
  void _onUpdateColumn; // legacy: per-column width writes are no longer used
  const columnCount = section.columns.length;

  // Reconcile the section's column count with whatever the new grid template
  // implies. We trim or extend `section.columns` to match by ID stability —
  // existing columns keep their blocks, new ones seed empty.
  const ensureColumnCount = (
    nextCount: number,
    nextTemplate: string
  ): Partial<Section> => {
    if (nextCount === columnCount) {
      return { gridTemplateDesktop: nextTemplate };
    }
    const nextColumns =
      nextCount > columnCount
        ? [
            ...section.columns,
            ...Array.from({ length: nextCount - columnCount }, () => ({
              id: generateId("col"),
              blocks: [],
            })),
          ]
        : section.columns.slice(0, nextCount);
    return { columns: nextColumns, gridTemplateDesktop: nextTemplate };
  };

  // Column count change: rebuild the desktop template as an even fr split
  // and reconcile the columns array.
  const handleColumnCountChange = (newCount: number) => {
    if (newCount === columnCount) return;
    onUpdate(ensureColumnCount(newCount, equalGridTemplate(newCount)));
  };

  const handleDesktopPresetClick = (preset: (typeof DESKTOP_PRESETS)[number]) => {
    onUpdate(ensureColumnCount(preset.columns, preset.template));
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

      {/* v3 grid templates — desktop + optional tablet/mobile overrides. */}
      {columnCount > 1 && (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-theme-primary mb-2">
              Desktop grid template
            </label>
            <input
              type="text"
              value={section.gridTemplateDesktop ?? ""}
              onChange={(e) => onUpdate({ gridTemplateDesktop: e.target.value })}
              placeholder="1fr 1fr, 1fr 300px, minmax(0,2fr) 1fr"
              className="w-full px-3 py-2 text-sm bg-theme-tertiary border border-theme rounded-lg text-theme-primary placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-red)] focus:border-transparent font-mono"
            />
            <p className="text-xs text-theme-secondary mt-1">
              CSS <code>grid-template-columns</code> value. Resize handle drags fr tokens.
            </p>
            {/* Preset buttons — quick swap for the most common layouts. */}
            <div className="mt-2 flex flex-wrap gap-1">
              {DESKTOP_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => handleDesktopPresetClick(preset)}
                  className={cn(
                    "px-2 py-1 text-xs rounded border transition-colors cursor-pointer font-mono",
                    section.gridTemplateDesktop === preset.template
                      ? "bg-[var(--color-brand-red-muted)] border-[var(--color-brand-red)] text-[var(--color-brand-red)]"
                      : "border-theme text-theme-secondary hover:bg-theme-tertiary"
                  )}
                  title={`${preset.columns} columns`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-theme-primary mb-2">
              Tablet grid template
              {viewport === "tablet" && (
                <span className="text-xs text-theme-secondary ml-2">(current)</span>
              )}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={section.gridTemplateTablet ?? ""}
                onChange={(e) =>
                  onUpdate({
                    gridTemplateTablet:
                      e.target.value.trim().length === 0 ? undefined : e.target.value,
                  })
                }
                placeholder="(inherits desktop)"
                className="flex-1 px-3 py-2 text-sm bg-theme-tertiary border border-theme rounded-lg text-theme-primary placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-red)] focus:border-transparent font-mono"
              />
              {section.gridTemplateTablet !== undefined && (
                <button
                  onClick={() => onUpdate({ gridTemplateTablet: undefined })}
                  className="text-xs text-theme-muted hover:text-red-400 cursor-pointer px-2"
                  title="Clear tablet override"
                >
                  ✕
                </button>
              )}
            </div>
            <p className="text-xs text-theme-secondary mt-1">
              Falls back to the desktop template when empty.
            </p>
          </div>

          {section.mobileLayout === "grid" && (
            <div>
              <label className="block text-sm font-medium text-theme-primary mb-2">
                Mobile grid template
                {viewport === "mobile" && (
                  <span className="text-xs text-theme-secondary ml-2">(current)</span>
                )}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={section.gridTemplateMobile ?? ""}
                  onChange={(e) =>
                    onUpdate({
                      gridTemplateMobile:
                        e.target.value.trim().length === 0 ? undefined : e.target.value,
                    })
                  }
                  placeholder="1fr, 1fr 1fr, 2fr 1fr"
                  className="flex-1 px-3 py-2 text-sm bg-theme-tertiary border border-theme rounded-lg text-theme-primary placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-red)] focus:border-transparent font-mono"
                />
                {section.gridTemplateMobile !== undefined && (
                  <button
                    onClick={() => onUpdate({ gridTemplateMobile: undefined })}
                    className="text-xs text-theme-muted hover:text-red-400 cursor-pointer px-2"
                    title="Clear mobile override"
                  >
                    ✕
                  </button>
                )}
              </div>
              <p className="text-xs text-theme-secondary mt-1">
                Only used when mobile layout is set to <code>grid</code>.
              </p>
            </div>
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
          {/* v3: explicit mobile grid template. When picked, the section
              reads `gridTemplateMobile` (with desktop as the fallback). */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name={`mobile-${section.id}`}
              checked={section.mobileLayout === "grid"}
              onChange={() => onUpdate({ mobileLayout: "grid" })}
              className="accent-[var(--color-brand-red)]"
            />
            <span className="text-sm text-theme-secondary">Custom grid</span>
          </label>
        </div>
      </div>
    </div>
  );
}
