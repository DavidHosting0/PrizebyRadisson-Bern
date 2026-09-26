/** Shared Review Analyzer types for web + API consumers. */

export type ReviewSentiment = 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'MIXED';
export type ReviewPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type ReviewAnalyzerOverview = {
  averageScore: number;
  reviewCount: number;
  positivePct: number;
  negativePct: number;
  mixedPct: number;
  neutralPct: number;
  reviewsLast24h: number;
  reviewsLast7d: number;
  reviewsThisMonth: number;
  criticalOpen: number;
  latestImport: {
    id: string;
    status: string;
    importedCount: number;
    skippedCount: number;
    finishedAt: string | null;
    errorMessage: string | null;
  } | null;
  topProblems: Array<{
    id: string;
    title: string;
    mentionCount: number;
    negativePct: number;
    trendPct: number | null;
    priority: ReviewPriority;
  }>;
  topStrengths: Array<{ topicId: string; name: string; mentions: number }>;
  scoreTrend: Array<{
    date: string;
    averageScore: number;
    reviewCount: number;
    positivePct: number;
    negativePct: number;
  }>;
};
