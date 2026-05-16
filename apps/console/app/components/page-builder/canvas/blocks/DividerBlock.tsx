import type { DividerBlockContent, ThemeSettings } from "../../state/types";

interface DividerBlockProps {
  content: DividerBlockContent;
  theme: ThemeSettings;
}

// Visual horizontal rule — picks up the theme's `--color-border` so it sits
// naturally inside whatever surface it's dropped on.
export function DividerBlock({ content: _content, theme: _theme }: DividerBlockProps) {
  return (
    <hr
      className="w-full my-2"
      style={{ border: "none", borderTop: "1px solid var(--color-border)" }}
    />
  );
}
