-- ReservationSnapshot: remember the last completed arrival-check per reservation
ALTER TABLE "ReservationSnapshot"
  ADD COLUMN     "arrivalCheckCompletedAt"   TIMESTAMP(3),
  ADD COLUMN     "arrivalCheckLastRunId"     TEXT,
  ADD COLUMN     "arrivalCheckLastRunItemId" TEXT;

CREATE INDEX "ReservationSnapshot_hotelId_arrivalCheckCompletedAt_idx"
  ON "ReservationSnapshot" ("hotelId", "arrivalCheckCompletedAt");

-- ArrivalCheckRunItem: surface "already done in earlier run" right on the item row
ALTER TABLE "ArrivalCheckRunItem"
  ADD COLUMN     "alreadyCompletedAt"    TIMESTAMP(3),
  ADD COLUMN     "alreadyCompletedRunId" TEXT;
