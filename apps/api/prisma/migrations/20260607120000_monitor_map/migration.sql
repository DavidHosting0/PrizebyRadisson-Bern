-- AlterEnum
ALTER TYPE "PermissionCode" ADD VALUE 'MONITOR_MAP_READ';

-- CreateEnum
CREATE TYPE "MonitorMapFeedKind" AS ENUM ('NEWS', 'POLICE');

-- CreateTable
CREATE TABLE "MonitorMapFeedSource" (
    "id" TEXT NOT NULL,
    "kind" "MonitorMapFeedKind" NOT NULL,
    "name" TEXT NOT NULL,
    "feedUrl" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonitorMapFeedSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitorMapNewsItem" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "url" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "locationLabel" TEXT,
    "aiAnalysis" JSONB,
    "geocodeStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonitorMapNewsItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitorMapPoliceItem" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "url" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "locationLabel" TEXT,
    "geocodeStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonitorMapPoliceItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MonitorMapNewsItem_publishedAt_idx" ON "MonitorMapNewsItem"("publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MonitorMapNewsItem_sourceId_externalId_key" ON "MonitorMapNewsItem"("sourceId", "externalId");

-- CreateIndex
CREATE INDEX "MonitorMapPoliceItem_publishedAt_idx" ON "MonitorMapPoliceItem"("publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MonitorMapPoliceItem_sourceId_externalId_key" ON "MonitorMapPoliceItem"("sourceId", "externalId");
