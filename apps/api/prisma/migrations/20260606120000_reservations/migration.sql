-- AlterEnum
ALTER TYPE "PermissionCode" ADD VALUE 'RESERVATIONS_READ';
ALTER TYPE "PermissionCode" ADD VALUE 'RESERVATIONS_SYNC';

-- CreateTable
CREATE TABLE "ReservationSnapshot" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "arrivalDate" DATE NOT NULL,
    "departureDate" DATE NOT NULL,
    "roomId" TEXT,
    "checkIn" BOOLEAN NOT NULL DEFAULT false,
    "checkOut" BOOLEAN NOT NULL DEFAULT false,
    "checkInQueue" BOOLEAN NOT NULL DEFAULT false,
    "nightsStay" INTEGER,
    "roomType" TEXT,
    "mealPlan" TEXT,
    "tier" TEXT,
    "numPax" INTEGER,
    "sensitiveEnc" TEXT NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReservationSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservationSyncRun" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "tab" TEXT,
    "rowCount" INTEGER,
    "error" TEXT,
    "overview" JSONB,

    CONSTRAINT "ReservationSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReservationSnapshot_hotelId_reservationId_key" ON "ReservationSnapshot"("hotelId", "reservationId");

-- CreateIndex
CREATE INDEX "ReservationSnapshot_hotelId_arrivalDate_checkIn_checkInQueue_idx" ON "ReservationSnapshot"("hotelId", "arrivalDate", "checkIn", "checkInQueue");

-- CreateIndex
CREATE INDEX "ReservationSnapshot_hotelId_checkIn_checkOut_idx" ON "ReservationSnapshot"("hotelId", "checkIn", "checkOut");

-- CreateIndex
CREATE INDEX "ReservationSnapshot_hotelId_reservationId_idx" ON "ReservationSnapshot"("hotelId", "reservationId");

-- CreateIndex
CREATE INDEX "ReservationSyncRun_startedAt_idx" ON "ReservationSyncRun"("startedAt");
