'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AppPageChrome, AppPageBody } from '@/components/nav/AppPageChrome';
import { AppChromeTools } from '@/components/nav/AppChromeTools';
import { useReceptionMobileMode } from '@/lib/reception-mobile-context';
import { Button } from '@/components/ui/Button';
import { reviewApi, type GuestReviewRow } from '@/lib/review-analyzer-api';
import { RaBadge, RaSection, sentimentTone } from './RaUi';
import { ReviewDetail } from './ReviewDetail';

export function ReviewExplorer() {
  const tNav = useTranslations('nav');
  const { enterMobile } = useReceptionMobileMode();
  const searchParams = useSearchParams();
  const deepId = searchParams.get('id');
  const [q, setQ] = useState('');
  const [sentiment, setSentiment] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [items, setItems] = useState<GuestReviewRow[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<GuestReviewRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (sentiment) p.set('sentiment', sentiment);
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    p.set('take', '50');
    return `?${p.toString()}`;
  }, [q, sentiment, from, to]);

  const load = async () => {
    try {
      setError(null);
      const res = await reviewApi.reviews(qs);
      setItems(res.items);
      setTotal(res.total);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    void load();
  }, [qs]);

  useEffect(() => {
    if (!deepId) return;
    void (async () => {
      try {
        const full = await reviewApi.review(deepId);
        setSelected(full);
      } catch {
        /* ignore */
      }
    })();
  }, [deepId]);

  const selectReview = async (r: GuestReviewRow) => {
    try {
      const full = await reviewApi.review(r.id);
      setSelected(full);
    } catch {
      setSelected(r);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AppPageChrome title={tNav('reviewAnalyzerReviews')} actions={<AppChromeTools onEnterMobile={enterMobile} />} />
      <AppPageBody>
        <div className="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-[1fr_360px] md:p-6">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <input
                className="min-w-[180px] flex-1 rounded-btn border border-sidebar-border bg-transparent px-3 py-2 text-sm text-white"
                placeholder="Search reviews…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <select
                className="rounded-btn border border-sidebar-border bg-transparent px-3 py-2 text-sm text-white"
                value={sentiment}
                onChange={(e) => setSentiment(e.target.value)}
              >
                <option value="">All sentiments</option>
                <option value="POSITIVE">Positive</option>
                <option value="NEUTRAL">Neutral</option>
                <option value="NEGATIVE">Negative</option>
                <option value="MIXED">Mixed</option>
              </select>
              <input
                type="date"
                className="rounded-btn border border-sidebar-border bg-transparent px-3 py-2 text-sm text-white"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
              <input
                type="date"
                className="rounded-btn border border-sidebar-border bg-transparent px-3 py-2 text-sm text-white"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
              <Button variant="secondary" onClick={() => void load()}>
                Refresh
              </Button>
            </div>
            {error ? <p className="text-sm text-rose-300">{error}</p> : null}
            <p className="text-xs text-sidebar-muted">{total} reviews</p>
            <ul className="divide-y divide-sidebar-border/40 overflow-auto rounded-card border border-sidebar-border/60">
              {items.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => void selectReview(r)}
                    className={`flex w-full flex-col gap-1 px-3 py-3 text-left hover:bg-white/5 ${
                      selected?.id === r.id ? 'bg-white/10' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-white">{r.score.toFixed(1)}</span>
                      <RaBadge tone={sentimentTone(r.analysis?.sentiment)}>
                        {r.analysis?.sentiment ?? '—'}
                      </RaBadge>
                    </div>
                    <p className="line-clamp-2 text-xs text-sidebar-muted">{r.fullText}</p>
                    <p className="text-[11px] text-sidebar-muted">
                      {new Date(r.reviewedAt).toLocaleDateString()} · {r.guestCountry ?? '—'} ·{' '}
                      {r.language ?? '—'}
                    </p>
                  </button>
                </li>
              ))}
              {!items.length ? <li className="px-3 py-6 text-sm text-sidebar-muted">No reviews found</li> : null}
            </ul>
          </div>

          <RaSection title="Review detail">
            {!selected ? (
              <p className="text-sm text-sidebar-muted">Select a review</p>
            ) : (
              <ReviewDetail review={selected} />
            )}
          </RaSection>
        </div>
      </AppPageBody>
    </div>
  );
}
