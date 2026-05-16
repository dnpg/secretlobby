import type {
  BlockContent,
  HeadingBlockContent,
} from "../../state/types";

interface HeadingBlockSettingsProps {
  content: HeadingBlockContent;
  onUpdate: (content: Partial<BlockContent>) => void;
}

const LEVELS = [1, 2, 3, 4, 5, 6] as const;

export function HeadingBlockSettings({
  content,
  onUpdate,
}: HeadingBlockSettingsProps) {
  return (
    <div className="space-y-2">
      <label className="block text-xs uppercase tracking-wide text-theme-muted">
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
  );
}
