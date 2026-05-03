-- Branded property name in UI (reception header); align default with Prize by Radisson Bern.
ALTER TABLE "HotelSettings" ALTER COLUMN "name" SET DEFAULT 'Prize by Radisson Bern';

UPDATE "HotelSettings" SET name = 'Prize by Radisson Bern' WHERE name IN ('Demo Hotel', 'Hotel');
