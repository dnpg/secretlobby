import type {
  BlockContent,
  CodeBlockBlockContent,
} from "../../state/types";

interface CodeBlockBlockSettingsProps {
  content: CodeBlockBlockContent;
  onUpdate: (content: Partial<BlockContent>) => void;
}

export function CodeBlockBlockSettings({
  content,
  onUpdate,
}: CodeBlockBlockSettingsProps) {
  return (
    <div className="space-y-2">
      <label className="block text-xs text-theme-muted">
        Language
      </label>
      <input
        type="text"
        value={content.language ?? ""}
        onChange={(e) =>
          onUpdate({ language: e.target.value } as Partial<BlockContent>)
        }
        placeholder="e.g. javascript, python"
        className="w-full px-2 py-1 text-sm rounded border border-theme bg-transparent text-theme-primary placeholder:text-theme-muted outline-none focus:border-[var(--color-brand-red)]"
      />
    </div>
  );
}
