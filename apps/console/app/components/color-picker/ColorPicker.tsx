import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@secretlobby/ui";
import type {
  ColorValue,
  GradientKindValue,
  GradientStop,
  GradientValue,
  SavedSwatch,
  SolidValue,
} from "./types";
import {
  changeGradientKind,
  clampPercent,
  colorValueToCSS,
  defaultSolid,
  gradientToSolid,
  makeStopId,
  normalizeHex,
  resolveSwatchRef,
  solidToGradient,
  stripHash,
  unlinkValue,
} from "./utils";

// =============================================================================
// ColorPicker
// -----------------------------------------------------------------------------
// Figma-style swatch + popover. Pure UI: caller owns the value, the swatch
// library, and persistence handlers. The component renders the swatch button
// (the trigger) — clicking it opens the popover.
//
// Tabs: "Custom" (active by default) | "Saved swatches".
// Types: solid | gradient, gated by `allowedTypes`. When only one type is
// allowed, the type toggle is hidden.
// =============================================================================

type ColorType = "solid" | "gradient";

export interface ColorPickerProps {
  value: ColorValue;
  onChange: (next: ColorValue) => void;
  /**
   * Which value types are allowed. Defaults to ["solid", "gradient"]. When
   * omitted entirely, the saved swatches tab is still rendered; pass an empty
   * `swatches` array to hide the library content.
   */
  allowedTypes?: ColorType[];
  /** Per-account saved swatches. Empty array hides the saved-swatches grid. */
  swatches?: SavedSwatch[];
  /** Persist the current value as a named swatch (name comes from the
   *  inline name prompt rendered when the user clicks the "+" button). */
  onSaveSwatch?: (name: string, value: ColorValue) => void;
  /** Update an existing swatch's name + value. Triggered from the edit
   *  pencil on a saved swatch tile. */
  onUpdateSwatch?: (id: string, name: string, value: ColorValue) => void;
  onDeleteSwatch?: (id: string) => void;
  /** Optional label, used as aria-label on the trigger button. */
  label?: string;
  /**
   * Session-local draft override hooks for the in-flight swatch edit. When
   * supplied, every change to the in-progress value while the picker is in
   * edit mode (pencil → SwatchNamePrompt with kind="edit") is mirrored into
   * the drafts map so other consumers of the same `swatch-ref` re-render
   * against the unsaved value. Cancel / close-without-save clears the draft.
   * Optional so callers outside the page-builder context can omit these
   * without breaking the picker (the only consequence is no live preview).
   */
  setDraft?: (id: string, value: ColorValue) => void;
  clearDraft?: (id: string) => void;
}

// Prompt mode at the top of the popover:
//  - null      → no prompt shown
//  - "create"  → "Save current value as new swatch" prompt
//  - { id }    → "Update existing swatch" prompt (edit mode)
type PromptMode =
  | null
  | { kind: "create"; name: string }
  | { kind: "edit"; id: string; name: string };

export function ColorPicker({
  value,
  onChange,
  allowedTypes = ["solid", "gradient"],
  swatches = [],
  onSaveSwatch,
  onUpdateSwatch,
  onDeleteSwatch,
  label,
  setDraft,
  clearDraft,
}: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"custom" | "saved">("custom");
  // Inline name prompt — shown when the user clicks the "+" save-swatch
  // button OR the pencil edit button on a saved tile. Resets when reopened.
  const [prompt, setPrompt] = useState<PromptMode>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  // Smart placement — flip to top if there isn't room below, and flip the
  // horizontal anchor (left-edge-of-trigger vs right-edge-of-trigger) so the
  // 280px popover doesn't clip off-screen. Default to bottom-left because
  // the picker lives in the right rail; on mount we re-measure and correct
  // before paint via useLayoutEffect.
  const [placement, setPlacement] = useState<{
    v: "top" | "bottom";
    h: "left" | "right";
  }>({ v: "bottom", h: "left" });

  // Mirror the in-progress value into the session-local drafts map whenever
  // the picker is in edit mode. The draft override drives live preview on
  // every consumer of this swatch-ref (the canvas reads drafts when resolving
  // refs). On exit (cancel / popover close / mode change) we clear the draft
  // so consumers snap back to the saved value.
  const editPromptId =
    prompt?.kind === "edit" ? prompt.id : null;
  useEffect(() => {
    if (!editPromptId || !setDraft) return;
    setDraft(editPromptId, value);
  }, [editPromptId, value, setDraft]);
  // When the edit prompt closes (save commits it, cancel clears it, or the
  // popover closes), drop the draft. We capture the id in the cleanup so the
  // clear targets the swatch we WERE editing, not whatever the prompt may
  // have become afterward.
  useEffect(() => {
    if (!editPromptId || !clearDraft) return;
    return () => clearDraft(editPromptId);
  }, [editPromptId, clearDraft]);

  // Closing the popover while a prompt is open counts as abandoning the
  // edit/create — clear the prompt state so reopening the popover starts
  // fresh. The editPromptId effect above already handles clearing the draft
  // when the prompt transitions away from "edit".
  useEffect(() => {
    if (!open && prompt !== null) {
      setPrompt(null);
    }
  }, [open, prompt]);

  // Click-outside + Escape close the popover. If we're mid-edit, also drop
  // the draft — closing the popover counts as "abandon the edit".
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Recompute placement whenever the popover opens, on window resize, and on
  // ancestor scroll. We measure the trigger's viewport rect plus the
  // popover's own height (using a fallback before it has rendered), then
  // flip to top / right anchor when the preferred bottom-left would clip.
  // Runs in useLayoutEffect so the corrected placement is applied before
  // paint — no flash in the default position.
  useLayoutEffect(() => {
    if (!open) return;
    const POPOVER_WIDTH = 280;
    const POPOVER_HEIGHT_FALLBACK = 420; // close to the picker's typical height
    const MARGIN = 8;
    const compute = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const popoverHeight =
        popoverRef.current?.offsetHeight || POPOVER_HEIGHT_FALLBACK;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const v: "top" | "bottom" =
        spaceBelow >= popoverHeight + MARGIN || spaceBelow >= spaceAbove
          ? "bottom"
          : "top";
      const spaceRight = window.innerWidth - rect.left;
      const spaceLeft = rect.right;
      const h: "left" | "right" =
        spaceRight >= POPOVER_WIDTH + MARGIN || spaceRight >= spaceLeft
          ? "left"
          : "right";
      setPlacement((prev) =>
        prev.v === v && prev.h === h ? prev : { v, h }
      );
    };
    compute();
    window.addEventListener("resize", compute);
    // Use capture so we catch scroll on any ancestor (e.g. the sidebar's
    // overflow-y-auto container) — those don't bubble.
    window.addEventListener("scroll", compute, true);
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("scroll", compute, true);
    };
  }, [open]);

  // Clicking the pencil on a saved tile: enter edit mode, seed the editor
  // with the swatch's value, switch to Custom tab. The "we're editing X"
  // is carried in `prompt.kind === "edit"`, so the Save button at the top
  // commits both name + the live Custom-tab value back to the swatch.
  const beginEdit = (swatch: SavedSwatch) => {
    onChange(swatch.value);
    setTab("custom");
    setPrompt({ kind: "edit", id: swatch.id, name: swatch.name });
  };

  // Resolved value used by the Custom tab when the user is currently linked
  // to a swatch. Falls back to a default solid if the ref can't be resolved
  // (e.g. the swatch was deleted from another session).
  const isRef = value.type === "swatch-ref";
  const linkedSwatch = isRef
    ? swatches.find((s) => s.id === value.swatchId)
    : null;

  return (
    <div className="relative">
      <SwatchTrigger
        ref={triggerRef}
        value={value}
        swatches={swatches}
        onClick={() => setOpen((v) => !v)}
        label={label}
      />
      {open && (
        <div
          ref={popoverRef}
          className={cn(
            "absolute z-40 w-[280px] rounded-xl border border-theme bg-theme-secondary shadow-2xl",
            placement.v === "bottom" ? "top-full mt-2" : "bottom-full mb-2",
            placement.h === "left" ? "left-0" : "right-0"
          )}
          role="dialog"
          aria-label={label || "Color picker"}
        >
          <div className="flex items-center justify-between border-b border-theme px-3 py-2">
            <div className="flex items-center gap-1 rounded bg-theme-tertiary/50 p-0.5">
              <button
                type="button"
                onClick={() => setTab("custom")}
                className={cn(
                  "px-2 py-1 text-xs rounded cursor-pointer",
                  tab === "custom"
                    ? "bg-theme-primary text-theme-primary"
                    : "text-theme-secondary hover:text-theme-primary"
                )}
              >
                Custom
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab("saved");
                  // Switching to Saved tab cancels any in-flight edit so the
                  // user doesn't get a confusing "still editing X" header
                  // while browsing other swatches.
                  if (prompt?.kind === "edit") setPrompt(null);
                }}
                className={cn(
                  "px-2 py-1 text-xs rounded cursor-pointer",
                  tab === "saved"
                    ? "bg-theme-primary text-theme-primary"
                    : "text-theme-secondary hover:text-theme-primary"
                )}
              >
                Saved
              </button>
            </div>
            <div className="flex items-center gap-1">
              {onSaveSwatch && (
                <button
                  type="button"
                  onClick={() =>
                    setPrompt((p) =>
                      p?.kind === "create"
                        ? null
                        : { kind: "create", name: "" }
                    )
                  }
                  className={cn(
                    "p-1 rounded hover:bg-theme-tertiary text-theme-secondary hover:text-theme-primary cursor-pointer",
                    prompt?.kind === "create" && "bg-theme-tertiary text-theme-primary"
                  )}
                  title="Save current value to swatches"
                  aria-label="Save current value to swatches"
                  aria-pressed={prompt?.kind === "create"}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1 rounded hover:bg-theme-tertiary text-theme-secondary hover:text-theme-primary cursor-pointer"
                title="Close"
                aria-label="Close color picker"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {prompt?.kind === "create" && onSaveSwatch && (
            <SwatchNamePrompt
              mode="create"
              name={prompt.name}
              onNameChange={(name) => setPrompt({ kind: "create", name })}
              onCancel={() => setPrompt(null)}
              onConfirm={(name) => {
                const trimmed = name.trim();
                if (!trimmed) return;
                // If the user clicks "+" while the current value is a ref,
                // resolve it so the new swatch starts as a concrete value.
                // Swatches themselves never store refs.
                const toSave =
                  value.type === "swatch-ref"
                    ? unlinkValue(value, swatches)
                    : value;
                onSaveSwatch(trimmed, toSave);
                setPrompt(null);
                setTab("saved");
              }}
            />
          )}

          {prompt?.kind === "edit" && onUpdateSwatch && (
            <SwatchNamePrompt
              mode="edit"
              name={prompt.name}
              onNameChange={(name) =>
                setPrompt({ kind: "edit", id: prompt.id, name })
              }
              onCancel={() => setPrompt(null)}
              onConfirm={(name) => {
                const trimmed = name.trim();
                if (!trimmed) return;
                // Same resolve-before-save guard as the create path so a
                // swatch's stored `value` never holds another ref.
                const toSave =
                  value.type === "swatch-ref"
                    ? unlinkValue(value, swatches)
                    : value;
                onUpdateSwatch(prompt.id, trimmed, toSave);
                setPrompt(null);
                setTab("saved");
              }}
            />
          )}

          <div className="p-3 space-y-3">
            {tab === "custom" ? (
              value.type === "swatch-ref" ? (
                <LinkedPanel
                  swatch={linkedSwatch ?? null}
                  swatches={swatches}
                  onUnlink={() => onChange(unlinkValue(value, swatches))}
                />
              ) : (
                <CustomTab
                  value={value}
                  onChange={onChange}
                  allowedTypes={allowedTypes}
                />
              )
            ) : (
              <SavedTab
                swatches={swatches}
                onPick={(swatchId) =>
                  onChange({ type: "swatch-ref", swatchId })
                }
                onEdit={onUpdateSwatch ? beginEdit : undefined}
                onDelete={onDeleteSwatch}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Swatch name prompt — inline panel rendered between the popover header and
// the body when the user clicks the "+" save button (mode="create") or the
// pencil icon on a saved swatch tile (mode="edit"). The two modes share the
// same shell + name input — only the heading label and confirm-button label
// differ.
// =============================================================================

interface SwatchNamePromptProps {
  mode: "create" | "edit";
  name: string;
  onNameChange: (name: string) => void;
  onCancel: () => void;
  onConfirm: (name: string) => void;
}

function SwatchNamePrompt({
  mode,
  name,
  onNameChange,
  onCancel,
  onConfirm,
}: SwatchNamePromptProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  const trimmed = name.trim();
  const canSave = trimmed.length > 0;
  const heading = mode === "edit" ? "Edit swatch" : "Save swatch as";
  const confirmLabel = mode === "edit" ? "Update" : "Save";
  return (
    <div className="border-b border-theme bg-theme-tertiary/30 px-3 py-2">
      <label className="block text-[10px] uppercase tracking-wide text-theme-muted mb-1">
        {heading}
      </label>
      <div className="flex items-center gap-1.5">
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (canSave) onConfirm(name);
            } else if (e.key === "Escape") {
              e.preventDefault();
              onCancel();
            }
          }}
          maxLength={60}
          placeholder="e.g. Brand red"
          className="flex-1 min-w-0 px-2 py-1 text-xs rounded border border-theme bg-theme-tertiary text-theme-primary"
          aria-label="Swatch name"
        />
        <button
          type="button"
          onClick={onCancel}
          className="px-2 py-1 text-xs rounded border border-theme text-theme-secondary hover:bg-theme-tertiary cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => canSave && onConfirm(name)}
          disabled={!canSave}
          className="px-2 py-1 text-xs rounded bg-[var(--color-brand-red)] text-white hover:bg-[var(--color-brand-red)]/90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// Swatch trigger button — the always-visible "click me" piece of the picker.
// =============================================================================

interface SwatchTriggerProps {
  value: ColorValue;
  swatches: SavedSwatch[];
  onClick: () => void;
  label?: string;
}

const SwatchTrigger = ({
  ref,
  value,
  swatches,
  onClick,
  label,
}: SwatchTriggerProps & { ref?: React.Ref<HTMLButtonElement> }) => {
  // Resolve the value through the swatches list so a ref renders the live
  // underlying color rather than the neutral fallback.
  const css = colorValueToCSS(value, swatches);
  const isRef = value.type === "swatch-ref";
  const linkedSwatch = isRef
    ? swatches.find((s) => s.id === value.swatchId) ?? null
    : null;

  // For solid values, render the trigger as a unified hex + alpha cell with
  // a 1px divider — mirrors the visual of the in-popover ColorRow so the
  // trigger feels like a "closed" version of the same component. Ref / gradient
  // values use the original single-label layout because there's no alpha
  // channel to split out.
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded border border-theme bg-theme-tertiary/40 px-2 py-1.5 text-xs hover:bg-theme-tertiary cursor-pointer"
      aria-label={label || "Open color picker"}
    >
      <span
        className="relative block h-6 w-9 flex-shrink-0 rounded border border-theme overflow-hidden"
        // Checkered background shows through any transparency in the right half.
        style={{
          backgroundImage:
            "linear-gradient(45deg, rgba(255,255,255,0.15) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.15) 75%), linear-gradient(45deg, rgba(255,255,255,0.15) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.15) 75%)",
          backgroundSize: "8px 8px",
          backgroundPosition: "0 0, 4px 4px",
        }}
      >
        {/* Split-preview: left half shows the color at full opacity (a stable
            reference); right half shows the color with the actual alpha
            applied, letting the checkerboard read through any transparency. */}
        {value.type === "solid" ? (
          <>
            <span
              className="absolute inset-y-0 left-0 w-1/2"
              style={{ background: value.color }}
            />
            <span
              className="absolute inset-y-0 right-0 w-1/2"
              style={{ background: css }}
            />
          </>
        ) : (
          <span className="block h-full w-full" style={{ background: css }} />
        )}
        {isRef && (
          <span
            className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-theme-secondary border border-theme text-theme-primary shadow-sm"
            aria-hidden="true"
            title="Linked to a saved swatch"
          >
            <ChainLinkIcon className="w-2.5 h-2.5" />
          </span>
        )}
      </span>
      {value.type === "solid" ? (
        <span className="flex flex-1 min-w-0 items-center text-theme-primary">
          <span className="flex-1 min-w-0 truncate text-left uppercase">
            {stripHash(value.color)}
          </span>
          <span
            aria-hidden="true"
            className="mx-2 h-3 w-px bg-theme"
          />
          <span className="flex-shrink-0 text-theme-secondary">
            {value.opacity}%
          </span>
        </span>
      ) : (
        <span className="flex-1 truncate text-left text-theme-secondary">
          {isRef
            ? linkedSwatch
              ? `Linked to ${linkedSwatch.name}`
              : "Linked (swatch missing)"
            : `Gradient · ${value.gradient.stops.length} stops`}
        </span>
      )}
    </button>
  );
};

// Inline chain-link icon — used as the "linked" indicator on the trigger and
// inside the Linked panel header. No external icon-library dependency.
function ChainLinkIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13.828 10.172a4 4 0 010 5.656l-3 3a4 4 0 01-5.656-5.656l1.5-1.5M10.172 13.828a4 4 0 010-5.656l3-3a4 4 0 015.656 5.656l-1.5 1.5"
      />
    </svg>
  );
}

// =============================================================================
// Linked panel — shown in the Custom tab when the current value is a
// `swatch-ref`. Surfaces the linked swatch's name + resolved preview and a
// single "Unlink" button. Clicking Unlink replaces the ref with the resolved
// inline value so the user can edit freely from there.
// =============================================================================

interface LinkedPanelProps {
  swatch: SavedSwatch | null;
  swatches: SavedSwatch[];
  onUnlink: () => void;
}

function LinkedPanel({ swatch, swatches, onUnlink }: LinkedPanelProps) {
  // Preview CSS — render the resolved swatch when present, otherwise the
  // neutral fallback that colorValueToCSS would emit on its own.
  const previewCss = swatch
    ? colorValueToCSS(swatch.value, swatches)
    : "#888888";
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span
          className="block h-10 w-10 flex-shrink-0 rounded border border-theme"
          style={{
            backgroundImage:
              "linear-gradient(45deg, rgba(255,255,255,0.15) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.15) 75%), linear-gradient(45deg, rgba(255,255,255,0.15) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.15) 75%)",
            backgroundSize: "8px 8px",
            backgroundPosition: "0 0, 4px 4px",
          }}
        >
          <span
            className="block h-full w-full rounded"
            style={{ background: previewCss }}
          />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-theme-muted">
            <ChainLinkIcon className="w-3 h-3" />
            <span>Linked</span>
          </div>
          <div className="truncate text-xs text-theme-primary">
            {swatch ? swatch.name : "Swatch missing"}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={onUnlink}
        className="w-full px-2 py-1.5 text-xs rounded border border-theme bg-theme-tertiary/40 text-theme-primary hover:bg-theme-tertiary cursor-pointer"
        title="Unlink — copies the swatch's current value so you can edit freely"
      >
        Unlink
      </button>
      <div className="text-[10px] text-theme-muted">
        Edits to this swatch from the Swatches section will update everywhere
        it's linked.
      </div>
    </div>
  );
}

// =============================================================================
// Custom tab — solid OR gradient editor.
// =============================================================================

interface CustomTabProps {
  // The Custom tab only renders for concrete values — the parent picker
  // swaps in a <LinkedPanel> when the current value is a swatch-ref. Narrow
  // the type so the solid/gradient editors below can rely on the discriminant.
  value: SolidValue | GradientValue;
  onChange: (next: ColorValue) => void;
  allowedTypes: ColorType[];
}

function CustomTab({ value, onChange, allowedTypes }: CustomTabProps) {
  const showToggle = allowedTypes.length > 1;
  const currentType = value.type;

  const setType = (next: ColorType) => {
    if (next === currentType) return;
    if (next === "solid" && value.type === "gradient") {
      onChange(gradientToSolid(value));
    } else if (next === "gradient" && value.type === "solid") {
      onChange(solidToGradient(value));
    }
  };

  return (
    <div className="space-y-3">
      {showToggle && (
        <div className="flex items-center gap-1 rounded border border-theme bg-theme-tertiary/40 p-0.5">
          {allowedTypes.includes("solid") && (
            <button
              type="button"
              onClick={() => setType("solid")}
              className={cn(
                "flex-1 px-2 py-1 text-xs rounded cursor-pointer",
                currentType === "solid"
                  ? "bg-theme-primary text-theme-primary"
                  : "text-theme-secondary hover:text-theme-primary"
              )}
            >
              Solid
            </button>
          )}
          {allowedTypes.includes("gradient") && (
            <button
              type="button"
              onClick={() => setType("gradient")}
              className={cn(
                "flex-1 px-2 py-1 text-xs rounded cursor-pointer",
                currentType === "gradient"
                  ? "bg-theme-primary text-theme-primary"
                  : "text-theme-secondary hover:text-theme-primary"
              )}
            >
              Gradient
            </button>
          )}
        </div>
      )}

      {value.type === "solid" ? (
        <SolidEditor value={value} onChange={onChange} />
      ) : (
        <GradientEditor value={value} onChange={onChange} />
      )}
    </div>
  );
}

// =============================================================================
// Solid editor — hex + opacity + native color picker.
// =============================================================================

function SolidEditor({
  value,
  onChange,
}: {
  value: SolidValue;
  onChange: (next: ColorValue) => void;
}) {
  return (
    <div className="space-y-2">
      <ColorRow
        color={value.color}
        opacity={value.opacity}
        onColorChange={(color) => onChange({ ...value, color })}
        onOpacityChange={(opacity) => onChange({ ...value, opacity })}
      />
    </div>
  );
}

// =============================================================================
// AngleDial — circular control with a draggable pin. Used by linear and
// conic gradients to pick a 0–360° angle. Click anywhere on the circle (or
// drag the pin) to set the angle; the pin's position is computed from the
// cursor relative to the dial center, atan2 → degrees, normalized to 0–360.
//
// Tailwind's CSS-only approach can't draw the rotating pin natively, so the
// dial is an inline SVG with the pin's `transform` rebuilt on every render.
// =============================================================================

interface AngleDialProps {
  value: number; // 0–360
  onChange: (next: number) => void;
  size?: number; // px, default 32
}

function AngleDial({ value, onChange, size = 32 }: AngleDialProps) {
  const ref = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const angleFromEvent = (clientX: number, clientY: number): number => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return value;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    // We treat "0°" as pointing up (12 o'clock) and rotate clockwise so the
    // dial matches the CSS `linear-gradient(Ndeg)` convention.
    const dx = clientX - cx;
    const dy = clientY - cy;
    const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
    const normalized = Math.round((deg + 360) % 360);
    return normalized;
  };

  useEffect(() => {
    if (!draggingRef.current) return;
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      onChange(angleFromEvent(e.clientX, e.clientY));
    };
    const onUp = () => {
      draggingRef.current = false;
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    // We don't depend on `value`; only `onChange`. The closure captures the
    // latest onChange because the effect rebinds when it changes.
  }, [onChange]);

  const radius = size / 2;
  // Pin sits a couple of px in from the rim.
  const pinR = radius - 4;
  const rad = ((value - 90) * Math.PI) / 180; // adjust so 0° = up
  const px = radius + Math.cos(rad) * pinR;
  const py = radius + Math.sin(rad) * pinR;

  return (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      <div
        ref={ref}
        className="relative rounded-full border border-theme bg-theme-tertiary cursor-pointer select-none"
        style={{ width: size, height: size }}
        onMouseDown={(e) => {
          draggingRef.current = true;
          onChange(angleFromEvent(e.clientX, e.clientY));
        }}
        role="slider"
        aria-label="Gradient angle"
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={value}
        title={`${value}°`}
      >
        {/* Center dot for visual reference. */}
        <div
          className="absolute rounded-full bg-theme-secondary"
          style={{
            width: 3,
            height: 3,
            left: radius - 1.5,
            top: radius - 1.5,
          }}
        />
        {/* Pin. */}
        <div
          className="absolute rounded-full bg-[var(--color-brand-red)] shadow-sm pointer-events-none"
          style={{
            width: 7,
            height: 7,
            left: px - 3.5,
            top: py - 3.5,
          }}
        />
      </div>
      <input
        type="number"
        min={0}
        max={360}
        value={value}
        onChange={(e) =>
          onChange(Math.max(0, Math.min(360, Number(e.target.value) || 0)))
        }
        className="w-12 px-1.5 py-1 text-xs rounded border border-theme bg-theme-tertiary text-theme-primary"
        aria-label="Gradient angle (number)"
      />
    </div>
  );
}

// =============================================================================
// Gradient editor — angle, swap/rotate, draggable bar, stops list.
// =============================================================================

function GradientEditor({
  value,
  onChange,
}: {
  value: GradientValue;
  onChange: (next: ColorValue) => void;
}) {
  const g = value.gradient;
  const stops = g.stops;
  const [selectedStopId, setSelectedStopId] = useState<string>(
    stops[0]?.id ?? ""
  );

  // Sync selection if the selected stop is removed externally.
  useEffect(() => {
    if (!stops.find((s) => s.id === selectedStopId)) {
      setSelectedStopId(stops[0]?.id ?? "");
    }
  }, [stops, selectedStopId]);

  // Patch the active gradient. Splits the patch by which fields the current
  // kind owns (linear/conic have `angle`, radial has `shape`) so TypeScript's
  // discriminated union stays happy.
  const updateGradient = (patch: Partial<GradientKindValue>) => {
    const next: GradientKindValue =
      g.kind === "linear"
        ? { ...g, ...(patch as Partial<typeof g>) }
        : g.kind === "radial"
          ? { ...g, ...(patch as Partial<typeof g>) }
          : { ...g, ...(patch as Partial<typeof g>) };
    onChange({ ...value, gradient: next });
  };

  const setStops = (nextStops: GradientStop[]) => {
    updateGradient({ stops: nextStops } as Partial<GradientKindValue>);
  };

  const updateStop = (id: string, patch: Partial<GradientStop>) => {
    setStops(stops.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const addStop = (position = 50) => {
    const newStop: GradientStop = {
      id: makeStopId(),
      position,
      color: "#888888",
      opacity: 100,
    };
    setStops([...stops, newStop]);
    setSelectedStopId(newStop.id);
  };

  const removeStop = (id: string) => {
    if (stops.length <= 2) return; // gradients need at least 2 stops
    setStops(stops.filter((s) => s.id !== id));
  };

  // Reverse stop positions so the first color trades places with the last.
  const swapStops = () => {
    if (stops.length < 2) return;
    const sorted = [...stops].sort((a, b) => a.position - b.position);
    const reversed = sorted.map((s, i) => ({
      ...sorted[sorted.length - 1 - i],
      id: s.id,
      position: s.position,
    }));
    setStops(reversed);
  };

  // Rotate 90° — only meaningful for linear/conic.
  const rotate90 = () => {
    if (g.kind === "linear" || g.kind === "conic") {
      updateGradient({ angle: (g.angle + 90) % 360 } as Partial<GradientKindValue>);
    }
  };

  const setKind = (kind: "linear" | "radial" | "conic") => {
    onChange(changeGradientKind(value, kind));
  };

  const cssPreview = colorValueToCSS(value);

  return (
    <div className="space-y-3">
      {/* Top row: gradient kind select | angle dial (or shape select) |
          swap-side. Rotate-90 is below for the kinds that have an angle. */}
      <div className="flex items-center gap-2">
        <select
          value={g.kind}
          onChange={(e) => setKind(e.target.value as "linear" | "radial" | "conic")}
          className="flex-1 min-w-0 px-2 py-1 text-xs rounded border border-theme bg-theme-tertiary text-theme-primary cursor-pointer"
          aria-label="Gradient style"
        >
          <option value="linear">Linear</option>
          <option value="radial">Radial</option>
          <option value="conic">Conic</option>
        </select>
        {(g.kind === "linear" || g.kind === "conic") && (
          <AngleDial
            value={g.angle}
            onChange={(angle) =>
              updateGradient({ angle } as Partial<GradientKindValue>)
            }
          />
        )}
        {g.kind === "radial" && (
          <select
            value={g.shape}
            onChange={(e) =>
              updateGradient({
                shape: e.target.value as "circle" | "ellipse",
              } as Partial<GradientKindValue>)
            }
            className="px-2 py-1 text-xs rounded border border-theme bg-theme-tertiary text-theme-primary cursor-pointer"
            aria-label="Radial shape"
          >
            <option value="ellipse">Ellipse</option>
            <option value="circle">Circle</option>
          </select>
        )}
        <button
          type="button"
          onClick={swapStops}
          className="p-1.5 rounded border border-theme bg-theme-tertiary/40 hover:bg-theme-tertiary text-theme-secondary cursor-pointer flex-shrink-0"
          title="Reverse stop order"
          aria-label="Reverse stop order"
        >
          {/* Horizontal arrows — left and right. */}
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4-4 4M3 12h18M7 16l-4-4 4-4" />
          </svg>
        </button>
        {(g.kind === "linear" || g.kind === "conic") && (
          <button
            type="button"
            onClick={rotate90}
            className="p-1.5 rounded border border-theme bg-theme-tertiary/40 hover:bg-theme-tertiary text-theme-secondary cursor-pointer flex-shrink-0"
            title="Rotate 90°"
            aria-label="Rotate gradient 90 degrees"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M4 9a9 9 0 0114.32-4M20 15a9 9 0 01-14.32 4" />
            </svg>
          </button>
        )}
      </div>

      {/* Gradient bar */}
      <GradientBar
        stops={stops}
        cssPreview={cssPreview}
        selectedStopId={selectedStopId}
        onSelect={setSelectedStopId}
        onMove={(id, position) => updateStop(id, { position })}
        onAdd={addStop}
      />

      {/* Fallback color — surfaced in contexts that can't render a gradient
          (notably text-as-gradient via background-clip:text on older browsers,
          or hex-only consumers downstream). Required on every gradient value;
          the picker seeds it from the source solid when the user toggles
          solid → gradient. Old persisted gradient swatches predate this
          field — derive a default from the first stop so editing an older
          swatch doesn't crash, and bake the value back into `value.fallback`
          on first change so it's persisted on next save. */}
      <FallbackColorRow
        value={
          value.fallback ?? value.gradient.stops[0]?.color ?? "#000000"
        }
        onChange={(next) => onChange({ ...value, fallback: next })}
      />

      {/* Stops list */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-theme-muted uppercase tracking-wide">
            Stops
          </span>
          <button
            type="button"
            onClick={() => addStop(50)}
            className="p-0.5 rounded hover:bg-theme-tertiary text-theme-secondary hover:text-theme-primary cursor-pointer"
            title="Add stop"
            aria-label="Add gradient stop"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>

        <div className="space-y-1">
          {[...stops]
            .sort((a, b) => a.position - b.position)
            .map((stop) => (
              <StopRow
                key={stop.id}
                stop={stop}
                selected={stop.id === selectedStopId}
                onSelect={() => setSelectedStopId(stop.id)}
                onChange={(patch) => updateStop(stop.id, patch)}
                onRemove={() => removeStop(stop.id)}
                canRemove={stops.length > 2}
              />
            ))}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// FallbackColorRow — single hex + native color picker for the gradient's
// fallback color. Stripped down vs. the full <ColorPicker> popover because
// it's rendered *inside* the gradient editor's own popover — opening another
// popover here would be confusing. Tooltip explains the purpose.
// =============================================================================

interface FallbackColorRowProps {
  value: string;
  onChange: (next: string) => void;
}

function FallbackColorRow({ value, onChange }: FallbackColorRowProps) {
  // Focus-aware draft sync — see ColorRow for the rationale. The hex input
  // here is the only field on this row, so there's no divider/opacity side.
  const [hexDraft, setHexDraft] = useState(stripHash(value));
  const hexFocusedRef = useRef(false);
  useEffect(() => {
    if (!hexFocusedRef.current) setHexDraft(stripHash(value));
  }, [value]);
  const inputId = useId();
  const commitHex = (raw: string) => {
    const normalized = normalizeHex(raw);
    if (normalized) onChange(normalized);
    else setHexDraft(stripHash(value));
  };
  return (
    <div className="space-y-1">
      <label
        className="block text-[10px] uppercase tracking-wide text-theme-muted"
        title="Used in contexts that don't support gradients (e.g., text colors fall back to this in older browsers)."
      >
        Fallback color
      </label>
      <div className="flex items-center gap-1.5">
        <label
          htmlFor={inputId}
          className="block flex-shrink-0 h-7 w-7 rounded border border-theme cursor-pointer overflow-hidden"
          style={{ backgroundColor: value }}
        >
          <input
            id={inputId}
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="opacity-0 h-full w-full cursor-pointer"
            aria-label="Pick fallback color"
          />
        </label>
        {/* Match ColorRow's unified-cell visual — the inner input is
            borderless and the wrapper carries the focus ring. */}
        <div className="flex flex-1 min-w-0 items-stretch rounded border border-theme bg-theme-tertiary text-theme-primary focus-within:ring-2 focus-within:ring-blue-500/40">
          <input
            type="text"
            value={hexDraft}
            onChange={(e) => setHexDraft(e.target.value)}
            onFocus={() => {
              hexFocusedRef.current = true;
            }}
            onBlur={(e) => {
              hexFocusedRef.current = false;
              commitHex(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter")
                commitHex((e.target as HTMLInputElement).value);
            }}
            className="flex-1 min-w-0 px-1.5 py-1 text-xs border-none bg-transparent focus:outline-none text-theme-primary uppercase"
            aria-label="Fallback hex color"
            title="Used in contexts that don't support gradients (e.g., text colors fall back to this in older browsers)."
          />
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Gradient bar — draggable stops + double-click to add.
// =============================================================================

interface GradientBarProps {
  stops: GradientStop[];
  cssPreview: string;
  selectedStopId: string;
  onSelect: (id: string) => void;
  onMove: (id: string, position: number) => void;
  onAdd: (position: number) => void;
}

function GradientBar({
  stops,
  cssPreview,
  selectedStopId,
  onSelect,
  onMove,
  onAdd,
}: GradientBarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<string | null>(null);

  const positionFromEvent = (clientX: number): number => {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const ratio = (clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(100, Math.round(ratio * 100)));
  };

  useEffect(() => {
    const onMove2 = (e: MouseEvent) => {
      const id = draggingRef.current;
      if (!id) return;
      onMove(id, positionFromEvent(e.clientX));
    };
    const onUp = () => {
      draggingRef.current = null;
    };
    document.addEventListener("mousemove", onMove2);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove2);
      document.removeEventListener("mouseup", onUp);
    };
    // onMove changes per render — that's fine, we re-bind handlers.
  }, [onMove]);

  return (
    <div
      ref={barRef}
      className="relative h-9 rounded-full border border-theme overflow-visible"
      onDoubleClick={(e) => {
        const pos = positionFromEvent(e.clientX);
        onAdd(pos);
      }}
    >
      <div
        className="absolute inset-0 rounded-full"
        style={{
          backgroundImage:
            "linear-gradient(45deg, rgba(255,255,255,0.12) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.12) 75%), linear-gradient(45deg, rgba(255,255,255,0.12) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.12) 75%)",
          backgroundSize: "10px 10px",
          backgroundPosition: "0 0, 5px 5px",
        }}
      />
      <div
        className="absolute inset-0 rounded-full"
        style={{ background: cssPreview }}
      />
      {stops.map((stop) => (
        <button
          key={stop.id}
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            draggingRef.current = stop.id;
            onSelect(stop.id);
          }}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(stop.id);
          }}
          className={cn(
            "absolute top-1/2 -translate-x-1/2 -translate-y-1/2 h-7 w-5 rounded-sm border-2 shadow-md cursor-pointer",
            stop.id === selectedStopId
              ? "border-blue-500 ring-2 ring-blue-300/40"
              : "border-white"
          )}
          style={{
            left: `${stop.position}%`,
            backgroundColor: stop.color,
          }}
          aria-label={`Stop at ${stop.position}%`}
        />
      ))}
    </div>
  );
}

// =============================================================================
// Stop row — position / color swatch / hex / opacity / remove.
// =============================================================================

interface StopRowProps {
  stop: GradientStop;
  selected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<GradientStop>) => void;
  onRemove: () => void;
  canRemove: boolean;
}

function StopRow({
  stop,
  selected,
  onSelect,
  onChange,
  onRemove,
  canRemove,
}: StopRowProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded px-1 py-1 cursor-pointer",
        selected ? "bg-blue-500/10" : "hover:bg-theme-tertiary/40"
      )}
      onClick={onSelect}
    >
      <input
        type="number"
        min={0}
        max={100}
        value={stop.position}
        onChange={(e) =>
          onChange({
            position: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
          })
        }
        onClick={(e) => e.stopPropagation()}
        className="w-10 px-1 py-0.5 text-[11px] rounded border border-theme bg-theme-tertiary text-theme-primary flex-shrink-0"
        aria-label="Stop position"
      />
      <ColorRow
        compact
        narrow
        color={stop.color}
        opacity={stop.opacity}
        onColorChange={(color) => onChange({ color })}
        onOpacityChange={(opacity) => onChange({ opacity })}
      />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        disabled={!canRemove}
        className={cn(
          "p-1 rounded text-theme-muted hover:text-theme-primary cursor-pointer flex-shrink-0",
          !canRemove && "opacity-30 cursor-not-allowed"
        )}
        title={canRemove ? "Remove stop" : "Gradient requires at least 2 stops"}
        aria-label="Remove gradient stop"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
        </svg>
      </button>
    </div>
  );
}

// =============================================================================
// ColorRow — shared color swatch + hex input + opacity input.
// Used both at the top of the Solid editor and inside each gradient stop row.
// =============================================================================

interface ColorRowProps {
  color: string;
  opacity: number;
  onColorChange: (color: string) => void;
  onOpacityChange: (opacity: number) => void;
  compact?: boolean;
  /** Tightens the hex + opacity inputs so the whole row can sit inside a
   *  StopRow alongside a position field and a delete button without
   *  overflowing the 280px popover. */
  narrow?: boolean;
}

function ColorRow({
  color,
  opacity,
  onColorChange,
  onOpacityChange,
  compact = false,
  narrow = false,
}: ColorRowProps) {
  // Hex + opacity are tracked as local drafts so typing isn't clobbered by
  // parent re-renders (some consumers feed us back the same — or rounded —
  // value mid-keystroke, which would yank the input out from under the user).
  // The drafts only re-sync from the prop while the input is NOT focused;
  // while focused, the user's keystrokes are the source of truth.
  const [hexDraft, setHexDraft] = useState(stripHash(color));
  const [opacityDraft, setOpacityDraft] = useState<string>(String(opacity));
  const hexFocusedRef = useRef(false);
  const opacityFocusedRef = useRef(false);
  useEffect(() => {
    if (!hexFocusedRef.current) setHexDraft(stripHash(color));
  }, [color]);
  useEffect(() => {
    if (!opacityFocusedRef.current) setOpacityDraft(String(opacity));
  }, [opacity]);
  const inputId = useId();

  const commitHex = (raw: string) => {
    const normalized = normalizeHex(raw);
    if (normalized) onColorChange(normalized);
    else setHexDraft(stripHash(color));
  };

  const commitOpacity = (raw: string) => {
    if (raw.trim() === "") {
      setOpacityDraft(String(opacity));
      return;
    }
    const next = clampPercent(Number(raw));
    setOpacityDraft(String(next));
    if (next !== opacity) onOpacityChange(next);
  };

  return (
    <div className={cn("flex items-center flex-1 min-w-0", narrow ? "gap-1" : "gap-1.5")}>
      <label
        htmlFor={inputId}
        className={cn(
          "block flex-shrink-0 rounded border border-theme cursor-pointer overflow-hidden",
          compact ? (narrow ? "h-5 w-5" : "h-6 w-6") : "h-8 w-8"
        )}
        style={{ backgroundColor: color }}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          id={inputId}
          type="color"
          value={color}
          onChange={(e) => onColorChange(e.target.value)}
          className="opacity-0 h-full w-full cursor-pointer"
          aria-label="Pick color"
        />
      </label>
      {/* Unified hex + opacity cell. Single border + bg on the wrapper; the
          two inner inputs are borderless and share a 1px vertical divider so
          the whole thing reads as one control. focus-within highlights the
          full cell when either side is active. */}
      <div
        className={cn(
          "flex flex-1 min-w-0 items-stretch rounded border border-theme bg-theme-tertiary text-theme-primary",
          "focus-within:ring-2 focus-within:ring-blue-500/40"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="text"
          value={hexDraft}
          onChange={(e) => setHexDraft(e.target.value)}
          onFocus={() => {
            hexFocusedRef.current = true;
          }}
          onBlur={(e) => {
            hexFocusedRef.current = false;
            commitHex(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter")
              commitHex((e.target as HTMLInputElement).value);
          }}
          className={cn(
            "flex-1 min-w-0 border-none bg-transparent focus:outline-none text-theme-primary uppercase",
            narrow ? "px-1 py-0.5 text-[11px]" : "px-1.5 py-1 text-xs"
          )}
          aria-label="Hex color"
        />
        <div
          className="w-px self-stretch bg-theme border-0"
          aria-hidden="true"
        />
        <input
          type="number"
          min={0}
          max={100}
          value={opacityDraft}
          onChange={(e) => setOpacityDraft(e.target.value)}
          onFocus={() => {
            opacityFocusedRef.current = true;
          }}
          onBlur={(e) => {
            opacityFocusedRef.current = false;
            commitOpacity(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter")
              commitOpacity((e.target as HTMLInputElement).value);
          }}
          className={cn(
            "border-none bg-transparent focus:outline-none text-theme-primary text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
            narrow ? "w-7 px-0.5 py-0.5 text-[11px]" : "w-9 px-1 py-1 text-xs"
          )}
          aria-label="Opacity %"
        />
        <PercentDragHandle
          opacity={opacity}
          narrow={narrow}
          onOpacityChange={(next) => {
            setOpacityDraft(String(next));
            if (next !== opacity) onOpacityChange(next);
          }}
        />
      </div>
    </div>
  );
}

// =============================================================================
// PercentDragHandle — the trailing "%" glyph that doubles as a draggable
// scrubber. Hover shows the left/right-arrow cursor; mousedown starts a drag
// that updates opacity = startOpacity + round(deltaX / 2), clamped to [0,100].
// Document-level listeners are attached on drag start and removed on mouseup
// so the gesture survives the cursor briefly leaving the glyph. A click with
// no movement is a no-op (handled implicitly — no commit happens until the
// move handler fires with a non-zero delta).
// =============================================================================

interface PercentDragHandleProps {
  opacity: number;
  narrow: boolean;
  onOpacityChange: (next: number) => void;
}

function PercentDragHandle({
  opacity,
  narrow,
  onOpacityChange,
}: PercentDragHandleProps) {
  // We capture starting clientX + opacity at mousedown and read them from
  // refs inside the document-level mousemove so the closures don't get stale.
  const dragStateRef = useRef<{ startX: number; startOpacity: number } | null>(
    null
  );
  // Keep the latest onChange in a ref so the document-level listener — which
  // is bound once per drag — always calls the freshest callback.
  const onChangeRef = useRef(onOpacityChange);
  useEffect(() => {
    onChangeRef.current = onOpacityChange;
  }, [onOpacityChange]);

  useEffect(() => {
    // Cleanup any in-flight drag if the component unmounts mid-gesture.
    return () => {
      dragStateRef.current = null;
    };
  }, []);

  const handleMouseDown = (e: React.MouseEvent<HTMLButtonElement>) => {
    // Don't start a text selection on the surrounding elements while
    // scrubbing — the gesture is purely a drag.
    e.preventDefault();
    e.stopPropagation();
    dragStateRef.current = { startX: e.clientX, startOpacity: opacity };

    const onMove = (ev: MouseEvent) => {
      const state = dragStateRef.current;
      if (!state) return;
      const delta = ev.clientX - state.startX;
      // 2px per percent feels close to native input[type=range] sensitivity.
      const next = clampPercent(state.startOpacity + delta / 2);
      onChangeRef.current(next);
    };
    const onUp = () => {
      dragStateRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    // Hold the resize cursor over the whole page during the drag so it
    // doesn't snap back to a text cursor when the pointer leaves the glyph.
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
  };

  return (
    <button
      type="button"
      onMouseDown={handleMouseDown}
      onClick={(e) => {
        // A pure click without movement is intentionally a no-op — consume
        // the event so it doesn't bubble to the wrapper's click handler.
        e.preventDefault();
        e.stopPropagation();
      }}
      tabIndex={-1}
      className={cn(
        "flex items-center justify-center text-theme-muted select-none cursor-ew-resize flex-shrink-0 hover:text-theme-secondary",
        narrow ? "px-1 text-[11px]" : "px-1.5 text-xs"
      )}
      aria-label="Drag to change opacity"
      aria-hidden="true"
    >
      %
    </button>
  );
}

// =============================================================================
// Saved tab — grid of saved swatches with delete.
// =============================================================================

interface SavedTabProps {
  swatches: SavedSwatch[];
  /** Receives the swatch id — the picker promotes it into a `swatch-ref` so
   *  consumers stay linked to the swatch rather than copying its value. */
  onPick: (swatchId: string) => void;
  onEdit?: (swatch: SavedSwatch) => void;
  onDelete?: (id: string) => void;
}

function SavedTab({ swatches, onPick, onEdit, onDelete }: SavedTabProps) {
  if (swatches.length === 0) {
    return (
      <div className="text-xs text-theme-muted text-center py-6">
        No saved swatches yet. Use the + button in the header to save the
        current value.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      {swatches.map((s) => (
        <div key={s.id} className="relative group">
          <button
            type="button"
            onClick={() => onPick(s.id)}
            onContextMenu={(e) => {
              if (!onDelete) return;
              e.preventDefault();
              onDelete(s.id);
            }}
            className="flex items-center gap-2 w-full p-1 rounded border border-theme cursor-pointer hover:ring-2 hover:ring-blue-400/40 text-left bg-theme-tertiary/30"
            aria-label={`Apply saved swatch ${s.name}`}
            title={`${s.name} — click to apply`}
          >
            <span
              className="block h-7 w-7 flex-shrink-0 rounded border border-theme"
              style={{ background: colorValueToCSS(s.value) }}
            />
            <span className="flex-1 min-w-0 truncate text-xs text-theme-primary">
              {s.name}
            </span>
          </button>
          {/* Hover-actions: edit pencil + delete-x, top-right of the tile. */}
          {(onEdit || onDelete) && (
            <div className="absolute -top-1 -right-1 hidden group-hover:flex items-center gap-0.5">
              {onEdit && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(s);
                  }}
                  className="flex h-4 w-4 items-center justify-center rounded-full bg-theme-secondary border border-theme text-theme-muted hover:text-blue-400 cursor-pointer"
                  aria-label={`Edit swatch ${s.name}`}
                  title="Edit swatch"
                >
                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                  </svg>
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(s.id);
                  }}
                  className="flex h-4 w-4 items-center justify-center rounded-full bg-theme-secondary border border-theme text-theme-muted hover:text-red-400 cursor-pointer"
                  aria-label={`Delete swatch ${s.name}`}
                  title="Delete swatch"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// Re-export the trigger to allow other callers to render only the swatch.
export { defaultSolid };
