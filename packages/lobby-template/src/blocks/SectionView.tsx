// =============================================================================
// SectionView (v3 grid)
// -----------------------------------------------------------------------------
// View-only section renderer driven by CSS Grid + container queries — the
// component emits one DOM tree at SSR time and the consuming app's CSS picks
// the layout tier (mobile-stack / mobile-slider / mobile-grid / tablet /
// desktop) based on the section's own container width. No JavaScript reflow,
// no SSR/hydration flash, and the editor's device-frame preview "just works"
// because the frame is the container.
//
// Track sizing comes from three CSS custom properties on the section:
//   - `--section-grid-desktop`   (always present; section's primary template)
//   - `--section-grid-tablet`    (falls back to desktop when unset)
//   - `--section-grid-mobile`    (consulted only when `mobileLayout === "grid"`)
//
// Designers express each template as a normal `grid-template-columns` value:
// `"1fr 1fr"`, `"1fr 300px"`, `"minmax(0, 2fr) 1fr"`, … — whatever the CSS
// spec accepts lands directly on the section. The editor's column resize tool
// drags only `fr` tokens, so a designer can lock a sidebar to a pixel width
// and still resize the fluid track next to it.
//
// `mobileLayout` is exposed via the `data-mobile-layout` attribute and
// selected by CSS rules. Required CSS lives in each app's `app.css` under
// the `.lobby-section*` selectors — see those files for the canonical rules;
// they MUST stay in sync.
//
// `Column.width` / `Column.tabletWidth` are now @deprecated on the schema —
// the migration converts persisted percentages into the section's grid
// template at load time, so this renderer never reads them.
// =============================================================================

import type { Block, Section } from "./types";
import { ColumnView } from "./ColumnView";
import { equalGridTemplate, parseGapValue } from "./layoutHelpers";

export interface SectionViewProps {
  section: Section;
  /** Per-block renderer forwarded to each ColumnView. See ColumnView for the
   *  shape; `index` is the persisted block index inside its column. */
  renderBlock: (block: Block, columnIndex: number, blockIndex: number) => React.ReactNode;
}

export function SectionView({ section, renderBlock }: SectionViewProps) {
  if (section.hidden === true) return null;

  const columnCount = section.columns.length;
  const gapValue = parseGapValue(section.columnGap);
  const rowGapValue = parseGapValue(section.rowGap);

  // Grid templates per viewport. The desktop value is the spine; tablet
  // falls back to desktop and mobile falls back to desktop only when
  // `mobileLayout === "grid"` is explicit (CSS rules below decide). We
  // synthesise a sensible equal split if the persisted layout is missing the
  // desktop value — this only happens for layouts that skipped the v3
  // migration on read (defensive; shouldn't occur in practice).
  const desktopTemplate =
    section.gridTemplateDesktop && section.gridTemplateDesktop.trim().length > 0
      ? section.gridTemplateDesktop
      : equalGridTemplate(columnCount);
  const tabletTemplate = section.gridTemplateTablet ?? desktopTemplate;
  const mobileTemplate = section.gridTemplateMobile ?? desktopTemplate;

  return (
    <div
      data-section-container="true"
      data-mobile-layout={section.mobileLayout || "stack"}
      className="lobby-section relative rounded-lg transition-all border-2 border-transparent"
      style={
        {
          "--section-column-gap": gapValue,
          "--section-row-gap": rowGapValue,
          "--section-grid-desktop": desktopTemplate,
          "--section-grid-tablet": tabletTemplate,
          "--section-grid-mobile": mobileTemplate,
        } as React.CSSProperties
      }
    >
      <div className="lobby-section-columns relative">
        {section.columns.map((column, columnIndex) => {
          if (column.hidden === true) return null;
          return (
            <div
              key={column.id}
              className="lobby-section-column relative"
            >
              <ColumnView
                column={column}
                renderBlock={(block, blockIndex) =>
                  renderBlock(block, columnIndex, blockIndex)
                }
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
