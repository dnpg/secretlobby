// =============================================================================
// V2 → V3 page-layout migration
// -----------------------------------------------------------------------------
// v3 moves column sizing from per-column percentage `width`s onto a single
// `grid-template-columns` string at the section level. Designers can now type
// `"1fr 1fr"` / `"1fr 300px"` / `"minmax(0, 2fr) 1fr"` directly instead of
// editing each column's width by hand. The renderer reads
// `Section.gridTemplateDesktop` / `gridTemplateTablet` / `gridTemplateMobile`
// (the latter only when `mobileLayout === "grid"`).
//
// The migration:
//   - leaves `Column.width` / `Column.tabletWidth` on the persisted JSON for
//     reversibility (`width` / `tabletWidth` are `@deprecated` on the schema
//     but still accepted — SectionView never reads them again). We pass them
//     through untouched so the v2 form is recoverable from disk if we ever
//     need to roll back without a destructive DB write.
//   - synthesises `gridTemplateDesktop` from the columns' `width` values.
//     Common ratios (50/50, 66/33, 33/33/33) collapse to clean fr values
//     (`"1fr 1fr"`, `"2fr 1fr"`, `"1fr 1fr 1fr"`) via
//     `percentsToGridTemplate`; anything else falls through to a rounded
//     ratio anchored on the smallest track.
//   - synthesises `gridTemplateTablet` only when any column carried a
//     `tabletWidth` override, so v2 sections that didn't customise tablet
//     don't gain a redundant override string.
//   - leaves `gridTemplateMobile` unset — `mobileLayout` keeps its existing
//     semantic (`stack` / `keep` / `slider`). Designers can opt into the
//     new `"grid"` mobile mode after the fact.
//
// Lazy on read, same shape as `migrateLobbyToV2`: the editor's loader runs
// the migration in-memory; the first autosave persists the v3 form back to
// the DB. Reverting the branch leaves the DB untouched. Idempotent — running
// on an already-v3 layout returns it unchanged.
// =============================================================================

import {
  PAGE_LAYOUT_VERSION,
  parseWidthToPercent,
  percentsToGridTemplate,
} from "@secretlobby/lobby-template";
import type {
  Section,
  StoredPageLayout,
} from "~/components/page-builder/state/types";

const V3_TARGET_VERSION = PAGE_LAYOUT_VERSION;

// True when the layout still uses v2 (or earlier) section sizing — either
// because `version` < 3, or because at least one section is missing its
// `gridTemplateDesktop` field. The version check alone is enough for a
// well-formed v2 layout, but the "missing field" guard makes the migration
// idempotent on partially-migrated or hand-edited JSON.
export function needsV2ToV3Migration(layout: StoredPageLayout): boolean {
  if (typeof layout.version === "number" && layout.version >= V3_TARGET_VERSION) {
    // Even at v3, check the sections have grid templates — if a section was
    // hand-rolled without the new field, top it up.
    return layout.sections.some(
      (s) =>
        typeof (s as Section).gridTemplateDesktop !== "string" ||
        (s as Section).gridTemplateDesktop.length === 0
    );
  }
  return true;
}

// Convert a v2 layout to v3 in-memory. Pure function — doesn't mutate the
// input. Safe to call on an already-v3 layout (returns an equivalent value).
export function migrateLobbyToV3(layout: StoredPageLayout): StoredPageLayout {
  const migratedSections = layout.sections.map((section) =>
    upgradeSection(section)
  );
  return {
    sections: migratedSections,
    version: V3_TARGET_VERSION,
  };
}

function upgradeSection(section: Section): Section {
  const columnCount = section.columns.length;

  // Already migrated? Preserve as-is to keep the migration idempotent. We
  // still ensure `gridTemplateDesktop` is non-empty; an empty string would
  // collapse the section at render time.
  const hasDesktopTemplate =
    typeof section.gridTemplateDesktop === "string" &&
    section.gridTemplateDesktop.trim().length > 0;
  if (hasDesktopTemplate) {
    return section;
  }

  // Pull per-column percentages off the legacy `width` field. Missing /
  // malformed values fall back to an equal split via `parseWidthToPercent`'s
  // default, so the section never collapses on bad input.
  const desktopPercents = section.columns.map((col) =>
    parseWidthToPercent(col.width ?? "", columnCount)
  );
  const gridTemplateDesktop = percentsToGridTemplate(desktopPercents);

  // Tablet template only when at least one column carried a tabletWidth
  // override in v2. Otherwise leave the field unset so the renderer falls
  // back to the desktop template (matching v2's behaviour).
  let gridTemplateTablet: string | undefined;
  const anyTabletOverride = section.columns.some(
    (col) => typeof col.tabletWidth === "string" && col.tabletWidth.length > 0
  );
  if (anyTabletOverride) {
    const tabletPercents = section.columns.map((col) =>
      parseWidthToPercent(col.tabletWidth || col.width || "", columnCount)
    );
    gridTemplateTablet = percentsToGridTemplate(tabletPercents);
  }

  return {
    ...section,
    gridTemplateDesktop,
    ...(gridTemplateTablet ? { gridTemplateTablet } : {}),
  };
}
