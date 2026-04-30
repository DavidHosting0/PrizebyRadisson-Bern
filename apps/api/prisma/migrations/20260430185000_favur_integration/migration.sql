-- Favur shift-plan integration: extend Shift with source tracking, add the
-- FavurIntegration singleton config and the FavurUserMap mapping table.

-- 1) New PermissionCode enum values for shift roster + Favur integration.
ALTER TYPE "PermissionCode" ADD VALUE 'SHIFT_READ';
ALTER TYPE "PermissionCode" ADD VALUE 'SHIFT_MANAGE';

-- 2) Extend Shift with provenance + cosmetic fields.
ALTER TABLE "Shift" ADD COLUMN     "source"    TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "Shift" ADD COLUMN     "sourceId"  TEXT;
ALTER TABLE "Shift" ADD COLUMN     "label"     TEXT;
ALTER TABLE "Shift" ADD COLUMN     "color"     TEXT;
ALTER TABLE "Shift" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill updatedAt for any existing rows so the NOT NULL holds, then drop the default
-- since updatedAt is meant to be Prisma-managed (kept default for SQL safety).

CREATE UNIQUE INDEX "Shift_source_sourceId_key" ON "Shift"("source", "sourceId");
CREATE INDEX "Shift_startsAt_endsAt_idx" ON "Shift"("startsAt", "endsAt");

-- 3) FavurIntegration: singleton-ish config row (id = 'default').
CREATE TABLE "FavurIntegration" (
    "id"                TEXT NOT NULL DEFAULT 'default',
    "enabled"           BOOLEAN NOT NULL DEFAULT false,
    "baseUrl"           TEXT NOT NULL DEFAULT 'https://web.favur.ch',
    "email"             TEXT,
    "encryptedPassword" TEXT,
    "encryptedSession"  TEXT,
    "sessionExpiresAt"  TIMESTAMP(3),
    "windowDays"        INTEGER NOT NULL DEFAULT 14,
    "lastSyncAt"        TIMESTAMP(3),
    "lastSyncStatus"    TEXT,
    "lastSyncError"     TEXT,
    "lastSyncCount"     INTEGER NOT NULL DEFAULT 0,
    "syncInProgress"    BOOLEAN NOT NULL DEFAULT false,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FavurIntegration_pkey" PRIMARY KEY ("id")
);

-- 4) FavurUserMap: bridge between Favur employee ids and our User accounts.
CREATE TABLE "FavurUserMap" (
    "id"               TEXT NOT NULL,
    "favurUserId"      TEXT NOT NULL,
    "favurDisplayName" TEXT,
    "userId"           TEXT,
    "lastSeenAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FavurUserMap_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FavurUserMap_favurUserId_key" ON "FavurUserMap"("favurUserId");
CREATE INDEX "FavurUserMap_userId_idx" ON "FavurUserMap"("userId");

ALTER TABLE "FavurUserMap"
  ADD CONSTRAINT "FavurUserMap_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
