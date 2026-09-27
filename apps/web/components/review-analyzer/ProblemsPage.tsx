'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AppPageChrome, AppPageBody } from '@/components/nav/AppPageChrome';
import { AppChromeTools } from '@/components/nav/AppChromeTools';
import { useReceptionMobileMode } from '@/lib/reception-mobile-context';
import { reviewApi, type GuestReviewRow } from '@/lib/review-analyzer-api';
import { RaBadge, RaSection, priorityTone } from './RaUi';
import { ReviewDetail } from './ReviewDetail';

const PERIODS = [
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'year', label: 'This year' },
  { key: '30d', label: 'Last 30 days' },
  { key: '90d', label: 'Last 90 days' },
  { key: 'all', label: 'All time' },
] as const;

type ProblemRow = {
  id: string;
  title: string;
  priority: string;
  mentionCount: number;
  reviewCount: number;
  shareOfNegativePct: number;
  trendPct: number | null;
  rootCauseHypothesis?: string | null;
  suggestedAction?: string | null;
};

export function ProblemsPage() {
  const tNav = useTranslations('nav');
  const { enterMobile } = useReceptionMobileMode();
  const [period, setPeriod] = useState<(typeof PERIODS)[number]['key']>('month');
  const [periodMeta, setPeriodMeta] = useState<{ label: string; from: string | null; to: string } | null>(
    null,
  );
  const [negativeReviewCount, setNegativeReviewCount] = useState(0);
  const [rows, setRows] = useState<ProblemRow[]>([]);
  const [reviews, setReviews] = useState<GuestReviewRow[]>([]);
  const [selectedProblem, setSelectedProblem] = useState<string | null>(null);
  const [selectedReview, setSelectedReview] = useState<GuestReviewRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingReview, setLoadingReview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProblems = useCallback(async (p: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await reviewApi.problems(p);
      setPeriodMeta({
        label: res.period.label,
        from: res.period.from,
        to: res.period.to,
      });
      setNegativeReviewCount(res.negativeReviewCount);
      setRows(
        res.items.map((r) => ({
          id: String(r.id),
          title: String(r.title),
          priority: String(r.priority),
          mentionCount: Number(r.mentionCount) || 0,
          reviewCount: Number(r.reviewCount) || 0,
          shareOfNegativePct: Number(r.shareOfNegativePct) || 0,
          trendPct: r.trendPct == null ? null : Number(r.trendPct),
          rootCauseHypothesis: (r.rootCauseHypothesis as string | null | undefined) ?? null,
          suggestedAction: (r.suggestedAction as string | null | undefined) ?? null,
        })),
      );
    } catch (e) {
      setError((e as Error).message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProblems(period);
    setSelectedProblem(null);
    setSelectedReview(null);
    setReviews([]);
  }, [period, loadProblems]);

  const openProblem = async (id: string) => {
    setSelectedProblem(id);
    setSelectedReview(null);
    const res = await reviewApi.problemReviews(id, period);
    setReviews(res.items);
  };

  const openReview = async (r: GuestReviewRow) => {
    setLoadingReview(true);
    try {
      const full = await reviewApi.review(r.id);
      setSelectedReview(full);
    } catch {
      setSelectedReview(r);
    } finally {
      setLoadingReview(false);
    }
  };

  const selectedMeta = selectedProblem ? rows.find((r) => r.id === selectedProblem) : undefined;

  const fmtTrend = (t: number | null) => {
    if (t == null) return '—';
    if (Math.abs(t) < 0.5) return '→ 0%';
    return `${t > 0 ? '↑' : '↓'} ${Math.abs(t).toFixed(0)}%`;
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AppPageChrome title={tNav('reviewAnalyzerProblems')} actions={<AppChromeTools onEnterMobile={enterMobile} />} />
      <AppPageBody>
        <div className="space-y-4 p-4 md:p-6">
          <RaSection
            title="Period"
            action={
              <span className="text-xs text-sidebar-muted">
                {periodMeta
                  ? `${periodMeta.label}${
                      periodMeta.from
                        ? ` · ${periodMeta.from.slice(0, 10)} → ${periodMeta.to.slice(0, 10)}`
                        : ''
                    }`
                  : ''}
                {loading ? ' · loading…' : ''}
              </span>
            }
          >
            <div className="flex flex-wrap gap-2">
              {PERIODS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPeriod(p.key)}
                  className={`rounded-btn border px-3 py-1.5 text-xs font-medium transition ${
                    period === p.key
                      ? 'border-sky-400/60 bg-sky-500/20 text-sky-100'
                      : 'border-sidebar-border text-sidebar-muted hover:bg-white/5 hover:text-white'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-sidebar-muted">
              <strong className="text-white/80">Of neg. reviews</strong> = share of all negative reviews in
              this period that mention this problem (e.g. 20% means 1 in 5 negative reviews raised it).{' '}
              <strong className="text-white/80">Trend</strong> = change in linked negative-review count vs the
              previous equal period (previous week / month / year…). Mentions = how often the topic was tagged.
              {negativeReviewCount > 0 ? (
                <>
                  {' '}
                  Currently <strong className="text-white/80">{negativeReviewCount}</strong> negative reviews in
                  range.
                </>
              ) : null}
            </p>
            {error ? <p className="mt-2 text-sm text-rose-300">{error}</p> : null}
          </RaSection>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="overflow-auto rounded-card border border-sidebar-border/60">
              <table className="w-full text-left text-sm text-white">
                <thead className="bg-white/5 text-xs uppercase text-sidebar-muted">
                  <tr>
                    <th className="px-3 py-2">Problem</th>
                    <th className="px-3 py-2" title="Distinct negative reviews mentioning this">
                      Reviews
                    </th>
                    <th className="px-3 py-2" title="Negative topic tags in period">
                      Mentions
                    </th>
                    <th className="px-3 py-2" title="Share of all negative reviews in period">
                      Of neg.
                    </th>
                    <th className="px-3 py-2" title="Change vs previous period">
                      Trend
                    </th>
                    <th className="px-3 py-2">Priority</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      className={`cursor-pointer border-t border-sidebar-border/40 hover:bg-white/5 ${
                        selectedProblem === r.id ? 'bg-white/10' : ''
                      }`}
                      onClick={() => void openProblem(r.id)}
                    >
                      <td className="px-3 py-2">{r.title}</td>
                      <td className="px-3 py-2 tabular-nums">{r.reviewCount}</td>
                      <td className="px-3 py-2 tabular-nums">{r.mentionCount}</td>
                      <td className="px-3 py-2 tabular-nums">{r.shareOfNegativePct.toFixed(0)}%</td>
                      <td className="px-3 py-2 tabular-nums">{fmtTrend(r.trendPct)}</td>
                      <td className="px-3 py-2">
                        <RaBadge tone={priorityTone(r.priority)}>{r.priority}</RaBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!rows.length && !loading ? (
                <p className="p-4 text-sm text-sidebar-muted">No problems in this period</p>
              ) : null}
            </div>

            <RaSection
              title={
                selectedReview
                  ? 'Review detail'
                  : selectedProblem
                    ? 'Linked reviews'
                    : 'Select a problem'
              }
            >
              {loadingReview ? (
                <p className="text-sm text-sidebar-muted">Loading review…</p>
              ) : selectedReview ? (
                <ReviewDetail
                  review={selectedReview}
                  onBack={() => setSelectedReview(null)}
                  backLabel="Back to linked reviews"
                />
              ) : selectedProblem ? (
                <div className="space-y-3">
                  {selectedMeta ? (
                    <div className="rounded-lg border border-sidebar-border/40 bg-white/5 p-3 text-xs text-sidebar-muted">
                      <p>
                        <span className="text-white/80">{selectedMeta.reviewCount}</span> of{' '}
                        <span className="text-white/80">{negativeReviewCount}</span> negative reviews (
                        {selectedMeta.shareOfNegativePct.toFixed(0)}%) mention this in {periodMeta?.label ?? 'period'}
                        . Mentions: {selectedMeta.mentionCount}. Trend: {fmtTrend(selectedMeta.trendPct)}.
                      </p>
                      {selectedMeta.rootCauseHypothesis ? (
                        <p className="mt-2">{selectedMeta.rootCauseHypothesis}</p>
                      ) : null}
                      {selectedMeta.suggestedAction ? (
                        <p className="mt-1">{selectedMeta.suggestedAction}</p>
                      ) : null}
                    </div>
                  ) : null}
                  <ul className="space-y-2">
                    {reviews.map((r) => (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => void openReview(r)}
                          className="w-full rounded-lg border border-sidebar-border/40 px-3 py-3 text-left hover:bg-white/5"
                        >
                          <div className="flex justify-between text-sm text-white">
                            <span className="font-semibold tabular-nums">{r.score.toFixed(1)}</span>
                            <span className="text-xs text-sidebar-muted">
                              {new Date(r.reviewedAt).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="mt-1 line-clamp-3 text-sm text-sidebar-muted">{r.fullText}</p>
                          <p className="mt-1 text-[11px] text-sky-300/80">Open full review →</p>
                        </button>
                      </li>
                    ))}
                    {!reviews.length ? (
                      <li className="text-sm text-sidebar-muted">No linked reviews in this period</li>
                    ) : null}
                  </ul>
                </div>
              ) : (
                <p className="text-sm text-sidebar-muted">Select a problem on the left</p>
              )}
            </RaSection>
          </div>
        </div>
      </AppPageBody>
    </div>
  );
}
