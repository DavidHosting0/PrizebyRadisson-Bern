-- ArrivalCheckRunItem: Folio-2 amount snapshot + EMMA deposit id (VCC without invoice)
ALTER TABLE "ArrivalCheckRunItem" ADD COLUMN "paymentDepositId" TEXT;
ALTER TABLE "ArrivalCheckRunItem" ADD COLUMN "folio2Amount" TEXT;
ALTER TABLE "ArrivalCheckRunItem" ADD COLUMN "folio2Currency" TEXT;
