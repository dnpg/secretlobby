import type {
  BlockContent,
  ParagraphBlockContent,
} from "../../state/types";
import { usePageBuilder } from "../../state/provider";
import { RefreshIcon } from "../../icons";
import { CssLengthInput } from "~/components/css-length-input";

interface ParagraphBlockSettingsProps {
  content: ParagraphBlockContent;
  onUpdate: (content: Partial<BlockContent>) => void;
}

const ALIGN_OPTIONS = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
] as const;

export function ParagraphBlockSettings({
  content,
  onUpdate,
}: ParagraphBlockSettingsProps) {
  const current = content.align ?? "left";
  const { state } = usePageBuilder();
  // Theme default — falls back to 16px so legacy themes without the field
  // still render a sane number in the input. The actual rendered default at
  // runtime comes from `--text-base-size` emitted by generateThemeCSS.
  const themeFontSize = parseInt(state.theme.textBaseSize ?? "16px", 10) || 16;
  const overrideFontSize = content.fontSize
    ? parseInt(content.fontSize, 10) || themeFontSize
    : null;
  const effectiveFontSize = overrideFontSize ?? themeFontSize;

  return (
    <div className="space-y-3">
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

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs text-theme-muted flex items-center gap-1.5">
            <span>Font size</span>
            {overrideFontSize !== null && (
              <span
                className="w-1.5 h-1.5 rounded-full bg-[var(--color-brand-red)] flex-shrink-0"
                aria-label="Overrides the theme font size"
                title="Overrides the theme font size"
              />
            )}
          </label>
          {overrideFontSize !== null && (
            <button
              type="button"
              onClick={() =>
                onUpdate({ fontSize: undefined } as Partial<BlockContent>)
              }
              className="p-1 rounded text-theme-muted hover:text-theme-primary hover:bg-theme-tertiary cursor-pointer"
              title="Reset to theme font size"
              aria-label="Reset to theme font size"
            >
              <RefreshIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <CssLengthInput
          value={`${effectiveFontSize}px`}
          onChange={(next) =>
            onUpdate({ fontSize: next } as Partial<BlockContent>)
          }
          min={8}
          max={128}
          ariaLabel="Paragraph font size override"
          placeholder={String(themeFontSize)}
        />
        {overrideFontSize === null && (
          <div className="text-[10px] text-theme-muted italic">
            Theme default ({themeFontSize}px). Editing creates a per-paragraph
            override.
          </div>
        )}
      </div>
    </div>
  );
}
