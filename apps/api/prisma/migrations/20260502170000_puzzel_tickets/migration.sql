-- CreateTable
CREATE TABLE "PuzzelTicket" (
    "id" TEXT NOT NULL,
    "externalKey" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "reference" TEXT,
    "status" TEXT,
    "detailHref" TEXT,
    "rowSummary" TEXT NOT NULL,
    "metadata" JSONB,
    "scrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PuzzelTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PuzzelTicket_externalKey_key" ON "PuzzelTicket"("externalKey");

-- CreateIndex
CREATE INDEX "PuzzelTicket_scrapedAt_idx" ON "PuzzelTicket"("scrapedAt");
