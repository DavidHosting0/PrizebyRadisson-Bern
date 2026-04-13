-- CreateEnum
CREATE TYPE "UserTitlePrefix" AS ENUM (
  'CLEANER',
  'HOUSEKEEPING_SUPERVISOR',
  'RECEPTION',
  'HTC_IN_TRAINING',
  'HTC',
  'ADMIN'
);

-- AlterTable
ALTER TABLE "User" ADD COLUMN "titlePrefix" "UserTitlePrefix" NOT NULL DEFAULT 'CLEANER';

UPDATE "User" SET "titlePrefix" = CASE
  WHEN "role" = 'HOUSEKEEPER' THEN 'CLEANER'::"UserTitlePrefix"
  WHEN "role" = 'SUPERVISOR' THEN 'HOUSEKEEPING_SUPERVISOR'::"UserTitlePrefix"
  WHEN "role" = 'RECEPTION' THEN 'RECEPTION'::"UserTitlePrefix"
  WHEN "role" = 'ADMIN' THEN 'ADMIN'::"UserTitlePrefix"
  ELSE 'CLEANER'::"UserTitlePrefix"
END;
