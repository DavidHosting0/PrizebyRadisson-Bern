-- CreateEnum
CREATE TYPE "DailyInspectionTaskStatus" AS ENUM ('PENDING', 'CLAIMED', 'DONE', 'CANCELLED');

-- CreateTable
CREATE TABLE "DailyInspectionDuty" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyInspectionDuty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyInspectionTask" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "roomId" TEXT NOT NULL,
    "status" "DailyInspectionTaskStatus" NOT NULL DEFAULT 'PENDING',
    "claimedByUserId" TEXT,
    "claimedAt" TIMESTAMP(3),
    "completedInspectionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyInspectionTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyInspectionDuty_date_userId_key" ON "DailyInspectionDuty"("date", "userId");

-- CreateIndex
CREATE INDEX "DailyInspectionDuty_date_idx" ON "DailyInspectionDuty"("date");

-- CreateIndex
CREATE INDEX "DailyInspectionDuty_userId_idx" ON "DailyInspectionDuty"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyInspectionTask_date_roomId_key" ON "DailyInspectionTask"("date", "roomId");

-- CreateIndex
CREATE INDEX "DailyInspectionTask_date_status_idx" ON "DailyInspectionTask"("date", "status");

-- CreateIndex
CREATE INDEX "DailyInspectionTask_claimedByUserId_idx" ON "DailyInspectionTask"("claimedByUserId");

-- CreateIndex
CREATE INDEX "DailyInspectionTask_roomId_idx" ON "DailyInspectionTask"("roomId");

-- AddForeignKey
ALTER TABLE "DailyInspectionDuty" ADD CONSTRAINT "DailyInspectionDuty_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyInspectionTask" ADD CONSTRAINT "DailyInspectionTask_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyInspectionTask" ADD CONSTRAINT "DailyInspectionTask_claimedByUserId_fkey" FOREIGN KEY ("claimedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
