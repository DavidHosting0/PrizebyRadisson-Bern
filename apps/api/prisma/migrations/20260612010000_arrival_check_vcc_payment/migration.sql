-- AlterTable
ALTER TABLE "ArrivalCheckRunItem"
    ADD COLUMN "paymentStatus" TEXT,
    ADD COLUMN "paymentAmount" TEXT,
    ADD COLUMN "paymentInvoice" TEXT,
    ADD COLUMN "paymentError" TEXT;
