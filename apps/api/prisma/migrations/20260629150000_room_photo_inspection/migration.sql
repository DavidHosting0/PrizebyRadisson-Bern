-- AlterTable
ALTER TABLE "RoomPhoto" ADD COLUMN "roomInspectionId" TEXT;

-- CreateIndex
CREATE INDEX "RoomPhoto_roomInspectionId_idx" ON "RoomPhoto"("roomInspectionId");

-- AddForeignKey
ALTER TABLE "RoomPhoto" ADD CONSTRAINT "RoomPhoto_roomInspectionId_fkey" FOREIGN KEY ("roomInspectionId") REFERENCES "RoomInspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
