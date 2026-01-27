-- AlterTable
ALTER TABLE "Track" ADD COLUMN     "hlsReady" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "waveformPeaks" JSONB;
