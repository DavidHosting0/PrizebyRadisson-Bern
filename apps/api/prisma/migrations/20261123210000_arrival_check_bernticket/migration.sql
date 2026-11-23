-- CreateEnum
CREATE TYPE "ArrivalCheckBernTicketStatus" AS ENUM ('NONE', 'PENDING', 'CREATED', 'FAILED');

-- AlterTable
ALTER TABLE "ArrivalCheckRunItem" ADD COLUMN "bernTicketStatus" "ArrivalCheckBernTicketStatus",
ADD COLUMN "bernTicketError" TEXT,
ADD COLUMN "bernTicketId" TEXT;
