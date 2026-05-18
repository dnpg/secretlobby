import { useState, type ReactNode } from "react";
import { Checkbox, cn } from "@secretlobby/ui";

// =============================================================================
// ThemeOverrideAccordion
// -----------------------------------------------------------------------------
// Shared chrome for "edit the global theme OR override per-block" surfaces
// inside the block-settings panel. Used by:
//   - PlayerBlockSettings — wraps <PlayerThemeFields/>
//   - CardBlockSettings   — wraps <CardThemeFields/>
//
// The accordion itself doesn't know what theme fields it contains; the
// caller renders whichever editor they want as `children`. That keeps the
// component agnostic and lets us add another consumer (e.g. an Image
// theme accordion, a Section theme accordion) in the future without
// touching this file.
//
// Responsibilities:
//   - Render a closed-by-default accordion with chevron + title.
//   - Render a Radix Checkbox labeled "Override" on the header row,
//     click-isolated from the chevron so the user can flip the toggle
//     without expanding the panel.
//   - Surface a red dot next to the title when `hasAnyOverrides` is true
//     so the user can tell at a glance that this block diverges from the
//     global theme.
//   - Render a short helper line at the top of the body explaining
//     which scope edits will apply to.
//
// What it does NOT do:
//   - Dispatch theme/override actions — the caller wires `onChange` on
//     its child editor based on the current `overrideActive` state.
//   - Clear existing overrides when the toggle flips off — same reason;
//     the caller owns the store. Calling code typically does this in
//     `onOverrideToggle`.
// =============================================================================
export interface ThemeOverrideAccordionProps {
  /** Header label (e.g. `"Theme"`). */
  title: string;
  /** Whether the block currently has any per-block overrides. Drives the
   *  red-dot indicator next to the title. */
  hasAnyOverrides: boolean;
  /** Whether the override toggle is ON. When true, callers route their
   *  editor's onChange to block.themeOverrides instead of the global
   *  theme. */
  overrideActive: boolean;
  /** Fired when the user flips the override checkbox. Callers typically
   *  clear all block overrides when this goes false. */
  onOverrideToggle: (next: boolean) => void;
  /** Open by default? Defaults to false to keep the block-settings panel
   *  short on first open. */
  defaultOpen?: boolean;
  /** The actual theme editor — `<PlayerThemeFields/>`, `<CardThemeFields/>`,
   *  etc. The caller wires the editor's `onChange` based on `overrideActive`. */
  children: ReactNode;
}

export function ThemeOverrideAccordion({
  title,
  hasAnyOverrides,
  overrideActive,
  onOverrideToggle,
  defaultOpen = false,
  children,
}: ThemeOverrideAccordionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded border border-theme">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex-1 flex items-center gap-2 text-left text-xs font-semibold text-theme-muted hover:text-theme-primary cursor-pointer"
          aria-expanded={open}
        >
          <svg
            className={cn(
              "w-3.5 h-3.5 transition-transform",
              open && "rotate-180"
            )}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 8.25l-7.5 7.5-7.5-7.5"
            />
          </svg>
          <span>{title}</span>
          {hasAnyOverrides && (
            <span
              className="w-1.5 h-1.5 rounded-full bg-[var(--color-brand-red)] flex-shrink-0"
              aria-label="Block has theme overrides"
              title="This block has per-block theme overrides"
            />
          )}
        </button>
        <label
          className="flex items-center gap-1.5 text-[10px] text-theme-muted cursor-pointer"
          // Click-isolation: the wrapping <button> would otherwise
          // toggle the accordion open/closed when the user just wants to
          // flip the Override switch.
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={overrideActive}
            onCheckedChange={(v) => onOverrideToggle(v === true)}
            aria-label={`Override theme for this block only`}
          />
          <span>Override</span>
        </label>
      </div>
      {open && (
        // 20px top/bottom padding inside every theme accordion body —
        // matches the global theme overlay treatment so the two
        // surfaces feel consistent. The top border preserves the
        // divider between the accordion header and its body.
        <div className="border-t border-theme py-5 px-3 space-y-3">
          <p className="text-[11px] text-theme-muted leading-snug">
            {overrideActive
              ? "Editing this block only. Override is ON."
              : "Editing the global theme. Every block of this type updates."}
          </p>
          {children}
        </div>
      )}
    </div>
  );
}
