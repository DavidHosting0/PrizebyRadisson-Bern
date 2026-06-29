-- CreateIndex
CREATE INDEX "ReservationSnapshot_hotelId_departureDate_checkIn_idx" ON "ReservationSnapshot"("hotelId", "departureDate", "checkIn");
