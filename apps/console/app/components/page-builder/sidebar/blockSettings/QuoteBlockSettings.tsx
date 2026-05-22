import type { BlockContent, QuoteBlockContent } from "../../state/types";

interface QuoteBlockSettingsProps {
  content: QuoteBlockContent;
  onUpdate: (content: Partial<BlockContent>) => void;
}

const ALIGN_OPTIONS = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
] as const;

export function QuoteBlockSettings({
  content,
  onUpdate,
}: QuoteBlockSettingsProps) {
  const current = content.align ?? "left";
  return (
    <div className="space-y-2">
      <label className="block text-xs text-theme-muted">
        Alignment
      </label>
      <div className="flex gap-1">
        {ALIGN_OPTIONS.map((opt) => {
          const active = current === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() =>
                onUpdate({ align: opt.value } as Partial<BlockContent>)
              }
              className={
                active
                  ? "flex-1 px-2 py-1 rounded text-xs bg-[var(--color-brand-red)] text-white cursor-pointer"
                  : "flex-1 px-2 py-1 rounded text-xs border border-theme text-theme-secondary hover:text-theme-primary cursor-pointer"
              }
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
