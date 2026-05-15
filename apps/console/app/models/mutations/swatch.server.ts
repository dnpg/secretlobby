import { prisma } from "@secretlobby/db";

// =============================================================================
// Swatch mutations
// =============================================================================

export async function createSwatch(data: {
  accountId: string;
  name: string;
  kind: "solid" | "gradient";
  value: unknown; // ColorValue payload — stored as JSON
}) {
  return prisma.swatch.create({
    data: {
      accountId: data.accountId,
      name: data.name,
      kind: data.kind,
      // JSON.parse(JSON.stringify(...)) to coerce any non-plain objects.
      value: JSON.parse(JSON.stringify(data.value)),
    },
  });
}

/**
 * Update an existing swatch's name + value (and kind, since switching
 * solid<->gradient in the editor changes the kind discriminator too).
 *
 * Uses `updateMany` with `{ id, accountId }` so a mismatched accountId
 * silently no-ops — same defense pattern as `deleteSwatch` (avoid throwing
 * for cross-account ids the user might somehow craft).
 *
 * Note: no cascade is needed — refs read the swatch value live at render time,
 * so changing a swatch's `value` propagates to every consumer on next render.
 */
export async function updateSwatch(data: {
  id: string;
  accountId: string;
  name: string;
  kind: "solid" | "gradient";
  value: unknown;
}) {
  return prisma.swatch.updateMany({
    where: { id: data.id, accountId: data.accountId },
    data: {
      name: data.name,
      kind: data.kind,
      value: JSON.parse(JSON.stringify(data.value)),
    },
  });
}

// =============================================================================
// Swatch reference cascade on delete
// -----------------------------------------------------------------------------
// Saved swatches act like design tokens — consumers (the lobby's theme.background,
// per-block themeOverrides, button bg fields, etc.) store a `{ type: "swatch-ref",
// swatchId }` reference rather than copying the swatch's value. When the user
// deletes a swatch, we walk every lobby in the same account, replace every
// matching ref with the swatch's last known concrete Solid/Gradient value, and
// then drop the swatch row. The walk runs inside a single Prisma transaction so
// the cascade and the delete commit together.
// =============================================================================

/**
 * Deep-walk a JSON-serializable node and replace any `{ type: "swatch-ref",
 * swatchId }` payload matching `targetSwatchId` with a deep clone of
 * `inlineValue`. Returns a structurally new object — never mutates the input.
 *
 * Nodes that happen to have a `type` field but aren't swatch refs (gradient
 * stops with `kind`, `cardBgType: "solid"`, etc.) are left intact because we
 * key off both `type === "swatch-ref"` AND a matching `swatchId`.
 */
export function inlineSwatchRefs(
  node: unknown,
  targetSwatchId: string,
  inlineValue: unknown
): { value: unknown; replaced: number } {
  let replaced = 0;
  const walk = (n: unknown): unknown => {
    if (n === null || typeof n !== "object") return n;
    // Match a swatch-ref payload.
    const obj = n as Record<string, unknown>;
    if (
      obj.type === "swatch-ref" &&
      typeof obj.swatchId === "string" &&
      obj.swatchId === targetSwatchId
    ) {
      replaced += 1;
      // Deep clone so each replacement is independent.
      return JSON.parse(JSON.stringify(inlineValue));
    }
    if (Array.isArray(n)) {
      return n.map((item) => walk(item));
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = walk(v);
    }
    return out;
  };
  return { value: walk(node), replaced };
}

/**
 * Delete a swatch with cascade. Walks every lobby in the account and inlines
 * any `swatch-ref` pointing at the deleted swatch with the swatch's last
 * known concrete value. Wrapped in a transaction so the cascade and the
 * delete commit atomically.
 *
 * Returns the number of references that were replaced across all the
 * account's lobbies (the caller can surface a toast like
 * "Inlined N references" if it wants).
 *
 * Note: the deleteMany at the end uses `{ id, accountId }` so a mismatched
 * accountId silently no-ops — same defense pattern as the other mutations.
 * When the swatch row doesn't exist (or doesn't belong to the account) the
 * function returns `{ replacedCount: 0, deleted: false }`.
 */
export async function deleteSwatch(
  id: string,
  accountId: string
): Promise<{ replacedCount: number; deleted: boolean }> {
  return prisma.$transaction(async (tx) => {
    const swatch = await tx.swatch.findFirst({
      where: { id, accountId },
      select: { id: true, value: true },
    });
    if (!swatch) {
      return { replacedCount: 0, deleted: false };
    }

    // Inline value used to replace every reference. Stored as JSON in the
    // Swatch table so it's already a plain serializable shape.
    const inlineValue = swatch.value;

    // Walk every lobby's settings JSON. We scope by accountId — swatches are
    // per-account so refs only exist inside this account's lobbies.
    const lobbies = await tx.lobby.findMany({
      where: { accountId },
      select: { id: true, settings: true },
    });

    let replacedCount = 0;
    for (const lobby of lobbies) {
      if (!lobby.settings) continue;
      const { value: nextSettings, replaced } = inlineSwatchRefs(
        lobby.settings,
        id,
        inlineValue
      );
      if (replaced === 0) continue;
      replacedCount += replaced;
      await tx.lobby.update({
        where: { id: lobby.id },
        // JSON round-trip to coerce to a plain JSON shape for Prisma's Json
        // column type.
        data: { settings: JSON.parse(JSON.stringify(nextSettings)) },
      });
    }

    await tx.swatch.deleteMany({
      where: { id, accountId },
    });

    return { replacedCount, deleted: true };
  });
}
