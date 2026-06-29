-- Change default shift-plan source URL from Favur to Mirus NEO for new installs.
ALTER TABLE "FavurIntegration" ALTER COLUMN "baseUrl" SET DEFAULT 'https://neo.mirus.ch';
