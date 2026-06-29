-- CreateEnum
CREATE TYPE "RoomGuestStaySource" AS ENUM ('CHECK_INS_DONE', 'IN_HOUSE', 'BACKFILL');

-- CreateTable
CREATE TABLE "RoomGuestStay" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "roomNumber" TEXT NOT NULL,
    "roomId" TEXT,
    "arrivalDate" DATE NOT NULL,
    "departureDate" DATE NOT NULL,
    "checkInAt" TIMESTAMP(3),
    "checkOutAt" TIMESTAMP(3),
    "checkedOut" BOOLEAN NOT NULL DEFAULT false,
    "mainGuestNameEnc" TEXT NOT NULL,
    "stayover" BOOLEAN NOT NULL DEFAULT false,
    "expectedDepartureTime" TEXT,
    "source" "RoomGuestStaySource" NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomGuestStay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoomGuestStay_roomNumber_departureDate_idx" ON "RoomGuestStay"("roomNumber", "departureDate");

-- CreateIndex
CREATE INDEX "RoomGuestStay_hotelId_reservationId_idx" ON "RoomGuestStay"("hotelId", "reservationId");

-- CreateIndex
CREATE INDEX "RoomGuestStay_departureDate_idx" ON "RoomGuestStay"("departureDate");

-- CreateIndex
CREATE INDEX "RoomGuestStay_hotelId_reservationId_checkedOut_idx" ON "RoomGuestStay"("hotelId", "reservationId", "checkedOut");

-- AddForeignKey
ALTER TABLE "RoomGuestStay" ADD CONSTRAINT "RoomGuestStay_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
