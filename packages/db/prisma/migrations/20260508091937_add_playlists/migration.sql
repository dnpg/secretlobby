-- ============================================================================
-- Phase 6 — add Playlist model + denormalize tracks behind playlists
-- ============================================================================
--
-- Steps:
--   1. CREATE TABLE "Playlist" with cuid id, lobbyId FK (cascade delete),
--      unique (lobbyId, name) and an index on (lobbyId, position).
--   2. ALTER TABLE "Track" ADD nullable "playlistId" + FK (set null on delete).
--   3. New indexes on Track: ("playlistId"), ("playlistId", "position").
--   4. Backfill: per lobby that has tracks, create a "Default" playlist and
--      point that lobby's tracks at it. Idempotent on this dataset because we
--      only insert when no playlist exists for the lobby (LEFT JOIN guard).
--   5. (Future migration) tighten Track.playlistId to NOT NULL once prod is
--      verified to have zero rows with NULL playlistId.
--
-- Rollback (manual):
--   ALTER TABLE "Track" DROP CONSTRAINT "Track_playlistId_fkey";
--   DROP INDEX "Track_playlistId_position_idx";
--   DROP INDEX "Track_playlistId_idx";
--   ALTER TABLE "Track" DROP COLUMN "playlistId";
--   DROP TABLE "Playlist";
-- ============================================================================

-- CreateTable
CREATE TABLE "Playlist" (
    "id" TEXT NOT NULL,
    "lobbyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Playlist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Playlist_lobbyId_position_idx" ON "Playlist"("lobbyId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Playlist_lobbyId_name_key" ON "Playlist"("lobbyId", "name");

-- AddForeignKey
ALTER TABLE "Playlist" ADD CONSTRAINT "Playlist_lobbyId_fkey" FOREIGN KEY ("lobbyId") REFERENCES "Lobby"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: add playlistId to Track (nullable for the duration of backfill)
ALTER TABLE "Track" ADD COLUMN "playlistId" TEXT;

-- CreateIndex
CREATE INDEX "Track_playlistId_idx" ON "Track"("playlistId");

-- CreateIndex
CREATE INDEX "Track_playlistId_position_idx" ON "Track"("playlistId", "position");

-- AddForeignKey
ALTER TABLE "Track" ADD CONSTRAINT "Track_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- Data backfill
-- ----------------------------------------------------------------------------
-- For every lobby that currently owns at least one Track, create a "Default"
-- playlist (if one doesn't already exist for that lobby) and point all of its
-- tracks at it. The cuid generator below uses pgcrypto's gen_random_bytes
-- when available; if pgcrypto is not installed, swap to the md5 fallback.
-- ============================================================================

-- ID generation uses md5 of random() + clock_timestamp() + lobbyId so the
-- migration runs without requiring the pgcrypto extension. Collisions are
-- astronomically unlikely for one-row-per-lobby backfill.
INSERT INTO "Playlist" ("id", "lobbyId", "name", "position", "isDefault", "createdAt", "updatedAt")
SELECT
  'cl' || md5(random()::text || clock_timestamp()::text || l."id"),
  l."id",
  'Default',
  0,
  true,
  NOW(),
  NOW()
FROM "Lobby" l
WHERE EXISTS (SELECT 1 FROM "Track" t WHERE t."lobbyId" = l."id")
  AND NOT EXISTS (SELECT 1 FROM "Playlist" p WHERE p."lobbyId" = l."id");

-- Point existing tracks at their lobby's default playlist.
UPDATE "Track" t
SET "playlistId" = p."id"
FROM "Playlist" p
WHERE t."lobbyId" = p."lobbyId"
  AND p."isDefault" = true
  AND t."playlistId" IS NULL;
