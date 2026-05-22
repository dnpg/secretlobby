import { useEffect, useState } from "react";
import { cn } from "@secretlobby/ui";
import type { SaveStatus } from "../state/reducer";

interface SaveStatusIndicatorProps {
  saveStatus: SaveStatus;
  lastSavedAt: number | null;
  dirty: boolean;
  // Optional theme channel — when provided, the indicator reflects whichever
  // channel is most recently active (saving > error > unsaved > saved).
  themeSaveStatus?: SaveStatus;
  themeLastSavedAt?: number | null;
  themeDirty?: boolean;
}

// Tiny status pill rendered in the top toolbar. Keeps CSS minimal and matches
// the existing dark-theme styling. `dirty=true` overrides "saved" because the
// user has typed since the last successful write. Reflects both the layout and
// theme channels when the theme props are supplied.
export function SaveStatusIndicator({
  saveStatus,
  lastSavedAt,
  dirty,
  themeSaveStatus = "idle",
  themeLastSavedAt = null,
  themeDirty = false,
}: SaveStatusIndicatorProps) {
  // Combined view of both channels.
  const isSaving = saveStatus === "saving" || themeSaveStatus === "saving";
  const hasError = saveStatus === "error" || themeSaveStatus === "error";
  const isDirty = dirty || themeDirty;
  // Use the most recent successful save timestamp from either channel.
  const lastSaved = Math.max(lastSavedAt ?? 0, themeLastSavedAt ?? 0) || null;
  const hasSavedState =
    !isDirty &&
    (saveStatus === "saved" || themeSaveStatus === "saved") &&
    lastSaved !== null;

  // Tick the "Saved · Xs ago" indicator while idle so it stays current.
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!hasSavedState) return;
    const handle = setInterval(() => forceTick((n) => n + 1), 5000);
    return () => clearInterval(handle);
  }, [hasSavedState]);

  let label: string;
  let tone: string;
  if (isSaving) {
    label = "Saving…";
    tone = "text-theme-secondary";
  } else if (hasError) {
    label = "Save error";
    tone = "text-red-400";
  } else if (isDirty) {
    label = "Unsaved changes";
    tone = "text-theme-muted";
  } else if (hasSavedState && lastSaved) {
    const seconds = Math.max(1, Math.round((Date.now() - lastSaved) / 1000));
    label =
      seconds < 60
        ? `Saved · ${seconds}s ago`
        : `Saved · ${Math.round(seconds / 60)}m ago`;
    tone = "text-theme-muted";
  } else {
    label = "";
    tone = "text-theme-muted";
  }

  if (!label) {
    return <div aria-hidden className="text-xs" />;
  }
  return (
    <div className={cn("text-xs", tone)} aria-live="polite">
      {label}
    </div>
  );
}
