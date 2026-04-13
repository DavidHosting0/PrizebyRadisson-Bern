-- AlterEnum (PermissionCode exists after 20260413180000_permissions)
ALTER TYPE "PermissionCode" ADD VALUE 'DAMAGE_REPORT_CREATE';
ALTER TYPE "PermissionCode" ADD VALUE 'DAMAGE_REPORT_READ';
ALTER TYPE "PermissionCode" ADD VALUE 'DAMAGE_REPORT_UPDATE';

-- CreateEnum
CREATE TYPE "RoomDamageType" AS ENUM (
  'FURNITURE',
  'FIXTURES',
  'WALL_OR_CEILING',
  'FLOOR',
  'WINDOW_OR_DOOR',
  'BATHROOM',
  'ELECTRICAL_OR_APPLIANCE',
  'OTHER'
);

-- CreateEnum
CREATE TYPE "RoomDamageReportStatus" AS ENUM (
  'REPORTED',
  'ACKNOWLEDGED',
  'RESOLVED'
);

-- CreateTable
CREATE TABLE "RoomDamageReport" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "reportedByUserId" TEXT NOT NULL,
    "damageType" "RoomDamageType" NOT NULL,
    "description" TEXT NOT NULL,
    "photoS3Key" TEXT NOT NULL,
    "status" "RoomDamageReportStatus" NOT NULL DEFAULT 'REPORTED',
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomDamageReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoomDamageReport_status_idx" ON "RoomDamageReport"("status");

-- CreateIndex
CREATE INDEX "RoomDamageReport_roomId_idx" ON "RoomDamageReport"("roomId");

-- AddForeignKey
ALTER TABLE "RoomDamageReport" ADD CONSTRAINT "RoomDamageReport_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomDamageReport" ADD CONSTRAINT "RoomDamageReport_reportedByUserId_fkey" FOREIGN KEY ("reportedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
