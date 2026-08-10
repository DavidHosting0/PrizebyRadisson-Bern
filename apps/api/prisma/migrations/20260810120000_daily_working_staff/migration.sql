-- CreateTable
CREATE TABLE "DailyWorkingStaff" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyWorkingStaff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyWorkingStaff_date_userId_key" ON "DailyWorkingStaff"("date", "userId");

-- CreateIndex
CREATE INDEX "DailyWorkingStaff_date_idx" ON "DailyWorkingStaff"("date");

-- CreateIndex
CREATE INDEX "DailyWorkingStaff_userId_idx" ON "DailyWorkingStaff"("userId");

-- AddForeignKey
ALTER TABLE "DailyWorkingStaff" ADD CONSTRAINT "DailyWorkingStaff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
