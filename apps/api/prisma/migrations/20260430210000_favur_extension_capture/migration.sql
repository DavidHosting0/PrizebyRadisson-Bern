-- Pivot from email/password Favur sync to extension-based capture import.

-- 1) Drop old auth fields (they were never used in production).
ALTER TABLE "FavurIntegration" DROP COLUMN IF EXISTS "email";
ALTER TABLE "FavurIntegration" DROP COLUMN IF EXISTS "encryptedPassword";
ALTER TABLE "FavurIntegration" DROP COLUMN IF EXISTS "encryptedSession";
ALTER TABLE "FavurIntegration" DROP COLUMN IF EXISTS "sessionExpiresAt";

-- 2) Add capture-template fields and the API key for the browser extension.
ALTER TABLE "FavurIntegration" ADD COLUMN     "apiKey"           TEXT;
ALTER TABLE "FavurIntegration" ADD COLUMN     "activeCaptureId"  TEXT;
ALTER TABLE "FavurIntegration" ADD COLUMN     "activeUrl"        TEXT;
ALTER TABLE "FavurIntegration" ADD COLUMN     "activeMethod"     TEXT;
ALTER TABLE "FavurIntegration" ADD COLUMN     "activeHeaders"    TEXT;
ALTER TABLE "FavurIntegration" ADD COLUMN     "activeCookies"    TEXT;
ALTER TABLE "FavurIntegration" ADD COLUMN     "activeBody"       TEXT;
ALTER TABLE "FavurIntegration" ADD COLUMN     "activeCapturedAt" TIMESTAMP(3);
ALTER TABLE "FavurIntegration" ADD COLUMN     "shiftsJsonPath"   TEXT NOT NULL DEFAULT '';
ALTER TABLE "FavurIntegration" ADD COLUMN     "fieldShiftId"     TEXT NOT NULL DEFAULT 'id';
ALTER TABLE "FavurIntegration" ADD COLUMN     "fieldUserId"      TEXT NOT NULL DEFAULT 'user.id';
ALTER TABLE "FavurIntegration" ADD COLUMN     "fieldUserName"    TEXT NOT NULL DEFAULT 'user.fullName';
ALTER TABLE "FavurIntegration" ADD COLUMN     "fieldStartsAt"    TEXT NOT NULL DEFAULT 'startsAt';
ALTER TABLE "FavurIntegration" ADD COLUMN     "fieldEndsAt"      TEXT NOT NULL DEFAULT 'endsAt';
ALTER TABLE "FavurIntegration" ADD COLUMN     "fieldLabel"       TEXT;

CREATE UNIQUE INDEX "FavurIntegration_apiKey_key" ON "FavurIntegration"("apiKey");

-- 3) Capture history: every request the extension forwards.
CREATE TABLE "FavurCapture" (
    "id"              TEXT NOT NULL,
    "url"             TEXT NOT NULL,
    "method"          TEXT NOT NULL DEFAULT 'GET',
    "headers"         TEXT NOT NULL,
    "cookies"         TEXT NOT NULL,
    "body"            TEXT,
    "responseStatus"  INTEGER NOT NULL,
    "responseSample"  TEXT NOT NULL,
    "responseShape"   TEXT,
    "capturedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "capturedFrom"    TEXT,
    CONSTRAINT "FavurCapture_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FavurCapture_capturedAt_idx" ON "FavurCapture"("capturedAt");
