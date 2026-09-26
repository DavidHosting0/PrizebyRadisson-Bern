'use client';

import { api } from '@/lib/api';
import type { ReviewAnalyzerOverview } from '@housekeeping/shared';

export type GuestReviewRow = {
  id: string;
  externalId: string;
  reviewedAt: string;
  score: number;
  positiveText: string | null;
  negativeText: string | null;
  fullText: string;
  language: string | null;
  guestName: string | null;
  guestCountry: string | null;
  travelType: string | null;
  roomCategory: string | null;
  analysis: {
    sentiment: string;
    sentimentScore: number;
    summaryEn: string;
    translationEn: string | null;
    positives: Array<{ text: string }>;
    negatives: Array<{ text: string }>;
  } | null;
  mentions: Array<{
    id: string;
    polarity: string;
    priority: string | null;
    evidence: string | null;
    topic: { id: string; name: string; slug: string };
    cluster: { id: string; title: string } | null;
  }>;
  categoryScores: Array<{ category: string; score: number }>;
};

export const reviewApi = {
  overview: () => api<ReviewAnalyzerOverview>('/review-analyzer/overview'),
  reviews: (qs: string) =>
    api<{ items: GuestReviewRow[]; total: number }>(`/review-analyzer/reviews${qs}`),
  review: (id: string) => api<GuestReviewRow>(`/review-analyzer/reviews/${id}`),
  daily: () => api<Array<Record<string, unknown>>>('/review-analyzer/analytics/daily'),
  weekly: () => api<Array<Record<string, unknown>>>('/review-analyzer/analytics/weekly'),
  monthly: () => api<Array<Record<string, unknown>>>('/review-analyzer/analytics/monthly'),
  problems: () => api<Array<Record<string, unknown>>>('/review-analyzer/analytics/problems'),
  problemReviews: (id: string) =>
    api<{ items: GuestReviewRow[]; total: number }>(
      `/review-analyzer/analytics/problems/${id}/reviews`,
    ),
  strengths: () => api<Array<Record<string, unknown>>>('/review-analyzer/analytics/strengths'),
  strengthReviews: (id: string) =>
    api<{ items: GuestReviewRow[]; total: number }>(
      `/review-analyzer/analytics/strengths/${id}/reviews`,
    ),
  trends: () =>
    api<{
      daily: Array<Record<string, unknown>>;
      weekly: Array<Record<string, unknown>>;
      monthly: Array<Record<string, unknown>>;
    }>('/review-analyzer/analytics/trends'),
  scores: () => api<Array<Record<string, unknown>>>('/review-analyzer/analytics/scores'),
  alerts: (includeAcked = false) =>
    api<Array<Record<string, unknown>>>(
      `/review-analyzer/alerts?includeAcked=${includeAcked ? 'true' : 'false'}`,
    ),
  ackAlert: (id: string) =>
    api(`/review-analyzer/alerts/${id}/ack`, { method: 'PATCH' }),
  reports: (periodType?: string) =>
    api<Array<Record<string, unknown>>>(
      `/review-analyzer/reports${periodType ? `?periodType=${periodType}` : ''}`,
    ),
  importJobs: () => api<Array<Record<string, unknown>>>('/review-analyzer/import-jobs'),
  importNow: (mode?: 'historical' | 'incremental') =>
    api('/review-analyzer/import', {
      method: 'POST',
      body: JSON.stringify(mode ? { mode } : {}),
    }),
  analyze: () => api('/review-analyzer/analyze', { method: 'POST', body: '{}' }),
  recompute: () => api('/review-analyzer/recompute', { method: 'POST', body: '{}' }),
  settings: () => api<Record<string, unknown>>('/review-analyzer/settings'),
  updateSettings: (body: Record<string, unknown>) =>
    api('/review-analyzer/settings', { method: 'PATCH', body: JSON.stringify(body) }),
  exportUrl: (format: 'csv' | 'xlsx' | 'pdf') =>
    `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'}/review-analyzer/export?format=${format}`,
};
