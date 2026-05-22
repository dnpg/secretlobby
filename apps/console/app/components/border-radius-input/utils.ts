// =============================================================================
// BorderRadiusInput utilities
// -----------------------------------------------------------------------------
// Small pure helpers shared by consumers of `BorderRadiusInput`. Lives in the
// same package so the "modified from theme" indicator pattern stays consistent
// across block-settings panels.
// =============================================================================

import type { BorderRadius } from "~/lib/theme";

/**
 * Structural equality for `BorderRadius` values. Treats `number === number` as
 * equal and deep-equal corner objects (all of `tl/tr/br/bl` must match). A
 * uniform number is NOT considered equal to a per-corner object even if every
 * corner of the object happens to equal that number — the equality is meant to
 * detect whether the user has touched the value, not whether the rendered CSS
 * would visually match.
 *
 * Used by block-settings panels to drive the "modified from theme" red-dot +
 * reset-button pattern: a stored override equal to the theme value is not
 * considered modified so the indicator stays meaningful.
 *
 * Both arguments may be `undefined` — two undefineds are equal; an undefined
 * vs. a defined value is not.
 */
export function radiiEqual(
  a: BorderRadius | undefined,
  b: BorderRadius | undefined
): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  if (typeof a === "number" && typeof b === "number") return a === b;
  if (typeof a === "object" && typeof b === "object") {
    return (
      a.tl === b.tl && a.tr === b.tr && a.br === b.br && a.bl === b.bl
    );
  }
  return false;
}
