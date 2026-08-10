-- Normalize legacy CREATED service requests so housekeepers can claim them.
UPDATE "ServiceRequest"
SET "status" = 'OPEN'
WHERE "status" = 'CREATED';

ALTER TABLE "ServiceRequest" ALTER COLUMN "status" SET DEFAULT 'OPEN';
