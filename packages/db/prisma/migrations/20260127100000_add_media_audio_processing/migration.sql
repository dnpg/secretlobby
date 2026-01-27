-- AlterTable: Add audio processing fields to Media
ALTER TABLE "Media" ADD COLUMN "hlsReady" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Media" ADD COLUMN "waveformPeaks" JSONB;
ALTER TABLE "Media" ADD COLUMN "metadata" JSONB;

-- AlterTable: Add mediaId to Track
ALTER TABLE "Track" ADD COLUMN "mediaId" TEXT;

-- AddForeignKey
ALTER TABLE "Track" ADD CONSTRAINT "Track_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Track_mediaId_idx" ON "Track"("mediaId");
