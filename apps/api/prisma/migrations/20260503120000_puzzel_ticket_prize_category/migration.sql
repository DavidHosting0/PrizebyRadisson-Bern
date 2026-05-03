-- CreateEnum
CREATE TYPE "PuzzelTicketPrizeCategory" AS ENUM (
  'SPAM',
  'RECHNUNG_ANGEFRAGT',
  'RECHNUNGSKORREKTUR',
  'MEHRERE_RECHNUNGSANFRAGEN',
  'SONSTIGES'
);

-- AlterTable
ALTER TABLE "PuzzelTicketAnalysis" ADD COLUMN "prizeCategory" "PuzzelTicketPrizeCategory" NOT NULL DEFAULT 'SONSTIGES';
