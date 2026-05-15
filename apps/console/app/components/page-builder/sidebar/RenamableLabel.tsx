import { useEffect, useRef, useState } from "react";
import { cn } from "@secretlobby/ui";

interface RenamableLabelProps {
  value: string;
  placeholder: string;
  onChange: (next: string) => void;
  className?: string;
}

// Renamable label used by the accordion section header. Click to edit;
// commits on blur or Enter, cancels on Escape.
export function RenamableLabel({
  value,
  placeholder,
  onChange,
  className,
}: RenamableLabelProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    if (draft !== value) onChange(draft.trim());
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "px-1 py-0 text-sm bg-theme-tertiary border border-theme rounded focus:outline-none focus:ring-1 focus:ring-violet-400 text-theme-primary",
          className
        )}
        placeholder={placeholder}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setDraft(value);
        setEditing(true);
      }}
      className={cn(
        "text-left text-sm hover:underline cursor-pointer truncate",
        className
      )}
      title="Click to rename"
    >
      {value || placeholder}
    </button>
  );
}
