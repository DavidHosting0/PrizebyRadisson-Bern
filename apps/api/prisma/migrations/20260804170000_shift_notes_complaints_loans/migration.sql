-- AlterEnum PermissionCode
ALTER TYPE "PermissionCode" ADD VALUE 'SHIFT_NOTES_READ';
ALTER TYPE "PermissionCode" ADD VALUE 'SHIFT_NOTES_WRITE';
ALTER TYPE "PermissionCode" ADD VALUE 'COMPLAINTS_READ';
ALTER TYPE "PermissionCode" ADD VALUE 'COMPLAINTS_WRITE';
ALTER TYPE "PermissionCode" ADD VALUE 'LOANS_READ';
ALTER TYPE "PermissionCode" ADD VALUE 'LOANS_WRITE';
ALTER TYPE "PermissionCode" ADD VALUE 'LOANS_CATALOG_WRITE';

-- CreateEnum
CREATE TYPE "GuestComplaintCategory" AS ENUM ('ROOM', 'OTHER');
CREATE TYPE "GuestComplaintStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateTable
CREATE TABLE "ShiftNote" (
    "id" TEXT NOT NULL,
    "forDate" DATE NOT NULL,
    "shifts" "ReceptionHandoverShift"[],
    "body" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftNote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GuestComplaint" (
    "id" TEXT NOT NULL,
    "category" "GuestComplaintCategory" NOT NULL,
    "roomId" TEXT,
    "description" TEXT NOT NULL,
    "status" "GuestComplaintStatus" NOT NULL DEFAULT 'OPEN',
    "createdByUserId" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuestComplaint_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LoanItemCatalogEntry" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "depositCents" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoanItemCatalogEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RoomLoan" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "depositCents" INTEGER NOT NULL,
    "loanedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "loanedByUserId" TEXT NOT NULL,
    "returnedAt" TIMESTAMP(3),
    "returnedByUserId" TEXT,

    CONSTRAINT "RoomLoan_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ShiftNote_forDate_idx" ON "ShiftNote"("forDate");
CREATE INDEX "ShiftNote_createdAt_idx" ON "ShiftNote"("createdAt");
CREATE INDEX "GuestComplaint_roomId_idx" ON "GuestComplaint"("roomId");
CREATE INDEX "GuestComplaint_createdAt_idx" ON "GuestComplaint"("createdAt");
CREATE INDEX "GuestComplaint_category_idx" ON "GuestComplaint"("category");
CREATE INDEX "GuestComplaint_status_idx" ON "GuestComplaint"("status");
CREATE INDEX "LoanItemCatalogEntry_active_sortOrder_idx" ON "LoanItemCatalogEntry"("active", "sortOrder");
CREATE INDEX "RoomLoan_returnedAt_idx" ON "RoomLoan"("returnedAt");
CREATE INDEX "RoomLoan_roomId_idx" ON "RoomLoan"("roomId");
CREATE INDEX "RoomLoan_catalogItemId_idx" ON "RoomLoan"("catalogItemId");

ALTER TABLE "ShiftNote" ADD CONSTRAINT "ShiftNote_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GuestComplaint" ADD CONSTRAINT "GuestComplaint_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GuestComplaint" ADD CONSTRAINT "GuestComplaint_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GuestComplaint" ADD CONSTRAINT "GuestComplaint_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RoomLoan" ADD CONSTRAINT "RoomLoan_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoomLoan" ADD CONSTRAINT "RoomLoan_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "LoanItemCatalogEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RoomLoan" ADD CONSTRAINT "RoomLoan_loanedByUserId_fkey" FOREIGN KEY ("loanedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RoomLoan" ADD CONSTRAINT "RoomLoan_returnedByUserId_fkey" FOREIGN KEY ("returnedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
