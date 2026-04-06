-- CreateTable
CREATE TABLE "FloorPlan" (
    "id" TEXT NOT NULL,
    "floor" INTEGER NOT NULL,
    "layout" JSONB NOT NULL DEFAULT '[]',
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FloorPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FloorPlan_floor_key" ON "FloorPlan"("floor");

-- AddForeignKey
ALTER TABLE "FloorPlan" ADD CONSTRAINT "FloorPlan_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
