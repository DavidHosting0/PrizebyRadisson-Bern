-- AlterTable
ALTER TABLE "User" ADD COLUMN "preferredLocale" TEXT NOT NULL DEFAULT 'de';

-- AlterTable
ALTER TABLE "TeamChatMessage" ADD COLUMN "sourceLocale" TEXT;

-- CreateTable
CREATE TABLE "TeamChatMessageTranslation" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamChatMessageTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeamChatMessageTranslation_messageId_idx" ON "TeamChatMessageTranslation"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamChatMessageTranslation_messageId_locale_key" ON "TeamChatMessageTranslation"("messageId", "locale");

-- AddForeignKey
ALTER TABLE "TeamChatMessageTranslation" ADD CONSTRAINT "TeamChatMessageTranslation_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "TeamChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
