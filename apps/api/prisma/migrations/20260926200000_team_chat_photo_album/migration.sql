-- Album support: multiple photos per team-chat message
ALTER TABLE "TeamChatMessage" ADD COLUMN IF NOT EXISTS "photoS3Keys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Backfill from legacy single-key column
UPDATE "TeamChatMessage"
SET "photoS3Keys" = ARRAY["photoS3Key"]
WHERE "photoS3Key" IS NOT NULL
  AND "photoS3Key" <> ''
  AND cardinality("photoS3Keys") = 0;
