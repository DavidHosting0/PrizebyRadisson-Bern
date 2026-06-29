-- AlterEnum
ALTER TYPE "PermissionCode" ADD VALUE 'SHIFT_HANDOVER_READ';
ALTER TYPE "PermissionCode" ADD VALUE 'SHIFT_HANDOVER_WRITE';

-- CreateEnum
CREATE TYPE "ReceptionHandoverShift" AS ENUM ('NIGHT', 'MORNING', 'LATE');

-- CreateTable
CREATE TABLE "ShiftHandoverTemplateTask" (
    "id" TEXT NOT NULL,
    "shift" "ReceptionHandoverShift" NOT NULL,
    "label" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ShiftHandoverTemplateTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftHandoverState" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "activeShift" "ReceptionHandoverShift" NOT NULL DEFAULT 'NIGHT',
    "completions" JSONB NOT NULL DEFAULT '{}',
    "lastHandoverAt" TIMESTAMP(3),
    "lastHandoverByUserId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftHandoverState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftHandoverLog" (
    "id" TEXT NOT NULL,
    "fromShift" "ReceptionHandoverShift" NOT NULL,
    "toShift" "ReceptionHandoverShift" NOT NULL,
    "handedOverByUserId" TEXT NOT NULL,
    "incompleteCount" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShiftHandoverLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShiftHandoverTemplateTask_shift_sortOrder_idx" ON "ShiftHandoverTemplateTask"("shift", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftHandoverTemplateTask_shift_code_key" ON "ShiftHandoverTemplateTask"("shift", "code");

-- CreateIndex
CREATE INDEX "ShiftHandoverLog_createdAt_idx" ON "ShiftHandoverLog"("createdAt");
