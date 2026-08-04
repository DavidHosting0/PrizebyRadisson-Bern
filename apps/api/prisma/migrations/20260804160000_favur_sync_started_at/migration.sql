-- Track when a sync claimed the lock so stale "Synchronisiert…" states can be cleared.
ALTER TABLE "FavurIntegration" ADD COLUMN "syncStartedAt" TIMESTAMP(3);
