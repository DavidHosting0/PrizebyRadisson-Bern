-- Favur was replaced by Mirus NEO; existing installs may still have the old base URL.
UPDATE "FavurIntegration"
SET "baseUrl" = 'https://neo.mirus.ch'
WHERE "baseUrl" ILIKE '%favur%';
