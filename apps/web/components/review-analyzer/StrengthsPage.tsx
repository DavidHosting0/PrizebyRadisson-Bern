'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AppPageChrome, AppPageBody } from '@/components/nav/AppPageChrome';
import { AppChromeTools } from '@/components/nav/AppChromeTools';
import { useReceptionMobileMode } from '@/lib/reception-mobile-context';
import { reviewApi, type GuestReviewRow } from '@/lib/review-analyzer-api';

export function StrengthsPage() {
  const tNav = useTranslations('nav');
  const { enterMobile } = useReceptionMobileMode();
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [reviews, setReviews] = useState<GuestReviewRow[]>([]);

  useEffect(() => {
    void reviewApi.strengths().then(setRows).catch(() => setRows([]));
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AppPageChrome title={tNav('reviewAnalyzerStrengths')} actions={<AppChromeTools onEnterMobile={enterMobile} />} />
      <AppPageBody>
        <div className="grid gap-4 p-4 lg:grid-cols-2 md:p-6">
          <ul className="space-y-2">
            {rows.map((r) => {
              const topic = r.topic as { id: string; name: string } | undefined;
              return (
                <li key={String(r.topicId)}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-card border border-sidebar-border/60 px-4 py-3 text-left hover:bg-white/5"
                    onClick={async () => {
                      const res = await reviewApi.strengthReviews(String(r.topicId));
                      setReviews(res.items);
                    }}
                  >
                    <div>
                      <p className="text-sm font-semibold text-white">{topic?.name ?? String(r.topicId)}</p>
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
          <div className="rounded-card border border-sidebar-border/60 p-4">
            <h3 className="text-sm font-semibold text-white">Linked reviews</h3>
            <ul className="mt-3 space-y-3">
              {reviews.map((r) => (
                <li key={r.id} className="border-t border-sidebar-border/40 pt-3 text-sm text-sidebar-muted">
                  <span className="text-white">{r.score.toFixed(1)}</span> — {r.fullText.slice(0, 220)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </AppPageBody>
    </div>
  );
}
