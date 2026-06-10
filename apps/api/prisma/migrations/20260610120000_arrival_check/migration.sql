-- CreateEnum
CREATE TYPE "ArrivalCheckRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ArrivalCheckItemStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ArrivalCheckStep" AS ENUM ('FOLIO_LOAD', 'CHARGE_ASSIGN', 'PREPAID_SETTLE');

-- CreateTable
CREATE TABLE "ArrivalCheckRun" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "status" "ArrivalCheckRunStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ArrivalCheckRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArrivalCheckRunItem" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "status" "ArrivalCheckItemStatus" NOT NULL DEFAULT 'PENDING',
    "currentStep" "ArrivalCheckStep",
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ArrivalCheckRunItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ArrivalCheckRun_startedAt_idx" ON "ArrivalCheckRun"("startedAt");

-- CreateIndex
CREATE INDEX "ArrivalCheckRun_createdByUserId_idx" ON "ArrivalCheckRun"("createdByUserId");

-- CreateIndex
CREATE INDEX "ArrivalCheckRunItem_runId_idx" ON "ArrivalCheckRunItem"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "ArrivalCheckRunItem_runId_reservationId_key" ON "ArrivalCheckRunItem"("runId", "reservationId");

-- AddForeignKey
ALTER TABLE "ArrivalCheckRun" ADD CONSTRAINT "ArrivalCheckRun_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArrivalCheckRunItem" ADD CONSTRAINT "ArrivalCheckRunItem_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ArrivalCheckRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
