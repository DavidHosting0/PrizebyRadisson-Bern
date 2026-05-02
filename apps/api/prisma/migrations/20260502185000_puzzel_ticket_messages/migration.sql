-- CreateTable
CREATE TABLE "PuzzelTicketMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "externalKey" TEXT NOT NULL,
    "sentAtText" TEXT,
    "fromText" TEXT,
    "toText" TEXT,
    "direction" TEXT,
    "bodyText" TEXT NOT NULL,
    "bodyHtml" TEXT,
    "metadata" JSONB,
    "scrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PuzzelTicketMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PuzzelTicketMessage_externalKey_key" ON "PuzzelTicketMessage"("externalKey");

-- CreateIndex
CREATE INDEX "PuzzelTicketMessage_ticketId_idx" ON "PuzzelTicketMessage"("ticketId");

-- CreateIndex
CREATE INDEX "PuzzelTicketMessage_scrapedAt_idx" ON "PuzzelTicketMessage"("scrapedAt");

-- AddForeignKey
ALTER TABLE "PuzzelTicketMessage" ADD CONSTRAINT "PuzzelTicketMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "PuzzelTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
