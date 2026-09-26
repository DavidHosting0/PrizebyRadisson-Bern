CREATE TABLE "RoomSuggestionLock" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "roomNumber" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "floor" INTEGER,
    "category" TEXT,
    "bookedCategory" TEXT,
    "readyNow" BOOLEAN NOT NULL DEFAULT false,
    "reasons" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomSuggestionLock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RoomSuggestionLock_hotelId_reservationId_key" ON "RoomSuggestionLock"("hotelId", "reservationId");
CREATE INDEX "RoomSuggestionLock_hotelId_roomNumber_idx" ON "RoomSuggestionLock"("hotelId", "roomNumber");
