-- AlterEnum
ALTER TYPE "PermissionCode" ADD VALUE 'REVIEW_ANALYZER_READ';

-- CreateEnum
CREATE TYPE "ReviewSource" AS ENUM ('BOOKING', 'GOOGLE', 'TRIPADVISOR', 'EXPEDIA', 'HOTELS', 'OTHER');
CREATE TYPE "ReviewSentiment" AS ENUM ('POSITIVE', 'NEUTRAL', 'NEGATIVE', 'MIXED');
CREATE TYPE "ReviewMentionPolarity" AS ENUM ('POSITIVE', 'NEGATIVE', 'NEUTRAL');
CREATE TYPE "ReviewPriority" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');
CREATE TYPE "ReviewJobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'EMPTY');
CREATE TYPE "ReviewAlertType" AS ENUM ('SCORE_DROP', 'TOPIC_SPIKE', 'NEGATIVE_TREND', 'CRITICAL_REVIEW', 'ANOMALY', 'IMPORT_FAILED');

-- CreateTable
CREATE TABLE "GuestReview" (
    "id" TEXT NOT NULL,
    "source" "ReviewSource" NOT NULL DEFAULT 'BOOKING',
    "externalId" TEXT NOT NULL,
    "hotelKey" TEXT NOT NULL DEFAULT 'CHBRNPR',
    "reviewedAt" TIMESTAMP(3) NOT NULL,
    "stayDate" TIMESTAMP(3),
    "score" DOUBLE PRECISION NOT NULL,
    "positiveText" TEXT,
    "negativeText" TEXT,
    "fullText" TEXT NOT NULL,
    "language" TEXT,
    "guestName" TEXT,
    "guestCountry" TEXT,
    "travelType" TEXT,
    "stayNights" INTEGER,
    "roomCategory" TEXT,
    "contentHash" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "rawPayload" JSONB,

    CONSTRAINT "GuestReview_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GuestReviewCategoryScore" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "GuestReviewCategoryScore_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReviewAnalysis" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "sentiment" "ReviewSentiment" NOT NULL,
    "sentimentScore" INTEGER NOT NULL,
    "summaryEn" TEXT NOT NULL,
    "translationEn" TEXT,
    "positives" JSONB NOT NULL,
    "negatives" JSONB NOT NULL,
    "model" TEXT,
    "analyzedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewAnalysis_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReviewTopic" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewTopic_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReviewProblemCluster" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "rootCauseHypothesis" TEXT,
    "suggestedAction" TEXT,
    "priority" "ReviewPriority" NOT NULL DEFAULT 'MEDIUM',
    "mentionCount" INTEGER NOT NULL DEFAULT 0,
    "negativePct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "trendPct" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewProblemCluster_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReviewMention" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "polarity" "ReviewMentionPolarity" NOT NULL,
    "severity" "ReviewPriority",
    "priority" "ReviewPriority",
    "evidence" TEXT,
    "clusterId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewMention_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReviewProblemClusterTopic" (
    "clusterId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,

    CONSTRAINT "ReviewProblemClusterTopic_pkey" PRIMARY KEY ("clusterId","topicId")
);

CREATE TABLE "DailyReviewMetric" (
    "id" TEXT NOT NULL,
    "hotelKey" TEXT NOT NULL DEFAULT 'CHBRNPR',
    "date" DATE NOT NULL,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "averageScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "positivePct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "negativePct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "mixedPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "neutralPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "topPositive" TEXT,
    "topNegative" TEXT,
    "categoryScores" JSONB,
    "topicStats" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyReviewMetric_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WeeklyReviewMetric" (
    "id" TEXT NOT NULL,
    "hotelKey" TEXT NOT NULL DEFAULT 'CHBRNPR',
    "year" INTEGER NOT NULL,
    "week" INTEGER NOT NULL,
    "weekStart" DATE NOT NULL,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "averageScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "positivePct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "negativePct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "topPositiveThemes" JSONB,
    "topNegativeThemes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyReviewMetric_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MonthlyReviewMetric" (
    "id" TEXT NOT NULL,
    "hotelKey" TEXT NOT NULL DEFAULT 'CHBRNPR',
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "averageScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "positivePct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "negativePct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "topStrengths" JSONB,
    "topProblems" JSONB,
    "categoryScores" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyReviewMetric_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReviewAlert" (
    "id" TEXT NOT NULL,
    "hotelKey" TEXT NOT NULL DEFAULT 'CHBRNPR',
    "type" "ReviewAlertType" NOT NULL,
    "severity" "ReviewPriority" NOT NULL DEFAULT 'MEDIUM',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "payload" JSONB,
    "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewAlert_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReviewImportJob" (
    "id" TEXT NOT NULL,
    "source" "ReviewSource" NOT NULL DEFAULT 'BOOKING',
    "status" "ReviewJobStatus" NOT NULL DEFAULT 'PENDING',
    "mode" TEXT NOT NULL DEFAULT 'incremental',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewImportJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReviewAnalysisJob" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT,
    "status" "ReviewJobStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewAnalysisJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReviewManagementReport" (
    "id" TEXT NOT NULL,
    "hotelKey" TEXT NOT NULL DEFAULT 'CHBRNPR',
    "periodType" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summaryEn" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewManagementReport_pkey" PRIMARY KEY ("id")
);

-- Indexes / uniques / FKs
CREATE UNIQUE INDEX "GuestReview_source_externalId_key" ON "GuestReview"("source", "externalId");
CREATE INDEX "GuestReview_reviewedAt_idx" ON "GuestReview"("reviewedAt" DESC);
CREATE INDEX "GuestReview_score_idx" ON "GuestReview"("score");
CREATE INDEX "GuestReview_language_idx" ON "GuestReview"("language");
CREATE INDEX "GuestReview_guestCountry_idx" ON "GuestReview"("guestCountry");
CREATE INDEX "GuestReview_hotelKey_reviewedAt_idx" ON "GuestReview"("hotelKey", "reviewedAt");
CREATE INDEX "GuestReview_contentHash_idx" ON "GuestReview"("contentHash");

CREATE UNIQUE INDEX "GuestReviewCategoryScore_reviewId_category_key" ON "GuestReviewCategoryScore"("reviewId", "category");
CREATE INDEX "GuestReviewCategoryScore_category_idx" ON "GuestReviewCategoryScore"("category");

CREATE UNIQUE INDEX "ReviewAnalysis_reviewId_key" ON "ReviewAnalysis"("reviewId");
CREATE UNIQUE INDEX "ReviewTopic_slug_key" ON "ReviewTopic"("slug");
CREATE UNIQUE INDEX "ReviewProblemCluster_slug_key" ON "ReviewProblemCluster"("slug");

CREATE INDEX "ReviewMention_reviewId_idx" ON "ReviewMention"("reviewId");
CREATE INDEX "ReviewMention_topicId_idx" ON "ReviewMention"("topicId");
CREATE INDEX "ReviewMention_polarity_idx" ON "ReviewMention"("polarity");
CREATE INDEX "ReviewMention_priority_idx" ON "ReviewMention"("priority");
CREATE INDEX "ReviewMention_clusterId_idx" ON "ReviewMention"("clusterId");

CREATE UNIQUE INDEX "DailyReviewMetric_hotelKey_date_key" ON "DailyReviewMetric"("hotelKey", "date");
CREATE INDEX "DailyReviewMetric_date_idx" ON "DailyReviewMetric"("date");
CREATE UNIQUE INDEX "WeeklyReviewMetric_hotelKey_year_week_key" ON "WeeklyReviewMetric"("hotelKey", "year", "week");
CREATE INDEX "WeeklyReviewMetric_weekStart_idx" ON "WeeklyReviewMetric"("weekStart");
CREATE UNIQUE INDEX "MonthlyReviewMetric_hotelKey_year_month_key" ON "MonthlyReviewMetric"("hotelKey", "year", "month");

CREATE INDEX "ReviewAlert_createdAt_idx" ON "ReviewAlert"("createdAt" DESC);
CREATE INDEX "ReviewAlert_acknowledgedAt_idx" ON "ReviewAlert"("acknowledgedAt");
CREATE INDEX "ReviewAlert_type_idx" ON "ReviewAlert"("type");
CREATE INDEX "ReviewImportJob_createdAt_idx" ON "ReviewImportJob"("createdAt" DESC);
CREATE INDEX "ReviewImportJob_status_idx" ON "ReviewImportJob"("status");
CREATE INDEX "ReviewAnalysisJob_status_idx" ON "ReviewAnalysisJob"("status");
CREATE INDEX "ReviewAnalysisJob_createdAt_idx" ON "ReviewAnalysisJob"("createdAt" DESC);
CREATE UNIQUE INDEX "ReviewManagementReport_hotelKey_periodType_periodKey_key" ON "ReviewManagementReport"("hotelKey", "periodType", "periodKey");
CREATE INDEX "ReviewManagementReport_periodType_periodKey_idx" ON "ReviewManagementReport"("periodType", "periodKey");

ALTER TABLE "GuestReviewCategoryScore" ADD CONSTRAINT "GuestReviewCategoryScore_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "GuestReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReviewAnalysis" ADD CONSTRAINT "ReviewAnalysis_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "GuestReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReviewMention" ADD CONSTRAINT "ReviewMention_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "GuestReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReviewMention" ADD CONSTRAINT "ReviewMention_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "ReviewTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReviewMention" ADD CONSTRAINT "ReviewMention_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "ReviewProblemCluster"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReviewProblemClusterTopic" ADD CONSTRAINT "ReviewProblemClusterTopic_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "ReviewProblemCluster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReviewProblemClusterTopic" ADD CONSTRAINT "ReviewProblemClusterTopic_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "ReviewTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
