-- ============================================================================
-- Add optional cover image (FK to Media) to Track
-- ============================================================================
--
-- The existing Track.media relation (audio) is being renamed in the Prisma
-- schema from an unnamed relation to the named relation "TrackAudioMedia" so
-- that a second FK to Media ("TrackCoverMedia") can coexist. Postgres-side
-- this is a no-op — the existing FK column name (`mediaId`) and constraint
-- name (`Track_mediaId_fkey`) are unchanged.
-- ============================================================================

-- AlterTable
ALTER TABLE "Track" ADD COLUMN "coverMediaId" TEXT;

-- CreateIndex
CREATE INDEX "Track_coverMediaId_idx" ON "Track"("coverMediaId");

-- AddForeignKey
ALTER TABLE "Track" ADD CONSTRAINT "Track_coverMediaId_fkey" FOREIGN KEY ("coverMediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
