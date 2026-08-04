-- CreateEnum
CREATE TYPE "DailyCleaningPlanStatus" AS ENUM ('DRAFT', 'SAVED');

-- CreateEnum
CREATE TYPE "DailyCleaningTaskKind" AS ENUM ('ROOM', 'PUBLIC_AREA');

-- CreateEnum
CREATE TYPE "DailyCleaningWorkType" AS ENUM ('DIRTY', 'RESTANT', 'PUBLIC');

-- CreateEnum
CREATE TYPE "DailyCleaningTaskSource" AS ENUM ('AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "PublicAreaKind" AS ENUM ('corridor', 'glass', 'elevator', 'staff', 'custom');

-- AlterEnum
ALTER TYPE "PermissionCode" ADD VALUE 'PUBLIC_AREA_MANAGE';

-- CreateTable
CREATE TABLE "DailyCleaningPlan" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "DailyCleaningPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "savedAt" TIMESTAMP(3),
    "savedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyCleaningPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyCleaningTask" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "kind" "DailyCleaningTaskKind" NOT NULL,
    "workType" "DailyCleaningWorkType" NOT NULL,
    "roomId" TEXT,
    "publicAreaId" TEXT,
    "assigneeUserId" TEXT,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "source" "DailyCleaningTaskSource" NOT NULL DEFAULT 'AUTO',
    "overdueDays" INTEGER,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyCleaningTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicArea" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "floor" INTEGER,
    "kind" "PublicAreaKind" NOT NULL,
    "frequencyDays" INTEGER NOT NULL DEFAULT 1,
    "lastCompletedOn" DATE,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomCleaningDeferral" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "firstDeferredOn" DATE NOT NULL,
    "deferredUntil" DATE NOT NULL,
    "clearedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomCleaningDeferral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyLateShiftOverride" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "userId" TEXT NOT NULL,
    "isLateShift" BOOLEAN NOT NULL,
    "planId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyLateShiftOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyCleaningPlan_date_key" ON "DailyCleaningPlan"("date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyCleaningTask_planId_roomId_key" ON "DailyCleaningTask"("planId", "roomId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyCleaningTask_planId_publicAreaId_key" ON "DailyCleaningTask"("planId", "publicAreaId");

-- CreateIndex
CREATE INDEX "DailyCleaningTask_planId_idx" ON "DailyCleaningTask"("planId");

-- CreateIndex
CREATE INDEX "DailyCleaningTask_assigneeUserId_idx" ON "DailyCleaningTask"("assigneeUserId");

-- CreateIndex
CREATE UNIQUE INDEX "PublicArea_key_key" ON "PublicArea"("key");

-- CreateIndex
CREATE INDEX "PublicArea_isActive_floor_idx" ON "PublicArea"("isActive", "floor");

-- CreateIndex
CREATE INDEX "RoomCleaningDeferral_roomId_clearedAt_idx" ON "RoomCleaningDeferral"("roomId", "clearedAt");

-- CreateIndex
CREATE INDEX "RoomCleaningDeferral_deferredUntil_clearedAt_idx" ON "RoomCleaningDeferral"("deferredUntil", "clearedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DailyLateShiftOverride_date_userId_key" ON "DailyLateShiftOverride"("date", "userId");

-- CreateIndex
CREATE INDEX "DailyLateShiftOverride_date_idx" ON "DailyLateShiftOverride"("date");

-- AddForeignKey
ALTER TABLE "DailyCleaningPlan" ADD CONSTRAINT "DailyCleaningPlan_savedByUserId_fkey" FOREIGN KEY ("savedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyCleaningTask" ADD CONSTRAINT "DailyCleaningTask_planId_fkey" FOREIGN KEY ("planId") REFERENCES "DailyCleaningPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyCleaningTask" ADD CONSTRAINT "DailyCleaningTask_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyCleaningTask" ADD CONSTRAINT "DailyCleaningTask_publicAreaId_fkey" FOREIGN KEY ("publicAreaId") REFERENCES "PublicArea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyCleaningTask" ADD CONSTRAINT "DailyCleaningTask_assigneeUserId_fkey" FOREIGN KEY ("assigneeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomCleaningDeferral" ADD CONSTRAINT "RoomCleaningDeferral_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyLateShiftOverride" ADD CONSTRAINT "DailyLateShiftOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyLateShiftOverride" ADD CONSTRAINT "DailyLateShiftOverride_planId_fkey" FOREIGN KEY ("planId") REFERENCES "DailyCleaningPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
