-- Soft-delete for team chat messages (reception moderation)
ALTER TABLE "TeamChatMessage" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "TeamChatMessage" ADD COLUMN "deletedByUserId" TEXT;

CREATE INDEX "TeamChatMessage_deletedAt_idx" ON "TeamChatMessage"("deletedAt");

ALTER TABLE "TeamChatMessage"
  ADD CONSTRAINT "TeamChatMessage_deletedByUserId_fkey"
  FOREIGN KEY ("deletedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Reactions: migrate enum `type` → free-form `emoji` string
ALTER TABLE "TeamChatMessageReaction" ADD COLUMN "emoji" VARCHAR(32);

UPDATE "TeamChatMessageReaction"
SET "emoji" = CASE "type"::text
  WHEN 'THUMBS_UP' THEN '👍'
  WHEN 'CHECK_MARK' THEN '✅'
  WHEN 'HEART' THEN '❤️'
  WHEN 'EYES' THEN '👀'
  WHEN 'EXCLAMATION_QUESTION' THEN '⁉️'
  ELSE '👍'
END
WHERE "emoji" IS NULL;

ALTER TABLE "TeamChatMessageReaction" ALTER COLUMN "emoji" SET NOT NULL;

ALTER TABLE "TeamChatMessageReaction" DROP CONSTRAINT IF EXISTS "TeamChatMessageReaction_messageId_userId_type_key";
ALTER TABLE "TeamChatMessageReaction" DROP COLUMN "type";

DROP TYPE IF EXISTS "TeamChatReactionType";

CREATE UNIQUE INDEX "TeamChatMessageReaction_messageId_userId_emoji_key"
  ON "TeamChatMessageReaction"("messageId", "userId", "emoji");

-- Reception can delete chat messages
ALTER TYPE "PermissionCode" ADD VALUE 'TEAM_CHAT_DELETE';
