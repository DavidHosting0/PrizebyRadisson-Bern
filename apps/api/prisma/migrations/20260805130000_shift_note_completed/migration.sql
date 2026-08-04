-- Allow marking shift-handover notes as done
ALTER TABLE "ShiftNote" ADD COLUMN "completedAt" TIMESTAMP(3);
ALTER TABLE "ShiftNote" ADD COLUMN "completedByUserId" TEXT;

CREATE INDEX "ShiftNote_completedAt_idx" ON "ShiftNote"("completedAt");

ALTER TABLE "ShiftNote"
  ADD CONSTRAINT "ShiftNote_completedByUserId_fkey"
  FOREIGN KEY ("completedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
