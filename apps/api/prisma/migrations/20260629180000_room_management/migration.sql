-- AlterEnum
ALTER TYPE "PermissionCode" ADD VALUE 'ROOM_MANAGEMENT_READ';

-- CreateEnum
CREATE TYPE "RoomHousekeepingEventKind" AS ENUM ('MARKED_CLEAN', 'CHECKLIST_REOPENED');

-- CreateTable
CREATE TABLE "RoomHousekeepingEvent" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "RoomHousekeepingEventKind" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomHousekeepingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoomHousekeepingEvent_roomId_occurredAt_idx" ON "RoomHousekeepingEvent"("roomId", "occurredAt");

-- CreateIndex
CREATE INDEX "ReservationSnapshot_roomId_departureDate_idx" ON "ReservationSnapshot"("roomId", "departureDate");

-- AddForeignKey
ALTER TABLE "RoomHousekeepingEvent" ADD CONSTRAINT "RoomHousekeepingEvent_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomHousekeepingEvent" ADD CONSTRAINT "RoomHousekeepingEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
