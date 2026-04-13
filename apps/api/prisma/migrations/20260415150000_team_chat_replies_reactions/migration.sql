-- CreateEnum
CREATE TYPE "TeamChatReactionType" AS ENUM (
  'THUMBS_UP',
  'CHECK_MARK',
  'HEART',
  'EYES',
  'EXCLAMATION_QUESTION'
);

-- AlterTable
ALTER TABLE "TeamChatMessage" ADD COLUMN "replyToId" TEXT;

-- CreateIndex
CREATE INDEX "TeamChatMessage_replyToId_idx" ON "TeamChatMessage"("replyToId");

-- AddForeignKey
ALTER TABLE "TeamChatMessage" ADD CONSTRAINT "TeamChatMessage_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "TeamChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "TeamChatMessageReaction" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "TeamChatReactionType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamChatMessageReaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TeamChatMessageReaction_messageId_userId_type_key" ON "TeamChatMessageReaction"("messageId", "userId", "type");

-- CreateIndex
CREATE INDEX "TeamChatMessageReaction_messageId_idx" ON "TeamChatMessageReaction"("messageId");

-- AddForeignKey
ALTER TABLE "TeamChatMessageReaction" ADD CONSTRAINT "TeamChatMessageReaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "TeamChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamChatMessageReaction" ADD CONSTRAINT "TeamChatMessageReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
