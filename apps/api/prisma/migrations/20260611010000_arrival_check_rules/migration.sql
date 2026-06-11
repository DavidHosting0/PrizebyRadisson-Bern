-- AlterEnum
ALTER TYPE "ArrivalCheckItemStatus" ADD VALUE 'NEEDS_MANUAL';

-- AlterTable
ALTER TABLE "ArrivalCheckRunItem"
    ADD COLUMN "source" TEXT,
    ADD COLUMN "scenario" TEXT,
    ADD COLUMN "categoryLabel" TEXT,
    ADD COLUMN "statusMessage" TEXT,
    ADD COLUMN "manualReason" TEXT,
    ADD COLUMN "movesPlanned" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "movesDone" INTEGER NOT NULL DEFAULT 0;
