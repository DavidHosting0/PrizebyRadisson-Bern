-- EMMA Check-In list membership (Arrivals / Queue / Check-Ins Done) for hotel business date.
ALTER TABLE "ReservationSnapshot" ADD COLUMN "inCheckInDone" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ReservationSnapshot" ADD COLUMN "checkInBusinessDate" DATE;

CREATE INDEX "ReservationSnapshot_hotelId_inTodayArrivals_idx" ON "ReservationSnapshot"("hotelId", "inTodayArrivals");
CREATE INDEX "ReservationSnapshot_hotelId_checkInQueue_checkIn_idx" ON "ReservationSnapshot"("hotelId", "checkInQueue", "checkIn");
CREATE INDEX "ReservationSnapshot_hotelId_inCheckInDone_idx" ON "ReservationSnapshot"("hotelId", "inCheckInDone");
