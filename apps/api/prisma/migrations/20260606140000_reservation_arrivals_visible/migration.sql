-- AlterTable
ALTER TABLE "ReservationSnapshot" ADD COLUMN "inTodayArrivals" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "ReservationSnapshot_hotelId_arrivalDate_inTodayArrivals_idx" ON "ReservationSnapshot"("hotelId", "arrivalDate", "inTodayArrivals");
