-- Mirus NEO server-side login (encrypted credentials + session cookies)
ALTER TABLE "FavurIntegration" ADD COLUMN "mirusUsername" TEXT;
ALTER TABLE "FavurIntegration" ADD COLUMN "mirusPasswordEnc" TEXT;
ALTER TABLE "FavurIntegration" ADD COLUMN "mirusSessionEnc" TEXT;
ALTER TABLE "FavurIntegration" ADD COLUMN "mirusSessionSavedAt" TIMESTAMP(3);
