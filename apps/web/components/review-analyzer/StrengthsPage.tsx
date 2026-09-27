'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AppPageChrome, AppPageBody } from '@/components/nav/AppPageChrome';
import { AppChromeTools } from '@/components/nav/AppChromeTools';
import { useReceptionMobileMode } from '@/lib/reception-mobile-context';
import { reviewApi, type GuestReviewRow } from '@/lib/review-analyzer-api';
import { RaSection } from './RaUi';
import { ReviewDetail } from './ReviewDetail';

export function StrengthsPage() {
  const tNav = useTranslations('nav');
  const { enterMobile } = useReceptionMobileMode();
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [reviews, setReviews] = useState<GuestReviewRow[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [selectedReview, setSelectedReview] = useState<GuestReviewRow | null>(null);
  const [loadingReview, setLoadingReview] = useState(false);

  useEffect(() => {
    void reviewApi.strengths().then(setRows).catch(() => setRows([]));
  }, []);

  const openTopic = async (topicId: string) => {
    setSelectedTopic(topicId);
    setSelectedReview(null);
    const res = await reviewApi.strengthReviews(topicId);
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AppPageChrome title={tNav('reviewAnalyzerStrengths')} actions={<AppChromeTools onEnterMobile={enterMobile} />} />
      <AppPageBody>
        <div className="grid gap-4 p-4 lg:grid-cols-2 md:p-6">
          <ul className="space-y-2">
            {rows.map((r) => {
              const topic = r.topic as { id: string; name: string } | undefined;
              const id = String(r.topicId);
              return (
                <li key={id}>
                  <button
                    type="button"
                    className={`flex w-full items-center justify-between rounded-card border border-sidebar-border/60 px-4 py-3 text-left hover:bg-white/5 ${
                      selectedTopic === id ? 'bg-white/10' : ''
                    }`}
                    onClick={() => void openTopic(id)}
                  >
                    <div>
                      <p className="text-sm font-semibold text-white">{topic?.name ?? id}</p>
                      <p className="text-xs text-sidebar-muted">
                        {String(r.mentions)} mentions · {Number(r.positivePct).toFixed(0)}% positive
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
            {!rows.length ? <li className="text-sm text-sidebar-muted">No strengths yet</li> : null}
          </ul>

          <RaSection
            title={
              selectedReview
                ? 'Review detail'
                : selectedTopic
                  ? 'Linked reviews'
                  : 'Select a strength'
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
            ) : selectedTopic ? (
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
                  <li className="text-sm text-sidebar-muted">No linked reviews</li>
                ) : null}
              </ul>
            ) : (
              <p className="text-sm text-sidebar-muted">Select a strength on the left</p>
            )}
          </RaSection>
        </div>
      </AppPageBody>
    </div>
  );
}
