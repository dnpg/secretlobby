import { useEffect, useState } from "react";
import { cn, useColorMode } from "@secretlobby/ui";
import {
  type TextColorValue,
  type ThemeBackgroundColor,
  type ThemeSettings,
} from "~/lib/theme";
import { usePageBuilder } from "../state/provider";
import { ChevronLeftIcon, RefreshIcon } from "../icons";
import {
  ColorPicker,
  type ColorValue,
  type SavedSwatch,
} from "~/components/color-picker";
import {
  colorValueToCSS,
  gradientFallbackHex,
} from "~/components/color-picker/utils";
import { BackgroundPicker } from "~/components/background-picker";
import { BorderRadiusInput } from "~/components/border-radius-input";
import { CssLengthInput } from "~/components/css-length-input";
import { useSwatches } from "../PageBuilderRoot";
import {
  ColorRow,
  HexPickerRow,
  NumberRow,
  SelectRow,
  TextColorRow,
} from "./ThemeFieldRows";
import { CardThemeFields } from "./CardThemeFields";
import { PlayerThemeFields } from "./PlayerThemeFields";
import type { BorderStyle } from "~/lib/theme";

// Full CSS `border-style` keyword list. We expose every value the spec
// defines so designers can reach the full range of native browser borders;
// `none` sits last so it isn't the first thing in the dropdown. `hidden`
// is included for spec parity even though it visually matches `none`.
const IMAGE_BORDER_STYLES: BorderStyle[] = [
  "solid",
  "dashed",
  "dotted",
  "double",
  "groove",
  "ridge",
  "inset",
  "outset",
  "hidden",
  "none",
];


// =============================================================================
// ThemeOverlay
// -----------------------------------------------------------------------------
// Slides in over the LeftRail when the user clicks the paint brush icon in the
// top header. Mirrors SettingsOverlay's overlay shell: absolutely positioned,
// slide-in transition, header with a back button. Body contains the full set
// of theme controls (ported from the old right-panel ThemeTab).
//
// State flow:
//   - Every edit dispatches `updateTheme` → themeDirty=true → the dedicated
//     theme fetcher in PageBuilderInner debounces and POSTs `update_theme`.
//   - "Reset" dispatches `resetTheme` with the seed for the current colorMode.
//   - The Canvas re-renders its CSS variables on every theme change for live
//     preview.
// =============================================================================

interface ThemeOverlayProps {
  onClose: () => void;
}

interface SectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function CollapsibleSection({
  title,
  defaultOpen = true,
  children,
}: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-theme">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-theme-muted hover:bg-theme-tertiary/40 cursor-pointer"
      >
        <span>{title}</span>
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
      {/* 20px top/bottom padding inside every accordion body — accordions
          are the only chrome boundary in the panel, so giving them a
          generous vertical breath keeps the section feeling separate
          from its neighbours. Horizontal padding stays at 12px to align
          with the section header above. */}
      {open && <div className="py-5 px-3 space-y-3">{children}</div>}
    </div>
  );
}

export function ThemeOverlay({ onClose }: ThemeOverlayProps) {
  const { state, dispatch } = usePageBuilder();
  const { theme, themeSaveStatus } = state;
  const { swatches, saveSwatch, updateSwatch, deleteSwatch } = useSwatches();
  const { resolvedMode } = useColorMode();
  // Force every theme-aware text utility inside this overlay to render in
  // pure black under light mode (matches the SettingsOverlay rule). Specific
  // color classes — e.g. the destructive red on the reset button — are
  // unaffected because they don't read these variables.
  const lightModeBlackTextStyle: React.CSSProperties | undefined =
    resolvedMode === "light"
      ? ({
          "--color-text-primary": "#000",
          "--color-text-secondary": "#000",
          "--color-text-muted": "#000",
        } as React.CSSProperties)
      : undefined;

  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Esc closes the overlay.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const set = <K extends keyof ThemeSettings>(
    key: K,
    value: ThemeSettings[K]
  ) => {
    dispatch({
      type: "updateTheme",
      partial: { [key]: value } as Partial<ThemeSettings>,
    });
  };

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
      aria-label="Theme settings"
    >
      {/* Header */}
      <div className="flex-shrink-0 p-3 border-b border-theme">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-theme-tertiary text-theme-secondary hover:text-theme-primary transition-colors cursor-pointer"
            title="Close theme settings"
            aria-label="Close theme settings"
          >
            <ChevronLeftIcon />
          </button>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-theme-primary truncate">
              Theme
            </div>
          </div>
          <span className="text-xs text-theme-muted">
            {themeSaveStatus === "saving"
              ? "Saving…"
              : themeSaveStatus === "error"
                ? "Save failed"
                : themeSaveStatus === "saved"
                  ? "Saved"
                  : ""}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">

        <CollapsibleSection title="Swatches" defaultOpen>
          <SwatchesGrid
            swatches={swatches}
            onSave={saveSwatch}
            onUpdate={updateSwatch}
            onDelete={deleteSwatch}
          />
        </CollapsibleSection>
        {/* Note: the `swatches` / `saveSwatch` / `updateSwatch` / `deleteSwatch`
            destructured at the top of this component come from useSwatches(),
            which also exposes `drafts` / `setDraft` / `clearDraft`. The
            <SwatchesGrid>'s inline editor pulls those via its own
            useSwatches() call so it can write the in-progress value into the
            drafts map on every change, and clear on cancel / submit. See
            <SwatchEditor> below for the wiring. */}

        <CollapsibleSection title="Background">
          <div>
            <label className="block text-xs text-theme-secondary mb-1">
              Background
            </label>
            <BackgroundPicker
              label="Background"
              value={theme.background}
              onChange={(next) => set("background", next)}
              swatches={swatches}
              onSaveSwatch={saveSwatch}
              onUpdateSwatch={updateSwatch}
              onDeleteSwatch={deleteSwatch}
            />
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Text" defaultOpen={false}>
          <TextColorRow
            label="Text color"
            legacyValue={theme.textPrimary}
            richValue={theme.textPrimaryColor}
            onChange={({ legacy, rich }) => {
              // Persist both fields in a single dispatch so the theme store
              // sees one consistent change.
              dispatch({
                type: "updateTheme",
                partial: {
                  textPrimary: legacy,
                  textPrimaryColor: rich,
                } as Partial<ThemeSettings>,
              });
            }}
          />
          <div>
            <label className="block text-xs text-theme-secondary mb-1">
              Font size
            </label>
            <CssLengthInput
              value={theme.textBaseSize ?? "16px"}
              onChange={(v) => set("textBaseSize", v)}
              min={8}
              max={64}
              ariaLabel="Global base font size"
              placeholder="16"
            />
          </div>
          <ColorRow
            label="Link color"
            value={
              theme.linkColor ??
              (theme.colorMode === "light" ? "#2563eb" : "#60a5fa")
            }
            onChange={(v) => set("linkColor", v)}
          />
        </CollapsibleSection>

        <CollapsibleSection title="Card" defaultOpen={false}>
          {/* Card section delegates entirely to the shared CardThemeFields
              component. Same JSX as the per-block override editor — the only
              difference is that here we dispatch every change to the global
              theme (updateTheme), and we hide the per-field Modified/reset UI
              by leaving showResetButtons off. */}
          <CardThemeFields
            value={theme}
            baseTheme={theme}
            onChange={(partial) =>
              dispatch({ type: "updateTheme", partial })
            }
            showResetButtons={false}
          />
        </CollapsibleSection>

        <CollapsibleSection title="Image" defaultOpen={false}>
          {/* Global Image defaults — separate from Card so a designer can
              keep cards borderless yet add a 1px outline to every image (or
              vice versa). ImageBlock falls back to these fields when its
              block-level overrides are unset. Order matches ImageBlockSettings:
              border-radius, then border style/width/color. Style is first in
              the border group because `none` collapses width + color out of
              the panel (same canvas-truth rule we apply per-block). */}
          <div>
            <label className="block text-xs text-theme-secondary mb-1">
              Border radius
            </label>
            <BorderRadiusInput
              value={theme.imageBorderRadius ?? 12}
              onChange={(v) => set("imageBorderRadius", v)}
              min={0}
              max={9999}
            />
          </div>
          <SelectRow
            label="Border style"
            value={theme.imageBorderStyle ?? "solid"}
            options={IMAGE_BORDER_STYLES.map((s) => ({
              value: s,
              label: s,
            }))}
            onChange={(v) => set("imageBorderStyle", v as BorderStyle)}
          />
          {(theme.imageBorderStyle ?? "solid") !== "none" && (
            <>
              <div>
                <label className="block text-xs text-theme-secondary mb-1">
                  Border width
                </label>
                <CssLengthInput
                  value={theme.imageBorderWidth ?? "0"}
                  onChange={(v) => set("imageBorderWidth", v)}
                  min={0}
                  max={64}
                  ariaLabel="Global image border width"
                  placeholder="0"
                />
              </div>
              <HexPickerRow
                label="Border color"
                value={
                  theme.imageBorderColor ??
                  theme.border ??
                  "#000000"
                }
                onChange={(v) => set("imageBorderColor", v)}
              />
            </>
          )}
        </CollapsibleSection>

        <CollapsibleSection title="Player" defaultOpen={false}>
          {/* Global Player defaults — separate from Card so a designer can
              keep cards borderless yet outline the player (or vice versa).
              The actual JSX lives in <PlayerThemeFields/>, which is also
              used by the per-block Player Theme accordion in
              PlayerBlockSettings — single source of truth for the player
              editor. Adding / removing a setting requires touching one
              file. */}
          <PlayerThemeFields
            value={theme}
            onChange={(partial) =>
              dispatch({ type: "updateTheme", partial })
            }
            swatches={swatches}
            saveSwatch={saveSwatch}
            updateSwatch={updateSwatch}
            deleteSwatch={deleteSwatch}
          />
        </CollapsibleSection>

        <CollapsibleSection title="Buttons" defaultOpen={false}>
          <ButtonStylesGroup
            theme={theme}
            swatches={swatches}
            saveSwatch={saveSwatch}
            updateSwatch={updateSwatch}
            deleteSwatch={deleteSwatch}
            set={set}
          />
        </CollapsibleSection>
      </div>
    </div>
  );
}

// =============================================================================
// SwatchesGrid — pulls from useSwatches() (the per-account swatch library that
// the ColorPicker's Saved tab also reads). Lets the user add / rename / delete
// swatches without going through a block.
//
// Adding a new swatch: the "+" button reveals a tiny inline picker (uses the
// shared <ColorPicker> popover for color/gradient selection). When the user
// picks a value AND types a name + clicks Save, we hand off to onSave. Editing
// a swatch reopens the same flow seeded with the existing values.
// =============================================================================

interface SwatchesGridProps {
  swatches: SavedSwatch[];
  onSave: (name: string, value: ColorValue) => void;
  onUpdate: (id: string, name: string, value: ColorValue) => void;
  onDelete: (id: string) => void;
}

function SwatchesGrid({
  swatches,
  onSave,
  onUpdate,
  onDelete,
}: SwatchesGridProps) {
  // Pull the draft API from the swatch context — the inline editor writes the
  // in-progress value into `drafts` on every change (edit mode only) so every
  // canvas consumer of this swatch-ref previews the unsaved color live.
  // `setDraft` is a no-op outside a SwatchProvider, so this is safe in test
  // environments that mount SwatchesGrid without the page-builder shell.
  const { setDraft, clearDraft } = useSwatches();
  // Inline editor state — only one editor open at a time. `mode` carries the
  // existing swatch when editing so we can pre-fill its name + value.
  const [editor, setEditor] = useState<
    | null
    | { kind: "create" }
    | { kind: "edit"; id: string; initialName: string; initialValue: ColorValue }
  >(null);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-theme-muted">
          {swatches.length === 0 ? "No swatches yet" : `${swatches.length} swatch${swatches.length === 1 ? "" : "es"}`}
        </span>
        <button
          type="button"
          onClick={() => setEditor((e) => (e?.kind === "create" ? null : { kind: "create" }))}
          className={cn(
            "p-1 rounded hover:bg-theme-tertiary text-theme-secondary hover:text-theme-primary cursor-pointer",
            editor?.kind === "create" && "bg-theme-tertiary text-theme-primary"
          )}
          title="Add a new swatch"
          aria-label="Add a new swatch"
          aria-pressed={editor?.kind === "create"}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {editor && (
        <SwatchEditor
          mode={editor.kind}
          // In edit mode pass the swatch id through so the editor can mirror
          // every in-progress value into `drafts.set(id, value)` and clear on
          // cancel/submit. Create mode passes null — no id exists yet.
          editingId={editor.kind === "edit" ? editor.id : null}
          initialName={editor.kind === "edit" ? editor.initialName : ""}
          initialValue={
            editor.kind === "edit"
              ? editor.initialValue
              : { type: "solid", color: "#d9d9d9", opacity: 100 }
          }
          setDraft={setDraft}
          clearDraft={clearDraft}
          onCancel={() => {
            if (editor.kind === "edit") clearDraft(editor.id);
            setEditor(null);
          }}
          onSubmit={(name, value) => {
            if (editor.kind === "create") {
              onSave(name, value);
            } else {
              // The SwatchProvider clears the draft on successful update —
              // calling clearDraft here is belt-and-suspenders for the case
              // where the submit handler bails before the provider runs.
              clearDraft(editor.id);
              onUpdate(editor.id, name, value);
            }
            setEditor(null);
          }}
        />
      )}

      {swatches.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {swatches.map((s) => (
            <div key={s.id} className="relative group">
              <div
                className="flex items-center gap-2 w-full p-1 rounded border border-theme bg-theme-tertiary/30"
                title={s.name}
              >
                <span
                  className="block h-7 w-7 flex-shrink-0 rounded border border-theme"
                  style={{ background: colorValueToCSS(s.value) }}
                />
                <span className="flex-1 min-w-0 truncate text-xs text-theme-primary">
                  {s.name}
                </span>
              </div>
              <div className="absolute -top-1 -right-1 hidden group-hover:flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() =>
                    setEditor({
                      kind: "edit",
                      id: s.id,
                      initialName: s.name,
                      initialValue: s.value,
                    })
                  }
                  className="flex h-4 w-4 items-center justify-center rounded-full bg-theme-secondary border border-theme text-theme-muted hover:text-blue-400 cursor-pointer"
                  aria-label={`Edit swatch ${s.name}`}
                  title="Edit swatch"
                >
                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(s.id)}
                  className="flex h-4 w-4 items-center justify-center rounded-full bg-theme-secondary border border-theme text-theme-muted hover:text-red-400 cursor-pointer"
                  aria-label={`Delete swatch ${s.name}`}
                  title="Delete swatch"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Small inline name+color editor used by SwatchesGrid for both create and edit
// modes. Reuses the shared <ColorPicker> popover for color/gradient selection
// so the editing flow matches what the user already sees on block pickers.
//
// In edit mode, every change to the in-progress value is mirrored into the
// session-local drafts map via `setDraft(editingId, value)` so every consumer
// of the swatch-ref previews the unsaved color live on the canvas. On unmount
// or cancel we clear the draft so consumers snap back to the saved value.
interface SwatchEditorProps {
  mode: "create" | "edit";
  /** Edit mode only — the id of the swatch being edited. null in create mode
   *  (no id exists yet, so drafts don't apply). */
  editingId: string | null;
  initialName: string;
  initialValue: ColorValue;
  setDraft: (id: string, value: ColorValue) => void;
  clearDraft: (id: string) => void;
  onCancel: () => void;
  onSubmit: (name: string, value: ColorValue) => void;
}

function SwatchEditor({
  mode,
  editingId,
  initialName,
  initialValue,
  setDraft,
  clearDraft,
  onCancel,
  onSubmit,
}: SwatchEditorProps) {
  const [name, setName] = useState(initialName);
  const [value, setValue] = useState<ColorValue>(initialValue);
  // Mirror the in-progress value into drafts on every change (edit mode only).
  // On unmount the cleanup clears the draft so consumers snap back to the
  // saved value when the user closes the editor without saving (e.g. opens
  // the section's "+" toggle which unmounts this editor).
  useEffect(() => {
    if (mode !== "edit" || !editingId) return;
    setDraft(editingId, value);
  }, [mode, editingId, value, setDraft]);
  useEffect(() => {
    if (mode !== "edit" || !editingId) return;
    return () => clearDraft(editingId);
  }, [mode, editingId, clearDraft]);

  const trimmed = name.trim();
  const canSave = trimmed.length > 0;
  return (
    <div className="rounded border border-theme bg-theme-tertiary/30 p-2 space-y-2">
      <label className="block text-[10px] text-theme-muted">
        {mode === "edit" ? "Edit swatch" : "New swatch"}
      </label>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && canSave) onSubmit(trimmed, value);
          if (e.key === "Escape") onCancel();
        }}
        autoFocus
        maxLength={60}
        placeholder="Name (e.g. Brand red)"
        className="w-full px-2 py-1 text-xs rounded border border-theme bg-theme-tertiary text-theme-primary"
        aria-label="Swatch name"
      />
      <ColorPicker
        label="Swatch color"
        value={value}
        onChange={setValue}
        allowedTypes={["solid", "gradient"]}
      />
      <div className="flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={onCancel}
          className="px-2 py-1 text-xs rounded border border-theme text-theme-secondary hover:bg-theme-tertiary cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => canSave && onSubmit(trimmed, value)}
          disabled={!canSave}
          className="px-2 py-1 text-xs rounded bg-[var(--color-brand-red)] text-white hover:bg-[var(--color-brand-red)]/90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {mode === "edit" ? "Update" : "Save"}
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// ButtonStylesGroup — base button styling (bg, text, border) plus a
// collapsible Advanced (states) subgroup for hover/pressed/active overrides.
//
// When a state override is `undefined`, the lobby CSS layer derives a sensible
// default (invert bg ↔ text on hover, ~10% darken on pressed/active). The UI
// reflects that with a hint string and a Reset button next to each override.
// =============================================================================

interface ButtonStylesGroupProps {
  theme: ThemeSettings;
  swatches: SavedSwatch[];
  saveSwatch: (name: string, value: ColorValue) => void;
  updateSwatch: (id: string, name: string, value: ColorValue) => void;
  deleteSwatch: (id: string) => void;
  set: <K extends keyof ThemeSettings>(key: K, value: ThemeSettings[K]) => void;
}

function ButtonStylesGroup({
  theme,
  swatches,
  saveSwatch,
  updateSwatch,
  deleteSwatch,
  set,
}: ButtonStylesGroupProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Defaults (also mirrored in generateThemeCSS) so the UI has something to
  // bind against even when a legacy theme has the fields undefined.
  const buttonBg: ThemeBackgroundColor =
    theme.buttonBg ?? { type: "solid", color: "#ffffff", opacity: 100 };
  const buttonText = theme.buttonText ?? "#000000";
  // Effective style mirrors the CSS layer's fallback: prefer the new
  // `buttonBorderStyle` field, otherwise derive from legacy `buttonBorderShow`
  // (true → "solid", false → "none") so old themes show up correctly in the UI.
  const buttonBorderStyle: BorderStyle =
    theme.buttonBorderStyle ?? (theme.buttonBorderShow ? "solid" : "none");
  const buttonBorderColor = theme.buttonBorderColor ?? theme.border;
  const buttonBorderWidth = theme.buttonBorderWidth ?? "1px";

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-theme-secondary mb-1">
          Background
        </label>
        <ColorPicker
          label="Button background"
          value={buttonBg as ColorValue}
          onChange={(next) => set("buttonBg", next as ThemeBackgroundColor)}
          swatches={swatches}
          onSaveSwatch={saveSwatch}
          onUpdateSwatch={updateSwatch}
          onDeleteSwatch={deleteSwatch}
        />
      </div>
      <TextColorRow
        label="Text color"
        legacyValue={buttonText}
        richValue={theme.buttonTextRich}
        onChange={({ legacy, rich }) => {
          // Persist both fields in one dispatch.
          set("buttonText", legacy);
          set("buttonTextRich", rich);
        }}
      />
      {/* Border style → width → color, matching the Image section's pattern.
          Width + color collapse out of the panel when style is "none", same
          canvas-truth rule we apply globally. We mirror the new style into the
          legacy `buttonBorderShow` boolean on every change so older renderers
          (and persisted themes shared across deploys) stay consistent. */}
      <SelectRow
        label="Border style"
        value={buttonBorderStyle}
        options={IMAGE_BORDER_STYLES.map((s) => ({ value: s, label: s }))}
        onChange={(v) => {
          const next = v as BorderStyle;
          set("buttonBorderStyle", next);
          set("buttonBorderShow", next !== "none");
        }}
      />
      {buttonBorderStyle !== "none" && (
        <>
          <div>
            <label className="block text-xs text-theme-secondary mb-1">
              Border width
            </label>
            <CssLengthInput
              value={buttonBorderWidth}
              onChange={(v) => set("buttonBorderWidth", v)}
              min={0}
              max={64}
              ariaLabel="Global button border width"
              placeholder="0"
            />
          </div>
          <HexPickerRow
            label="Border color"
            value={buttonBorderColor}
            onChange={(v) => set("buttonBorderColor", v)}
          />
        </>
      )}
      <BorderRadiusInput
        label="Button border radius"
        value={theme.buttonBorderRadius}
        min={0}
        max={9999}
        onChange={(v) => set("buttonBorderRadius", v)}
      />

      {/* Advanced (states) — hover / pressed / active overrides. */}
      <div className="border-t border-theme pt-3">
        <button
          type="button"
          onClick={() => setAdvancedOpen((o) => !o)}
          className="w-full flex items-center justify-between text-xs font-semibold text-theme-muted hover:text-theme-primary cursor-pointer mb-2"
        >
          <span>Advanced (states)</span>
          <svg
            className={`w-4 h-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`}
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
        {advancedOpen && (
          <div className="space-y-4">
            <ButtonStateRow
              label="Hover"
              defaultHint="Default: inverts base bg and text"
              bg={theme.buttonHoverBg}
              text={theme.buttonHoverText}
              textRich={theme.buttonHoverTextRich}
              swatches={swatches}
              saveSwatch={saveSwatch}
              updateSwatch={updateSwatch}
              deleteSwatch={deleteSwatch}
              onChangeBg={(v) => set("buttonHoverBg", v)}
              onChangeText={(legacy, rich) => {
                set("buttonHoverText", legacy);
                set("buttonHoverTextRich", rich);
              }}
              onResetBg={() => set("buttonHoverBg", undefined)}
              onResetText={() => {
                set("buttonHoverText", undefined);
                set("buttonHoverTextRich", undefined);
              }}
            />
            <ButtonStateRow
              label="Pressed"
              defaultHint="Default: hover darkened by 10%"
              bg={theme.buttonPressedBg}
              text={theme.buttonPressedText}
              textRich={theme.buttonPressedTextRich}
              swatches={swatches}
              saveSwatch={saveSwatch}
              updateSwatch={updateSwatch}
              deleteSwatch={deleteSwatch}
              onChangeBg={(v) => set("buttonPressedBg", v)}
              onChangeText={(legacy, rich) => {
                set("buttonPressedText", legacy);
                set("buttonPressedTextRich", rich);
              }}
              onResetBg={() => set("buttonPressedBg", undefined)}
              onResetText={() => {
                set("buttonPressedText", undefined);
                set("buttonPressedTextRich", undefined);
              }}
            />
            <ButtonStateRow
              label="Active"
              defaultHint="Default: hover darkened by 10%"
              bg={theme.buttonActiveBg}
              text={theme.buttonActiveText}
              textRich={theme.buttonActiveTextRich}
              swatches={swatches}
              saveSwatch={saveSwatch}
              updateSwatch={updateSwatch}
              deleteSwatch={deleteSwatch}
              onChangeBg={(v) => set("buttonActiveBg", v)}
              onChangeText={(legacy, rich) => {
                set("buttonActiveText", legacy);
                set("buttonActiveTextRich", rich);
              }}
              onResetBg={() => set("buttonActiveBg", undefined)}
              onResetText={() => {
                set("buttonActiveText", undefined);
                set("buttonActiveTextRich", undefined);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

interface ButtonStateRowProps {
  label: string;
  defaultHint: string;
  bg: ThemeBackgroundColor | undefined;
  text: string | undefined;
  /** Rich (Solid|Gradient|SwatchRef) text override paired with `text`. When
   *  set, the picker shows it; on every change we write both fields. */
  textRich: TextColorValue | undefined;
  swatches: SavedSwatch[];
  saveSwatch: (name: string, value: ColorValue) => void;
  updateSwatch: (id: string, name: string, value: ColorValue) => void;
  deleteSwatch: (id: string) => void;
  onChangeBg: (v: ThemeBackgroundColor | undefined) => void;
  onChangeText: (legacy: string | undefined, rich: TextColorValue | undefined) => void;
  onResetBg: () => void;
  onResetText: () => void;
}

function ButtonStateRow({
  label,
  defaultHint,
  bg,
  text,
  textRich,
  swatches,
  saveSwatch,
  updateSwatch,
  deleteSwatch,
  onChangeBg,
  onChangeText,
  onResetBg,
  onResetText,
}: ButtonStateRowProps) {
  const bgModified = bg !== undefined;
  const textModified = text !== undefined || textRich !== undefined;
  // Placeholder values for the picker triggers when nothing is overridden.
  // The actual rendered defaults at runtime come from generateThemeCSS.
  // Button bg is `ThemeBackgroundColor` (no image variant) so a direct
  // assignment is safe.
  const bgValue: ColorValue =
    bg ?? { type: "solid", color: "#888888", opacity: 100 };
  // Picker value for text: rich when set, else a solid from the legacy hex
  // (or a neutral placeholder when neither is set).
  const textValue: ColorValue =
    textRich ?? { type: "solid", color: text ?? "#888888", opacity: 100 };

  return (
    <div className="space-y-2 rounded border border-theme/60 p-2">
      <div className="text-[10px] text-theme-muted font-semibold">
        {label}
      </div>
      {/* Background override */}
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs text-theme-secondary flex items-center gap-1.5">
            <span>Background</span>
            {bgModified && (
              <span
                className="w-1.5 h-1.5 rounded-full bg-[var(--color-brand-red)] flex-shrink-0"
                aria-label="Modified from theme"
                title="Modified from theme"
              />
            )}
          </label>
          {bgModified && (
            <button
              type="button"
              onClick={onResetBg}
              className="p-1 rounded text-theme-muted hover:text-theme-primary hover:bg-theme-tertiary cursor-pointer"
              title="Reset to default"
              aria-label="Reset to default"
            >
              <RefreshIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <ColorPicker
          label={`${label} background`}
          value={bgValue}
          onChange={(next) => onChangeBg(next as ThemeBackgroundColor)}
          swatches={swatches}
          onSaveSwatch={saveSwatch}
          onUpdateSwatch={updateSwatch}
          onDeleteSwatch={deleteSwatch}
        />
        {!bgModified && (
          <div className="text-[10px] text-theme-muted italic">
            {defaultHint}
          </div>
        )}
      </div>
      {/* Text override */}
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs text-theme-secondary flex items-center gap-1.5">
            <span>Text</span>
            {textModified && (
              <span
                className="w-1.5 h-1.5 rounded-full bg-[var(--color-brand-red)] flex-shrink-0"
                aria-label="Modified from theme"
                title="Modified from theme"
              />
            )}
          </label>
          {textModified && (
            <button
              type="button"
              onClick={onResetText}
              className="p-1 rounded text-theme-muted hover:text-theme-primary hover:bg-theme-tertiary cursor-pointer"
              title="Reset to default"
              aria-label="Reset to default"
            >
              <RefreshIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <ColorPicker
          label={`${label} text color`}
          value={textValue}
          onChange={(next) => {
            // Mirror the TextColorRow pattern: persist both the legacy hex
            // (derived via gradientFallbackHex) and the rich value. The rich
            // value is dropped when it's a plain solid that matches the
            // legacy hex, keeping the persisted theme JSON minimal.
            const legacy = gradientFallbackHex(next, swatches);
            let rich: TextColorValue | undefined = next as TextColorValue;
            if (
              next.type === "solid" &&
              (next.opacity ?? 100) >= 100 &&
              next.color.toLowerCase() === legacy.toLowerCase()
            ) {
              rich = undefined;
            }
            onChangeText(legacy, rich);
          }}
          allowedTypes={["solid", "gradient"]}
          swatches={swatches}
          onSaveSwatch={saveSwatch}
          onUpdateSwatch={updateSwatch}
          onDeleteSwatch={deleteSwatch}
        />
        {!textModified && (
          <div className="text-[10px] text-theme-muted italic">
            {defaultHint}
          </div>
        )}
      </div>
    </div>
  );
}

