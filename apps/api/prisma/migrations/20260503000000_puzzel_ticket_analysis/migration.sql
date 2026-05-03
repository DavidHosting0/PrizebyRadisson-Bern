-- CreateTable
CREATE TABLE "PuzzelTicketAnalysis" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "messagesFingerprint" TEXT NOT NULL,
    "requestType" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "bookingDetails" JSONB NOT NULL,
    "details" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PuzzelTicketAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PuzzelTicketAnalysis_ticketId_key" ON "PuzzelTicketAnalysis"("ticketId");

-- CreateIndex
CREATE INDEX "PuzzelTicketAnalysis_ticketId_idx" ON "PuzzelTicketAnalysis"("ticketId");

-- AddForeignKey
ALTER TABLE "PuzzelTicketAnalysis" ADD CONSTRAINT "PuzzelTicketAnalysis_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "PuzzelTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
