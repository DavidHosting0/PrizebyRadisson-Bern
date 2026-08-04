-- Shift rows from the old Favur/Mirus sync path use source = mirus going forward.
UPDATE "Shift" SET "source" = 'mirus' WHERE "source" = 'favur';
