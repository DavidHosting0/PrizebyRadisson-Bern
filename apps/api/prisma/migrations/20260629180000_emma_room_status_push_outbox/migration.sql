-- CreateTable
CREATE TABLE "EmmaRoomStatusPushOutbox" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "targetCode" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "actionAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextRetryAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "EmmaRoomStatusPushOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmmaRoomStatusPushOutbox_resolvedAt_nextRetryAt_idx" ON "EmmaRoomStatusPushOutbox"("resolvedAt", "nextRetryAt");

-- CreateIndex
CREATE INDEX "EmmaRoomStatusPushOutbox_roomId_idx" ON "EmmaRoomStatusPushOutbox"("roomId");

-- AddForeignKey
ALTER TABLE "EmmaRoomStatusPushOutbox" ADD CONSTRAINT "EmmaRoomStatusPushOutbox_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
