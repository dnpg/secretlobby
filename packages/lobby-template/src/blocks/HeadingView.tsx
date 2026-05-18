// =============================================================================
// HeadingView
// -----------------------------------------------------------------------------
// Static heading renderer for the lobby. Reads the heading level (1–6) and
// the stored inline doc, emits a real <h1>–<h6> wrapped in `pb-heading-gradient`
// so the same Card-title gradient classes the editor uses paint correctly on
// the published lobby. The class is defined in apps/lobby/app/app.css (and
// the console's app.css for parity) — when the wrapping card sets the
// `--color-text-heading*` CSS vars the gradient flows through; outside a
// card the rule falls back to the global text-primary color and no gradient.
//
// Unlike the editor's HeadingBlock (which renders the doc inside a Tiptap
// editor), this view emits the markup directly. The InlineContent walker
// strips the editor's outer doc/paragraph wrappers so we don't end up with
// `<h1><p>…</p></h1>`.
// =============================================================================

import { Fragment } from "react";
import type { HeadingBlockContent } from "./types";
import { InlineContent } from "./inlineDoc";

export interface HeadingViewProps {
  content: HeadingBlockContent;
}

// Tailwind class mapping per heading level — identical to the editor's
// HeadingBlock so the lobby paints with the same typography ladder.
const LEVEL_CLASS: Record<HeadingBlockContent["level"], string> = {
  1: "text-4xl font-bold leading-tight",
  2: "text-3xl font-bold leading-tight",
  3: "text-2xl font-semibold leading-snug",
  4: "text-xl font-semibold leading-snug",
  5: "text-lg font-semibold leading-snug",
  6: "text-base font-semibold leading-snug",
};

export function HeadingView({ content }: HeadingViewProps) {
  const level = (content.level ?? 1) as HeadingBlockContent["level"];
  const className = `w-full pb-heading-gradient ${LEVEL_CLASS[level]}`;
  const inner = <InlineContent doc={content.inline} />;
  // Dispatch on level so we emit the correct semantic tag. JSX tag names
  // must be lowercase strings or PascalCase identifiers, so we can't write
  // `<h{level}>` directly — a small switch is the canonical pattern.
  switch (level) {
    case 1:
      return <h1 className={className}>{inner}</h1>;
    case 2:
      return <h2 className={className}>{inner}</h2>;
    case 3:
      return <h3 className={className}>{inner}</h3>;
    case 4:
      return <h4 className={className}>{inner}</h4>;
    case 5:
      return <h5 className={className}>{inner}</h5>;
    case 6:
      return <h6 className={className}>{inner}</h6>;
    default:
      return <Fragment>{inner}</Fragment>;
  }
}
