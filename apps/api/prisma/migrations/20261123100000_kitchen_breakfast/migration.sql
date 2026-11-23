-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'KITCHEN';
ALTER TYPE "UserTitlePrefix" ADD VALUE 'KITCHEN';

-- AlterEnum PermissionCode
ALTER TYPE "PermissionCode" ADD VALUE 'BREAKFAST_READ';
ALTER TYPE "PermissionCode" ADD VALUE 'BREAKFAST_WRITE';
ALTER TYPE "PermissionCode" ADD VALUE 'BREAKFAST_WISHES_READ';
ALTER TYPE "PermissionCode" ADD VALUE 'BREAKFAST_WISHES_WRITE';

-- CreateEnum
CREATE TYPE "BreakfastEntrySource" AS ENUM ('MANUAL', 'EMMA');
CREATE TYPE "BreakfastWishStatus" AS ENUM ('OPEN', 'DONE', 'CANCELLED');

-- CreateTable
CREATE TABLE "BreakfastDayEntry" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "serviceDate" DATE NOT NULL,
    "roomId" TEXT NOT NULL,
    "reservationId" TEXT,
    "persons" INTEGER NOT NULL,
    "source" "BreakfastEntrySource" NOT NULL DEFAULT 'MANUAL',
    "servedAt" TIMESTAMP(3),
    "servedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BreakfastDayEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BreakfastSpecialWish" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "serviceDate" DATE NOT NULL,
    "tags" TEXT[],
    "note" TEXT,
    "status" "BreakfastWishStatus" NOT NULL DEFAULT 'OPEN',
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BreakfastSpecialWish_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BreakfastDayEntry_hotelId_serviceDate_idx" ON "BreakfastDayEntry"("hotelId", "serviceDate");
CREATE INDEX "BreakfastDayEntry_roomId_idx" ON "BreakfastDayEntry"("roomId");
CREATE INDEX "BreakfastDayEntry_servedAt_idx" ON "BreakfastDayEntry"("servedAt");
CREATE UNIQUE INDEX "BreakfastDayEntry_hotelId_serviceDate_roomId_key" ON "BreakfastDayEntry"("hotelId", "serviceDate", "roomId");

CREATE INDEX "BreakfastSpecialWish_hotelId_serviceDate_status_idx" ON "BreakfastSpecialWish"("hotelId", "serviceDate", "status");
CREATE INDEX "BreakfastSpecialWish_roomId_idx" ON "BreakfastSpecialWish"("roomId");
CREATE INDEX "BreakfastSpecialWish_createdAt_idx" ON "BreakfastSpecialWish"("createdAt");

-- AddForeignKey
ALTER TABLE "BreakfastDayEntry" ADD CONSTRAINT "BreakfastDayEntry_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BreakfastDayEntry" ADD CONSTRAINT "BreakfastDayEntry_servedByUserId_fkey" FOREIGN KEY ("servedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BreakfastSpecialWish" ADD CONSTRAINT "BreakfastSpecialWish_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BreakfastSpecialWish" ADD CONSTRAINT "BreakfastSpecialWish_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
