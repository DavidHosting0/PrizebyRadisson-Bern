-- Operating calendar day for reception shift checklist
ALTER TABLE "ShiftHandoverState" ADD COLUMN "activeDate" DATE NOT NULL DEFAULT CURRENT_DATE;
