import { forwardRef } from "react";
import * as RadixCheckbox from "@radix-ui/react-checkbox";
import { cn } from "../lib/utils.js";

// =============================================================================
// Checkbox
// -----------------------------------------------------------------------------
// Thin wrapper around @radix-ui/react-checkbox with project styling:
//   - 16px square, brand-red fill when checked.
//   - Console-theme background + border when unchecked.
//   - Inherits accessibility behavior from Radix (proper roles, keyboard
//     support, indeterminate handling, label association via aria-labelledby).
//
// Use the controlled form via `checked` + `onCheckedChange`. The shape
// matches Radix exactly so consumers can pass any extra Radix props (name,
// disabled, required, etc.) without us re-declaring them.
// =============================================================================

export interface CheckboxProps extends RadixCheckbox.CheckboxProps {
  /** Optional className applied to the trigger button (the visible square). */
  className?: string;
}

export const Checkbox = forwardRef<HTMLButtonElement, CheckboxProps>(
  function Checkbox({ className, ...rest }, ref) {
    return (
      <RadixCheckbox.Root
        ref={ref}
        className={cn(
          "inline-flex h-4 w-4 items-center justify-center rounded border transition-colors cursor-pointer outline-none",
          "border-theme bg-theme-tertiary",
          "data-[state=checked]:bg-[var(--color-brand-red)] data-[state=checked]:border-[var(--color-brand-red)]",
          "focus-visible:ring-2 focus-visible:ring-blue-500/40",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...rest}
      >
        <RadixCheckbox.Indicator className="flex items-center justify-center text-white">
          <svg
            className="h-3 w-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={3}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        </RadixCheckbox.Indicator>
      </RadixCheckbox.Root>
    );
  }
);
