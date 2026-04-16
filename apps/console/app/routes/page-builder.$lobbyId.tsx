import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { redirect, useLoaderData, Link } from "react-router";
import type { Route } from "./+types/page-builder.$lobbyId";
import { cn } from "@secretlobby/ui";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";

// Simple ID generator that works in all browsers
function generateId(prefix = "section"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// Generate equal width percentage value
function getEqualColumnWidth(columnCount: number): string {
  if (columnCount === 1) return "100%";
  const percent = 100 / columnCount;
  return `${percent.toFixed(2)}%`;
}

// Helper to create columns with equal widths
function createColumns(count: number, gap = "16px"): Column[] {
  const width = getEqualColumnWidth(count);
  return Array.from({ length: count }, () => ({
    id: generateId("col"),
    width,
  }));
}

// Helper to create a new section
function createSection(columnCount = 1): Section {
  const gap = "16";
  return {
    id: generateId("section"),
    columns: createColumns(columnCount, gap + "px"),
    rowGap: gap,
    columnGap: gap,
    mobileLayout: "stack",
  };
}

type ViewportSize = "desktop" | "tablet" | "mobile";
type EditorTab = "layout" | "design";
type MobileLayout = "stack" | "keep" | "slider";

interface Column {
  id: string;
  width: string; // Desktop width e.g., "50%", "33.33%"
  tabletWidth?: string; // Tablet override (optional)
  // componentIds will be added in Design mode steps
}

interface Section {
  id: string;
  columns: Column[];
  rowGap: string; // e.g., "16", "1rem", "10%"
  columnGap: string;
  mobileLayout: MobileLayout;
  mobileColumns?: 1 | 2; // Only used when mobileLayout is "keep"
}

const VIEWPORT_WIDTHS: Record<ViewportSize, number> = {
  desktop: 1440,
  tablet: 768,
  mobile: 375,
};

// Parse gap value - if just a number, assume px
function parseGapValue(value: string): string {
  if (!value || value === "0") return "0";
  const trimmed = value.trim();
  // If it's just a number, add px
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return `${trimmed}px`;
  }
  return trimmed;
}

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `Page Builder - ${data?.lobby?.name || "Lobby"}` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { getSession, requireUserAuth } = await import("@secretlobby/auth");
  const { getLobbyById } = await import("~/models/queries/lobby.server");
  const { getAccountWithBasicInfo } = await import("~/models/queries/account.server");

  const { session } = await getSession(request);
  requireUserAuth(session);

  const accountId = session.currentAccountId;
  if (!accountId) {
    throw redirect("/login");
  }

  const { lobbyId } = params;
  if (!lobbyId) {
    throw redirect("/lobbies");
  }

  const [lobby, account] = await Promise.all([
    getLobbyById(lobbyId),
    getAccountWithBasicInfo(accountId),
  ]);

  if (!lobby || lobby.accountId !== accountId) {
    throw redirect("/lobbies");
  }

  if (!account) {
    throw redirect("/login");
  }

  return {
    lobby: {
      id: lobby.id,
      name: lobby.name,
      slug: lobby.slug,
      title: lobby.title,
      isDefault: lobby.isDefault,
    },
  };
}

// Icons
function CloseIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function DesktopIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
    </svg>
  );
}

function TabletIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5h3m-6.75 2.25h10.5a2.25 2.25 0 002.25-2.25v-15a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 4.5v15a2.25 2.25 0 002.25 2.25z" />
    </svg>
  );
}

function MobileIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
    </svg>
  );
}

function LayoutIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
    </svg>
  );
}

function DesignIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
    </svg>
  );
}

function PlusIcon({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" />
    </svg>
  );
}

function GripIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  );
}

function ChevronUpIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

function DragHandleIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
      <path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
    </svg>
  );
}

// Floating Settings Panel Component
interface SettingsPanelProps {
  section: Section;
  onUpdate: (updates: Partial<Section>) => void;
  onUpdateColumn: (columnId: string, updates: Partial<Column>) => void;
  onDelete: () => void;
  onClose: () => void;
  viewport: ViewportSize;
}

function SectionSettingsPanel({ section, onUpdate, onUpdateColumn, onDelete, onClose, viewport }: SettingsPanelProps) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; initialX: number; initialY: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const columnCount = section.columns.length;

  // Position panel on the right side initially
  useEffect(() => {
    if (panelRef.current) {
      const panelWidth = panelRef.current.offsetWidth;
      setPosition({ x: window.innerWidth - panelWidth - 32, y: 100 });
    }
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return;
    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialX: position.x,
      initialY: position.y,
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !dragRef.current) return;
      const deltaX = e.clientX - dragRef.current.startX;
      const deltaY = e.clientY - dragRef.current.startY;
      setPosition({
        x: dragRef.current.initialX + deltaX,
        y: dragRef.current.initialY + deltaY,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragRef.current = null;
    };

    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

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
    <div
      ref={panelRef}
      className={cn(
        "fixed z-50 bg-theme-secondary border border-theme rounded-lg shadow-2xl transition-all",
        isDragging ? "cursor-grabbing" : ""
      )}
      style={{ left: position.x, top: position.y, width: isMinimized ? "auto" : 320 }}
    >
      {/* Panel Header */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b border-theme cursor-grab"
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-2 text-white">
          <GripIcon />
          <span className="text-sm font-medium text-white">Section Settings</span>
        </div>
        <div className="flex items-center gap-1" data-no-drag>
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1 rounded hover:bg-theme-tertiary text-theme-secondary hover:text-theme-primary transition-colors cursor-pointer"
            title={isMinimized ? "Expand" : "Minimize"}
          >
            {isMinimized ? <ChevronDownIcon /> : <ChevronUpIcon />}
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-theme-tertiary text-theme-secondary hover:text-theme-primary transition-colors cursor-pointer"
            title="Close"
          >
            <CloseIcon />
          </button>
        </div>
      </div>

      {/* Panel Content */}
      {!isMinimized && (
        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto" data-no-drag>
          {/* Column Count */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">Columns</label>
            <div className="grid grid-cols-4 gap-2">
              {([1, 2, 3, 4] as const).map((num) => (
                <button
                  key={num}
                  onClick={() => handleColumnCountChange(num)}
                  className={cn(
                    "p-2 text-sm rounded-lg border transition-colors cursor-pointer",
                    columnCount === num
                      ? "bg-[var(--color-brand-red-muted)] border-[var(--color-brand-red)] text-[var(--color-brand-red)]"
                      : "border-theme text-gray-300 hover:bg-theme-tertiary hover:text-white"
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
              <label className="block text-sm font-medium text-white mb-2">
                Column Widths
                {viewport === "tablet" && <span className="text-xs text-gray-400 ml-2">(Tablet)</span>}
                {viewport === "mobile" && <span className="text-xs text-gray-400 ml-2">(Mobile)</span>}
              </label>
              {viewport === "mobile" && section.mobileLayout === "stack" ? (
                <p className="text-sm text-gray-400">Columns are stacked at 100% width on mobile</p>
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
                          <span className="text-xs text-gray-400 w-12">Col {idx + 1}</span>
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
                            className="flex-1 px-2 py-1 text-sm bg-theme-tertiary border border-theme rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-red)]"
                          />
                          {viewport === "tablet" && col.tabletWidth && (
                            <button
                              onClick={() => onUpdateColumn(col.id, { tabletWidth: undefined })}
                              className="text-xs text-gray-500 hover:text-red-400 cursor-pointer"
                              title="Reset to desktop width"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    {viewport === "tablet" ? "Tablet overrides desktop widths" : "Desktop widths (base)"}
                  </p>
                </>
              )}
            </div>
          )}

          {/* Column Gap */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">Column Gap</label>
            <input
              type="text"
              value={section.columnGap}
              onChange={(e) => onUpdate({ columnGap: e.target.value })}
              placeholder="e.g., 16, 1rem, 10%"
              className="w-full px-3 py-2 text-sm bg-theme-tertiary border border-theme rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-red)] focus:border-transparent"
            />
            <p className="text-xs text-gray-400 mt-1">Numbers default to px</p>
          </div>

          {/* Row Gap */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">Row Gap</label>
            <input
              type="text"
              value={section.rowGap}
              onChange={(e) => onUpdate({ rowGap: e.target.value })}
              placeholder="e.g., 16, 1rem, 10%"
              className="w-full px-3 py-2 text-sm bg-theme-tertiary border border-theme rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-red)] focus:border-transparent"
            />
            <p className="text-xs text-gray-400 mt-1">Numbers default to px</p>
          </div>

          {/* Mobile Layout */}
          <div className="pt-2 border-t border-theme">
            <label className="flex items-center gap-2 text-sm font-medium text-white mb-2">
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
                <span className="text-sm text-gray-300">Stack (1 column)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name={`mobile-${section.id}`}
                  checked={section.mobileLayout === "keep"}
                  onChange={() => onUpdate({ mobileLayout: "keep", mobileColumns: 2 })}
                  className="accent-[var(--color-brand-red)]"
                />
                <span className="text-sm text-gray-300">Keep columns</span>
              </label>
              {section.mobileLayout === "keep" && (
                <div className="ml-6 flex items-center gap-2">
                  <span className="text-xs text-gray-400">Columns:</span>
                  <div className="flex gap-1">
                    {([1, 2] as const).map((num) => (
                      <button
                        key={num}
                        onClick={() => onUpdate({ mobileColumns: num })}
                        className={cn(
                          "px-2 py-1 text-xs rounded border transition-colors cursor-pointer",
                          section.mobileColumns === num
                            ? "bg-[var(--color-brand-red-muted)] border-[var(--color-brand-red)] text-[var(--color-brand-red)]"
                            : "border-theme text-gray-300 hover:bg-theme-tertiary"
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
                <span className="text-sm text-gray-300">Horizontal slider</span>
              </label>
            </div>
          </div>

          {/* Delete Section */}
          <div className="pt-2 border-t border-theme">
            <button
              onClick={onDelete}
              className="flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer w-full"
            >
              <TrashIcon />
              Delete Section
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Column Component (renders a single column placeholder)
interface ColumnComponentProps {
  column: Column;
  index: number;
  isParentSelected: boolean;
  isMobile: boolean;
  isSlider: boolean;
}

function ColumnComponent({
  column,
  index,
  isParentSelected,
  isMobile,
  isSlider,
}: ColumnComponentProps) {
  return (
    <div
      className={cn(
        "rounded border border-dashed flex flex-col items-center justify-center transition-all min-h-[80px]",
        isSlider && isMobile ? "min-w-[150px] flex-shrink-0" : "",
        isParentSelected ? "border-[var(--color-brand-red)]/50" : "border-theme"
      )}
      style={{
        minWidth: isSlider && isMobile ? "150px" : undefined,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <span className="text-xs text-gray-400">Col {index + 1}</span>
      <span className="text-xs text-gray-500">{column.width}</span>
    </div>
  );
}

// Resize Handle Component
interface ResizeHandleProps {
  onResize: (deltaPercent: number) => void;
  isSelected: boolean;
}

function ResizeHandle({ onResize, isSelected }: ResizeHandleProps) {
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef<number>(0);
  const containerWidthRef = useRef<number>(0);
  const onResizeRef = useRef(onResize);
  onResizeRef.current = onResize;

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    startXRef.current = e.clientX;
    const sectionEl = (e.target as HTMLElement).closest('[data-section-container]');
    containerWidthRef.current = (sectionEl?.clientWidth || 800) - 32;
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startXRef.current;
      const deltaPercent = (deltaX / containerWidthRef.current) * 100;
      if (Math.abs(deltaPercent) > 0.3) {
        onResizeRef.current(deltaPercent);
        startXRef.current = e.clientX;
      }
    };

    const handleMouseUp = () => setIsDragging(false);

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  if (!isSelected) return null;

  return (
    <div
      className="h-full w-full flex items-center justify-center cursor-col-resize z-10 group"
      onMouseDown={handleMouseDown}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className={cn(
          "w-1.5 h-10 rounded-full transition-all",
          isDragging
            ? "bg-[var(--color-brand-red)] h-full"
            : "bg-gray-500/70 group-hover:bg-[var(--color-brand-red)] group-hover:h-16"
        )}
      />
    </div>
  );
}

// Helper to parse width value to percentage (for resize calculations)
function parseWidthToPercent(width: string, totalColumns: number): number {
  const trimmed = width.trim();
  // If it's a calc() expression, extract the percentage part
  if (trimmed.startsWith("calc(")) {
    const match = trimmed.match(/calc\((\d+(?:\.\d+)?)%/);
    if (match) {
      return parseFloat(match[1]) || (100 / totalColumns);
    }
  }
  // If it's a percentage, extract the number
  if (trimmed.endsWith("%")) {
    return parseFloat(trimmed) || (100 / totalColumns);
  }
  // If it's fr units, we'll treat it as proportional
  if (trimmed.endsWith("fr")) {
    // For fr units, we need context of all columns, default to equal
    return 100 / totalColumns;
  }
  // Default to equal distribution
  return 100 / totalColumns;
}

// Normalize column percentages to sum to 100%
function normalizePercents(percents: number[]): number[] {
  const total = percents.reduce((sum, p) => sum + p, 0);
  if (total === 0) return percents.map(() => 100 / percents.length);
  return percents.map((p) => (p / total) * 100);
}

// Section Component
interface SectionComponentProps {
  section: Section;
  isSelected: boolean;
  onClick: () => void;
  viewport: ViewportSize;
  onResizeColumns?: (leftColumnId: string, rightColumnId: string, leftWidth: string, rightWidth: string, viewport: ViewportSize) => void;
}

function SectionComponent({
  section,
  isSelected,
  onClick,
  viewport,
  onResizeColumns,
}: SectionComponentProps) {
  const isMobile = viewport === "mobile";
  const isTablet = viewport === "tablet";
  const columnCount = section.columns.length;
  const containerRef = useRef<HTMLDivElement>(null);

  // Get the width for current viewport (tablet uses tabletWidth if set, otherwise falls back to width)
  const getColumnWidth = (col: Column): string => {
    if (isTablet && col.tabletWidth) return col.tabletWidth;
    return col.width;
  };

  // Parse column percentages for current viewport
  const columnPercents = useMemo(() => {
    const rawPercents = section.columns.map((col) => parseWidthToPercent(getColumnWidth(col), columnCount));
    return normalizePercents(rawPercents);
  }, [section.columns, columnCount, viewport]);

  // Simple resize handler
  const handleResize = (index: number, deltaPercent: number) => {
    if (!onResizeColumns) return;

    const minWidth = 10;
    let newLeft = Math.max(minWidth, columnPercents[index] + deltaPercent);
    let newRight = Math.max(minWidth, columnPercents[index + 1] - deltaPercent);

    // Normalize to ensure they sum correctly
    const total = newLeft + newRight;
    const targetTotal = columnPercents[index] + columnPercents[index + 1];
    newLeft = (newLeft / total) * targetTotal;
    newRight = (newRight / total) * targetTotal;

    onResizeColumns(
      section.columns[index].id,
      section.columns[index + 1].id,
      `${Math.round(newLeft * 10) / 10}%`,
      `${Math.round(newRight * 10) / 10}%`,
      viewport
    );
  };

  const isMobileView = isMobile;
  const isSlider = section.mobileLayout === "slider" && isMobileView;
  const showResizeHandles = isSelected && columnCount > 1 && !isMobileView && !isSlider;
  const gapValue = parseGapValue(section.columnGap);

  // For mobile stacking
  let displayMode: "grid" | "flex" | "stack" = "grid";
  if (isMobileView) {
    if (section.mobileLayout === "stack") {
      displayMode = "stack";
    } else if (isSlider) {
      displayMode = "flex";
    }
  }

  // Helper to get CSS width with gap compensation
  // Formula: width% - (gap * (columns-1) / columns)
  const getColumnCssWidth = (width: string): string => {
    if (columnCount === 1 || displayMode === "stack") return width;
    const gapMultiplier = (columnCount - 1) / columnCount;
    return `calc(${width} - ${gapValue} * ${gapMultiplier.toFixed(4)})`;
  };

  return (
    <div
      ref={containerRef}
      data-section-container
      onClick={onClick}
      className={cn(
        "relative rounded-lg border-2 border-dashed transition-all cursor-pointer p-4",
        isSelected
          ? "border-[var(--color-brand-red)] bg-[var(--color-brand-red-muted)]"
          : "border-theme hover:border-theme-primary hover:bg-theme-tertiary/30"
      )}
      style={{ "--section-gap": gapValue } as React.CSSProperties}
    >
      {/* Column layout using flexbox for better control of gaps and resize handles */}
      <div
        className={cn(
          "relative",
          displayMode === "stack" && "flex flex-col",
          displayMode === "flex" && "flex overflow-x-auto",
          displayMode === "grid" && "flex"
        )}
        style={{
          gap: displayMode === "stack"
            ? parseGapValue(section.rowGap)
            : displayMode === "grid"
              ? gapValue
              : undefined,
        }}
      >
        {section.columns.map((column, i) => {
          // Determine display width based on viewport and mode
          const displayWidth = displayMode === "stack"
            ? "100%"
            : `${columnPercents[i].toFixed(1)}%`;
          const cssWidth = displayMode === "grid"
            ? getColumnCssWidth(getColumnWidth(column))
            : displayMode === "stack"
              ? "100%"
              : undefined;

          return (
            <div
              key={column.id}
              className={cn(
                "relative flex-shrink-0",
                displayMode === "flex" && "min-w-[150px]"
              )}
              style={{
                width: cssWidth,
                flex: displayMode === "flex" ? "0 0 auto" : undefined,
              }}
            >
              <ColumnComponent
                column={{ ...column, width: displayWidth }}
                index={i}
                isParentSelected={isSelected}
                isMobile={isMobileView}
                isSlider={isSlider}
              />
            </div>
          );
        })}

        {/* Render gaps with resize handles between columns */}
        {displayMode === "grid" && columnCount > 1 && section.columns.slice(0, -1).map((_, i) => {
          // Calculate position: sum of widths of columns before this gap
          const leftOffset = columnPercents.slice(0, i + 1).reduce((sum, p) => sum + p, 0);

          return (
            <div
              key={`gap-${i}`}
              className="absolute top-0 bottom-0 flex items-center justify-center"
              style={{
                left: `${leftOffset}%`,
                width: gapValue,
                transform: "translateX(-50%)",
              }}
            >
              {showResizeHandles && (
                <ResizeHandle
                  onResize={(delta) => handleResize(i, delta)}
                  isSelected={isSelected}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Section indicator */}
      <div className="absolute top-2 right-2 text-xs text-theme-muted">
        {columnCount} col{columnCount > 1 ? "s" : ""}
        {isMobileView && section.mobileLayout !== "stack" && (
          <span className="ml-1">
            ({section.mobileLayout === "slider" ? "slider" : `${section.mobileColumns || 1} on mobile`})
          </span>
        )}
      </div>
    </div>
  );
}

// Sortable wrapper for sections
interface SortableSectionProps {
  section: Section;
  isSelected: boolean;
  onClick: () => void;
  viewport: ViewportSize;
  onResizeColumns?: (leftColumnId: string, rightColumnId: string, leftWidth: string, rightWidth: string, viewport: ViewportSize) => void;
}

function SortableSection({
  section,
  isSelected,
  onClick,
  viewport,
  onResizeColumns,
}: SortableSectionProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id });

  const containerRef = useRef<HTMLDivElement>(null);
  const [hasSpaceLeft, setHasSpaceLeft] = useState(false);

  // Check if there's enough space to the left for the drag handle
  useEffect(() => {
    const checkSpace = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const parentRect = containerRef.current.offsetParent?.getBoundingClientRect();
        const leftSpace = parentRect ? rect.left - parentRect.left : rect.left;
        setHasSpaceLeft(leftSpace >= 36); // ~36px for handle width + margin
      }
    };
    checkSpace();
    window.addEventListener("resize", checkSpace);
    return () => window.removeEventListener("resize", checkSpace);
  }, []);

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    position: "relative",
  };

  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }}
      style={style}
      className={cn(
        "group relative",
        isDragging && "opacity-90 scale-[1.01]"
      )}
    >
      {/* Floating Drag Handle - appears on hover */}
      <button
        className={cn(
          "absolute z-10 p-1.5 rounded-lg bg-theme-secondary border border-theme shadow-lg transition-all cursor-grab active:cursor-grabbing",
          "opacity-0 group-hover:opacity-100 text-gray-400 hover:text-white hover:bg-theme-tertiary",
          isDragging && "opacity-100 cursor-grabbing text-white bg-theme-tertiary",
          hasSpaceLeft ? "top-0 left-0 -translate-x-full -ml-1" : "top-0 left-0 m-1"
        )}
        title="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <DragHandleIcon />
      </button>

      <SectionComponent
        section={section}
        isSelected={isSelected}
        onClick={onClick}
        viewport={viewport}
        onResizeColumns={onResizeColumns}
      />
    </div>
  );
}

export default function PageBuilderPage() {
  const { lobby } = useLoaderData<typeof loader>();
  const [viewport, setViewport] = useState<ViewportSize>("desktop");
  const [activeTab, setActiveTab] = useState<EditorTab>("layout");
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  // Track client-side mounting to avoid DndContext hydration mismatch
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Create a default section when first landing on the layout (if no sections exist)
  useEffect(() => {
    if (isMounted && sections.length === 0) {
      const defaultSection = createSection(1);
      setSections([defaultSection]);
      setSelectedSectionId(defaultSection.id);
    }
  }, [isMounted]); // Only run after mount, intentionally excluding sections

  const viewportWidth = VIEWPORT_WIDTHS[viewport];

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px movement required to start drag
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle drag end for reordering sections
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setSections((prev) => {
        const oldIndex = prev.findIndex((s) => s.id === active.id);
        const newIndex = prev.findIndex((s) => s.id === over.id);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  }, []);

  // Section IDs for sortable context
  const sectionIds = sections.map((s) => s.id);

  // Find selected section
  const selectedSection = sections.find((s) => s.id === selectedSectionId) || null;

  // Add a section
  const addSection = useCallback(() => {
    const newSection = createSection(1);
    setSections((prev) => [...prev, newSection]);
    setSelectedSectionId(newSection.id);
  }, []);

  // Update a section
  const updateSection = useCallback((id: string, updates: Partial<Section>) => {
    setSections((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...updates } : s))
    );
  }, []);

  // Update a column within a section
  const updateColumn = useCallback((sectionId: string, columnId: string, updates: Partial<Column>) => {
    setSections((prev) =>
      prev.map((s) => {
        if (s.id === sectionId) {
          const updatedColumns = s.columns.map((col) =>
            col.id === columnId ? { ...col, ...updates } : col
          );
          return { ...s, columns: updatedColumns };
        }
        return s;
      })
    );
  }, []);

  // Resize two adjacent columns (called during drag)
  const resizeColumns = useCallback((
    sectionId: string,
    leftColumnId: string,
    rightColumnId: string,
    leftWidth: string,
    rightWidth: string,
    currentViewport: ViewportSize
  ) => {
    setSections((prev) =>
      prev.map((s) => {
        if (s.id === sectionId) {
          const updatedColumns = s.columns.map((col) => {
            if (col.id === leftColumnId) {
              // On tablet, update tabletWidth; on desktop, update width
              if (currentViewport === "tablet") {
                return { ...col, tabletWidth: leftWidth };
              }
              return { ...col, width: leftWidth };
            }
            if (col.id === rightColumnId) {
              if (currentViewport === "tablet") {
                return { ...col, tabletWidth: rightWidth };
              }
              return { ...col, width: rightWidth };
            }
            return col;
          });
          return { ...s, columns: updatedColumns };
        }
        return s;
      })
    );
  }, []);

  // Delete a section
  const deleteSection = useCallback((id: string) => {
    setSections((prev) => prev.filter((s) => s.id !== id));
    setSelectedSectionId(null);
  }, []);

  return (
    <div className="fixed inset-0 bg-theme-primary flex flex-col z-50">
      {/* Toolbar */}
      <div className="flex-shrink-0 h-14 bg-theme-secondary border-b border-theme flex items-center justify-between px-4">
        {/* Left: Close button and title */}
        <div className="flex items-center gap-4">
          <Link
            to={`/lobby/${lobby.id}`}
            className="p-2 rounded-lg hover:bg-theme-tertiary text-theme-secondary hover:text-theme-primary transition-colors cursor-pointer"
            title="Close Page Builder"
          >
            <CloseIcon />
          </Link>
          <div className="h-6 w-px bg-theme-tertiary" />
          <span className="text-sm text-theme-secondary">
            Page Builder: <span className="text-theme-primary font-medium">{lobby.title || lobby.name}</span>
          </span>
        </div>

        {/* Center: Editor tabs */}
        <div className="flex items-center gap-1 bg-theme-tertiary rounded-lg p-1">
          <button
            onClick={() => setActiveTab("layout")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
              activeTab === "layout"
                ? "bg-[var(--color-brand-red-muted)] text-[var(--color-brand-red)]"
                : "text-theme-secondary hover:text-theme-primary hover:bg-theme-secondary"
            )}
          >
            <LayoutIcon />
            Layout
          </button>
          <button
            onClick={() => setActiveTab("design")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
              activeTab === "design"
                ? "bg-[var(--color-brand-red-muted)] text-[var(--color-brand-red)]"
                : "text-theme-secondary hover:text-theme-primary hover:bg-theme-secondary"
            )}
          >
            <DesignIcon />
            Design
          </button>
        </div>

        {/* Right: Viewport switcher */}
        <div className="flex items-center gap-1 bg-theme-tertiary rounded-lg p-1">
          <button
            onClick={() => setViewport("desktop")}
            className={cn(
              "p-2 rounded-md transition-colors cursor-pointer",
              viewport === "desktop"
                ? "bg-[var(--color-brand-red-muted)] text-[var(--color-brand-red)]"
                : "text-theme-secondary hover:text-theme-primary hover:bg-theme-secondary"
            )}
            title="Desktop (1440px)"
          >
            <DesktopIcon />
          </button>
          <button
            onClick={() => setViewport("tablet")}
            className={cn(
              "p-2 rounded-md transition-colors cursor-pointer",
              viewport === "tablet"
                ? "bg-[var(--color-brand-red-muted)] text-[var(--color-brand-red)]"
                : "text-theme-secondary hover:text-theme-primary hover:bg-theme-secondary"
            )}
            title="Tablet (768px)"
          >
            <TabletIcon />
          </button>
          <button
            onClick={() => setViewport("mobile")}
            className={cn(
              "p-2 rounded-md transition-colors cursor-pointer",
              viewport === "mobile"
                ? "bg-[var(--color-brand-red-muted)] text-[var(--color-brand-red)]"
                : "text-theme-secondary hover:text-theme-primary hover:bg-theme-secondary"
            )}
            title="Mobile (375px)"
          >
            <MobileIcon />
          </button>
        </div>
      </div>

      {/* Canvas Area */}
      <div className="flex-1 overflow-auto bg-[#1a1a2e] p-8">
        <div
          className="mx-auto bg-theme-primary min-h-full rounded-lg border border-theme transition-all duration-300"
          style={{ width: viewportWidth, maxWidth: "100%" }}
        >
          <div className="p-4 space-y-4 min-h-[600px]">
            {activeTab === "layout" ? (
              <>
                {/* Render Sections with DnD */}
                {isMounted ? (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                    modifiers={[restrictToVerticalAxis]}
                  >
                    <SortableContext items={sectionIds} strategy={verticalListSortingStrategy}>
                      {sections.map((section) => (
                        <SortableSection
                          key={section.id}
                          section={section}
                          isSelected={selectedSectionId === section.id}
                          onClick={() => setSelectedSectionId(section.id)}
                          viewport={viewport}
                          onResizeColumns={(leftId, rightId, leftW, rightW, vp) =>
                            resizeColumns(section.id, leftId, rightId, leftW, rightW, vp)
                          }
                        />
                      ))}
                    </SortableContext>
                  </DndContext>
                ) : (
                  // Static list during SSR to avoid hydration mismatch with DndContext
                  sections.map((section) => (
                    <SectionComponent
                      key={section.id}
                      section={section}
                      isSelected={selectedSectionId === section.id}
                      onClick={() => setSelectedSectionId(section.id)}
                      viewport={viewport}
                      onResizeColumns={(leftId, rightId, leftW, rightW, vp) =>
                        resizeColumns(section.id, leftId, rightId, leftW, rightW, vp)
                      }
                    />
                  ))
                )}

                {/* Add Section Button */}
                <button
                  onClick={addSection}
                  className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-theme-tertiary/50 hover:bg-theme-tertiary border border-dashed border-theme rounded-lg text-theme-secondary hover:text-theme-primary transition-colors cursor-pointer"
                >
                  <PlusIcon className="w-5 h-5" />
                  <span>Add Section</span>
                </button>
              </>
            ) : (
              <div className="flex items-center justify-center min-h-[400px] text-center text-theme-secondary">
                {sections.length === 0 ? (
                  <p>Switch to Layout tab to add sections first</p>
                ) : (
                  <p>Design mode - Component placement coming in Step 6</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Floating Settings Panel */}
      {selectedSection && activeTab === "layout" && (
        <SectionSettingsPanel
          section={selectedSection}
          onUpdate={(updates) => updateSection(selectedSection.id, updates)}
          onUpdateColumn={(columnId, updates) => updateColumn(selectedSection.id, columnId, updates)}
          onDelete={() => deleteSection(selectedSection.id)}
          onClose={() => setSelectedSectionId(null)}
          viewport={viewport}
        />
      )}
    </div>
  );
}
