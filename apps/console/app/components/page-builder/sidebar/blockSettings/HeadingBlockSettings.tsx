import type {
  BlockContent,
  HeadingBlockContent,
} from "../../state/types";

interface HeadingBlockSettingsProps {
  content: HeadingBlockContent;
  onUpdate: (content: Partial<BlockContent>) => void;
}

const LEVELS = [1, 2, 3, 4, 5, 6] as const;
const ALIGN_OPTIONS = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
] as const;

export function HeadingBlockSettings({
  content,
  onUpdate,
}: HeadingBlockSettingsProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="block text-xs text-theme-muted">
          Level
        </label>
        <div className="flex gap-1">
          {LEVELS.map((lvl) => {
            const active = content.level === lvl;
            return (
              <button
                key={lvl}
                type="button"
                onClick={() =>
                  onUpdate({ level: lvl } as Partial<BlockContent>)
                }
                className={
                  active
                    ? "flex-1 px-2 py-1 rounded text-xs bg-[var(--color-brand-red)] text-white cursor-pointer"
                    : "flex-1 px-2 py-1 rounded text-xs border border-theme text-theme-secondary hover:text-theme-primary cursor-pointer"
                }
              >
                H{lvl}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-xs text-theme-muted">Alignment</label>
        <div className="flex gap-1">
          {ALIGN_OPTIONS.map((opt) => {
            const active = (content.align ?? "left") === opt.value;
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
    </div>
  );
}
