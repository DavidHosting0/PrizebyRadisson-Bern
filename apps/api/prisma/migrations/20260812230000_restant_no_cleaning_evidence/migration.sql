-- CreateEnum
CREATE TYPE "DailyCleaningCompletionReason" AS ENUM ('CLEANED', 'NO_CLEANING_REQUESTED');

-- AlterTable
ALTER TABLE "DailyCleaningTask" ADD COLUMN "completionReason" "DailyCleaningCompletionReason",
ADD COLUMN "evidenceS3Key" TEXT;
