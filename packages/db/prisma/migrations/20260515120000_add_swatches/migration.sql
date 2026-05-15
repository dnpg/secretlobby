-- ============================================================================
-- add Swatch model — per-account saved colors & gradients used by ColorPicker
-- ============================================================================
--
-- Steps:
--   1. CREATE TABLE "Swatch" with cuid id, accountId FK (cascade delete),
--      kind ("solid" | "gradient"), value (JSON), createdAt.
--   2. Index on accountId for the per-account lookup the loader does on every
--      page-builder visit.
--
-- Rollback (manual):
--   DROP TABLE "Swatch";
-- ============================================================================

-- CreateTable
CREATE TABLE "Swatch" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Swatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Swatch_accountId_idx" ON "Swatch"("accountId");

-- AddForeignKey
ALTER TABLE "Swatch" ADD CONSTRAINT "Swatch_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
