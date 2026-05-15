// =============================================================================
// BlockColorOverrides
// -----------------------------------------------------------------------------
// Per-block "Colors" panel rendered inside the Card/Player block settings
// overlay. Surfaces the subset of theme tokens that affect this block type.
// Every input is always editable — there is no enable-checkbox per row. When
// the user changes a value so it differs from the live theme, the row gets a
// "modified" dot and an inline refresh button (tooltip: "Reset to theme
// value") that removes the override for that key.
//
// The set of editable keys is provided by the caller — see CardBlockSettings
// and PlayerBlockSettings for the curated lists.
// =============================================================================

import { useState } from "react";
import { usePageBuilder } from "../../state/provider";
import { useSwatches } from "../../PageBuilderRoot";
import type { ThemeSettings } from "../../state/types";
import { RefreshIcon } from "../../icons";
import { ColorPicker } from "~/components/color-picker";
import {
  formatHexWithAlpha,
  parseHexWithAlpha,
  unlinkValue,
} from "~/components/color-picker/utils";
import type { ColorValue } from "~/components/color-picker/types";

// Field descriptors. Keep this map narrow to the keys we actually let users
// override on a per-block basis.
type FieldKind =
  | { kind: "color" }
  | { kind: "text" }
  | { kind: "number"; min?: number; max?: number; step?: number; suffix?: string; slider?: boolean }
  | { kind: "toggle" }
  | { kind: "select"; options: { value: string; label: string }[] };

interface FieldDescriptor {
  key: keyof ThemeSettings;
  label: string;
  kind: FieldKind;
}

interface BlockColorOverridesProps {
  blockId: string;
  fields: FieldDescriptor[];
}

export function BlockColorOverrides({
  blockId,
  fields,
}: BlockColorOverridesProps) {
  const [open, setOpen] = useState(true);
  const { state, dispatch } = usePageBuilder();
  const { theme } = state;
  // Pull the account-wide swatch library so the ColorPicker's Saved tab is
  // populated here too (was previously a native browser color input with no
  // saved-swatches access).
  const {
    swatches,
    saveSwatch,
    updateSwatch,
    deleteSwatch: removeSwatch,
  } = useSwatches();

  // Find the block (cheap walk — block settings are O(blocks) anyway).
  const block = (() => {
    for (const section of state.sections) {
      for (const column of section.columns) {
        const b = column.blocks.find((bb) => bb.id === blockId);
        if (b) return b;
      }
    }
    return null;
  })();
  if (!block) return null;

  const overrides = block.themeOverrides ?? {};

  // Remove the override for a single key by rebuilding the overrides map
  // without it (the existing reducer action merges; it has no "delete" path,
  // so we clear and re-apply the survivors).
  const resetField = (key: keyof ThemeSettings) => {
    const next: Partial<ThemeSettings> = { ...overrides };
    delete next[key];
    dispatch({ type: "clearBlockThemeOverrides", blockId });
    if (Object.keys(next).length > 0) {
      dispatch({
        type: "updateBlockThemeOverrides",
        blockId,
        overrides: next,
      });
    }
  };

  const setOverride = <K extends keyof ThemeSettings>(
    key: K,
    value: ThemeSettings[K]
  ) => {
    dispatch({
      type: "updateBlockThemeOverrides",
      blockId,
      overrides: { [key]: value } as Partial<ThemeSettings>,
    });
  };

  const renderField = (f: FieldDescriptor) => {
    const hasOverride = Object.prototype.hasOwnProperty.call(overrides, f.key);
    const themeValue = theme[f.key];
    const value = hasOverride
      ? (overrides as ThemeSettings)[f.key]
      : themeValue;
    // "Modified" means the effective value differs from the theme — the
    // common case where the user has explicitly tweaked this field. An
    // override that happens to equal the theme value is treated as not
    // modified so the indicator stays meaningful.
    const isModified = hasOverride && value !== themeValue;

    return (
      <div key={String(f.key)} className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs text-theme-secondary flex items-center gap-1.5">
            <span>{f.label}</span>
            {isModified && (
              <span
                className="w-1.5 h-1.5 rounded-full bg-[var(--color-brand-red)] flex-shrink-0"
                aria-label="Modified from theme"
                title="Modified from theme"
              />
            )}
          </label>
          {isModified && (
            <button
              type="button"
              onClick={() => resetField(f.key)}
              className="p-1 rounded text-theme-muted hover:text-theme-primary hover:bg-theme-tertiary cursor-pointer transition-colors"
              title="Reset to theme value"
              aria-label="Reset to theme value"
            >
              <RefreshIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {(() => {
          switch (f.kind.kind) {
            case "color": {
              // Adapter: the theme field stores a plain hex string, but the
              // ColorPicker emits a `ColorValue` discriminated union. Wrap
              // the hex as a solid on the way in; on the way out, resolve any
              // gradient/swatch-ref down to a hex with alpha (best effort).
              // Opacity round-trips through 8-char hex (`#RRGGBBAA`) — CSS
              // parses it natively, and opacity 100 collapses back to the
              // legacy 6-char form so unchanged values stay unchanged.
              const hex = String(value ?? "#000000");
              const parsed = parseHexWithAlpha(hex) ?? { color: hex, opacity: 100 };
              const pickerValue: ColorValue = {
                type: "solid",
                color: parsed.color,
                opacity: parsed.opacity,
              };
              const onPickerChange = (next: ColorValue) => {
                let resolved: ColorValue = next;
                if (next.type === "swatch-ref") {
                  resolved = unlinkValue(next, swatches);
                }
                let nextColor = parsed.color;
                let nextOpacity = parsed.opacity;
                if (resolved.type === "solid") {
                  nextColor = resolved.color;
                  nextOpacity = resolved.opacity;
                } else if (resolved.type === "gradient") {
                  nextColor =
                    resolved.fallback ??
                    resolved.gradient.stops[0]?.color ??
                    parsed.color;
                  nextOpacity = 100;
                }
                setOverride(
                  f.key,
                  formatHexWithAlpha(nextColor, nextOpacity) as
                    ThemeSettings[typeof f.key]
                );
              };
              return (
                <ColorPicker
                  value={pickerValue}
                  onChange={onPickerChange}
                  allowedTypes={["solid"]}
                  swatches={swatches}
                  onSaveSwatch={saveSwatch}
                  onUpdateSwatch={updateSwatch}
                  onDeleteSwatch={removeSwatch}
                />
              );
            }
            case "text":
              return (
                <input
                  type="text"
                  value={String(value ?? "")}
                  onChange={(e) =>
                    setOverride(
                      f.key,
                      e.target.value as ThemeSettings[typeof f.key]
                    )
                  }
                  className="w-full px-2 py-1 text-xs bg-theme-tertiary border border-theme rounded text-theme-primary"
                />
              );
            case "number": {
              const cfg = f.kind;
              return (
                <div>
                  {cfg.suffix && (
                    <span className="text-[10px] text-theme-muted ml-1">
                      {String(value ?? 0)}
                      {cfg.suffix}
                    </span>
                  )}
                  <input
                    type={cfg.slider ? "range" : "number"}
                    value={Number(value ?? 0)}
                    min={cfg.min}
                    max={cfg.max}
                    step={cfg.step ?? 1}
                    onChange={(e) =>
                      setOverride(
                        f.key,
                        Number(e.target.value) as ThemeSettings[typeof f.key]
                      )
                    }
                    className={
                      cfg.slider
                        ? "w-full"
                        : "w-full px-2 py-1 text-xs bg-theme-tertiary border border-theme rounded text-theme-primary"
                    }
                  />
                </div>
              );
            }
            case "toggle":
              return (
                <input
                  type="checkbox"
                  checked={Boolean(value)}
                  onChange={(e) =>
                    setOverride(
                      f.key,
                      e.target.checked as ThemeSettings[typeof f.key]
                    )
                  }
                  className="accent-[var(--color-brand-red)] cursor-pointer"
                />
              );
            case "select":
              return (
                <select
                  value={String(value ?? "")}
                  onChange={(e) =>
                    setOverride(
                      f.key,
                      e.target.value as ThemeSettings[typeof f.key]
                    )
                  }
                  className="w-full px-2 py-1 text-xs bg-theme-tertiary border border-theme rounded text-theme-primary cursor-pointer"
                >
                  {f.kind.options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              );
          }
        })()}
      </div>
    );
  };

  // Count fields whose effective value diverges from the theme. Plain
  // existence in the overrides map isn't enough — a stored override that
  // happens to match the theme value shouldn't count as "modified" here.
  const modifiedCount = fields.reduce((n, f) => {
    if (!Object.prototype.hasOwnProperty.call(overrides, f.key)) return n;
    return (overrides as ThemeSettings)[f.key] !== theme[f.key] ? n + 1 : n;
  }, 0);

  return (
    <div className="pt-3 border-t border-theme">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-theme-muted hover:text-theme-primary cursor-pointer mb-2"
      >
        <span>
          Colors {modifiedCount > 0 ? `(${modifiedCount} modified)` : ""}
        </span>
        <svg
          className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19.5 8.25l-7.5 7.5-7.5-7.5"
          />
        </svg>
      </button>
      {open && (
        <div className="space-y-3">
          {modifiedCount > 0 && (
            <button
              type="button"
              onClick={() =>
                dispatch({ type: "clearBlockThemeOverrides", blockId })
              }
              className="w-full px-2 py-1 text-xs text-red-400 hover:text-red-300 border border-red-500/30 hover:border-red-500/50 rounded cursor-pointer"
              title="Reset every field on this block to the theme defaults"
            >
              Reset all to theme
            </button>
          )}
          {fields.map(renderField)}
        </div>
      )}
    </div>
  );
}

export type { FieldDescriptor };
