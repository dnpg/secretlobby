-- Lobby access controls: two orthogonal axes (access policy × identity
-- method) plus a per-lobby visitor table. See packages/db/prisma/schema.prisma
-- for the full model — comments on the Lobby and LobbyUser blocks explain
-- how the flags compose at runtime.
--
-- Backwards compatibility: existing rows are public-by-default, but we
-- preserve current behavior for any lobby that already has a password by
-- flipping passwordRequired = true when Lobby.password is non-empty. The
-- runtime check in apps/lobby switches from "is password set?" to
-- "is passwordRequired true?" in the follow-up phase; until then both
-- predicates evaluate the same way for existing rows.

-- CreateEnum
CREATE TYPE "LobbyAccessPolicy" AS ENUM ('PUBLIC', 'INVITE_ONLY', 'DOMAIN_ALLOWLIST');

-- CreateEnum
CREATE TYPE "LobbyUserStatus" AS ENUM ('PENDING', 'ACTIVE');

-- AlterTable: add new access-control columns to Lobby
ALTER TABLE "Lobby"
    ADD COLUMN "accessPolicy"     "LobbyAccessPolicy" NOT NULL DEFAULT 'PUBLIC',
    ADD COLUMN "identityEmail"    BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "identityGoogle"   BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "passwordRequired" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "allowedDomains"   TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Backfill: any lobby that currently has a non-empty password keeps its
-- password gate on by default. Empty/null passwords stay public.
UPDATE "Lobby"
SET "passwordRequired" = true
WHERE "password" IS NOT NULL AND "password" <> '';

-- CreateTable: LobbyUser
CREATE TABLE "LobbyUser" (
    "id"                 TEXT NOT NULL,
    "lobbyId"            TEXT NOT NULL,
    "email"              TEXT NOT NULL,
    "status"             "LobbyUserStatus" NOT NULL DEFAULT 'PENDING',
    "googleSub"          TEXT,
    "magicLinkToken"     TEXT,
    "magicLinkExpiresAt" TIMESTAMP(3),
    "magicLinkSentAt"    TIMESTAMP(3),
    "invitedByUserId"    TEXT,
    "invitedAt"          TIMESTAMP(3),
    "firstLoginAt"       TIMESTAMP(3),
    "lastSeenAt"         TIMESTAMP(3),
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LobbyUser_pkey" PRIMARY KEY ("id")
);

-- Indexes / uniques on LobbyUser
CREATE UNIQUE INDEX "LobbyUser_magicLinkToken_key" ON "LobbyUser"("magicLinkToken");
CREATE UNIQUE INDEX "LobbyUser_lobbyId_email_key" ON "LobbyUser"("lobbyId", "email");
CREATE INDEX "LobbyUser_lobbyId_idx" ON "LobbyUser"("lobbyId");
CREATE INDEX "LobbyUser_email_idx" ON "LobbyUser"("email");
CREATE INDEX "LobbyUser_googleSub_idx" ON "LobbyUser"("googleSub");
CREATE INDEX "LobbyUser_magicLinkExpiresAt_idx" ON "LobbyUser"("magicLinkExpiresAt");

-- Foreign keys
ALTER TABLE "LobbyUser"
    ADD CONSTRAINT "LobbyUser_lobbyId_fkey"
    FOREIGN KEY ("lobbyId") REFERENCES "Lobby"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LobbyUser"
    ADD CONSTRAINT "LobbyUser_invitedByUserId_fkey"
    FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
