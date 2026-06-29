-- AlterEnum
ALTER TYPE "PermissionCode" ADD VALUE 'ACTIVITY_LOG_READ';

-- CreateEnum
CREATE TYPE "ActivityLogCategory" AS ENUM (
  'AUTH',
  'USER',
  'ROOM',
  'CHECKLIST',
  'PHOTO',
  'SERVICE_REQUEST',
  'LOST_FOUND',
  'DAMAGE',
  'ASSIGNMENT',
  'INSPECTION',
  'SETTINGS',
  'ROLE',
  'FLOOR_PLAN',
  'TEAM_CHAT',
  'SHIFT',
  'RESERVATION',
  'EMMA',
  'ARRIVAL_CHECK',
  'GUIDE',
  'SHIFT_HANDOVER',
  'MONITOR_MAP',
  'ROOM_MANAGEMENT',
  'INTEGRATION',
  'NOTIFICATION',
  'SYSTEM',
  'OTHER'
);

-- CreateTable
CREATE TABLE "ActivityLog" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "action" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "category" "ActivityLogCategory" NOT NULL,
  "actorUserId" TEXT,
  "actorEmail" TEXT,
  "actorName" TEXT,
  "method" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "resourceType" TEXT,
  "resourceId" TEXT,
  "statusCode" INTEGER,
  "success" BOOLEAN NOT NULL DEFAULT true,
  "errorMessage" TEXT,
  "metadata" JSONB,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "durationMs" INTEGER,

  CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "ActivityLog_actorUserId_idx" ON "ActivityLog"("actorUserId");

-- CreateIndex
CREATE INDEX "ActivityLog_action_idx" ON "ActivityLog"("action");

-- CreateIndex
CREATE INDEX "ActivityLog_category_idx" ON "ActivityLog"("category");

-- CreateIndex
CREATE INDEX "ActivityLog_resourceType_resourceId_idx" ON "ActivityLog"("resourceType", "resourceId");

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
