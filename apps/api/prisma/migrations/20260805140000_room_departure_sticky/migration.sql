-- Persist departure-for-today after checkout until inspection
ALTER TABLE "Room" ADD COLUMN "departureStickyOn" DATE;
