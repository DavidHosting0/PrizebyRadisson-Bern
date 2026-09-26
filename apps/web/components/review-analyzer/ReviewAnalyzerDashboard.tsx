'use client';

import { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  BarChart,
  Bar,
} from 'recharts';
import { useTranslations } from 'next-intl';
import { AppPageChrome, AppPageBody } from '@/components/nav/AppPageChrome';
import { AppChromeTools } from '@/components/nav/AppChromeTools';
import { useReceptionMobileMode } from '@/lib/reception-mobile-context';
import { Button } from '@/components/ui/Button';
import { reviewApi } from '@/lib/review-analyzer-api';
import type { ReviewAnalyzerOverview } from '@housekeeping/shared';
import { RaBadge, RaSection, RaStat, priorityTone } from './RaUi';
import { getTokens } from '@/lib/api';

function fmt(n: number, digits = 1) {
  return Number.isFinite(n) ? n.toFixed(digits) : '—';
}

export function ReviewAnalyzerDashboard() {
  const tNav = useTranslations('nav');
  const { enterMobile } = useReceptionMobileMode();
  const [data, setData] = useState<ReviewAnalyzerOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      setError(null);
      setData(await reviewApi.overview());
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const runImport = async () => {
    setBusy(true);
    try {
      await reviewApi.importNow();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const download = async (format: 'csv' | 'xlsx' | 'pdf') => {
    const access = getTokens().access;
    const res = await fetch(reviewApi.exportUrl(format), {
      headers: access ? { Authorization: `Bearer ${access}` } : {},
    });
    if (!res.ok) throw new Error(await res.text());
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `review-export.${format === 'xlsx' ? 'xls' : format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const trend = (data?.scoreTrend ?? []).map((d) => ({
    ...d,
    label: String(d.date).slice(5, 10),
  }));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AppPageChrome
        title={tNav('reviewAnalyzer')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" disabled={busy} onClick={() => void runImport()}>
              {busy ? 'Importing…' : 'Run import'}
            </Button>
            <Button variant="secondary" onClick={() => void download('csv')}>
              CSV
            </Button>
            <Button variant="secondary" onClick={() => void download('xlsx')}>
              Excel
            </Button>
            <Button variant="secondary" onClick={() => void download('pdf')}>
              PDF
            </Button>
            <AppChromeTools onEnterMobile={enterMobile} />
          </div>
        }
      />
      <AppPageBody>
        <div className="space-y-4 p-4 md:p-6">
          {error ? <p className="text-sm text-rose-300">{error}</p> : null}
          {!data ? (
            <p className="text-sm text-sidebar-muted">Loading…</p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <RaStat label="Average score" value={fmt(data.averageScore)} />
                <RaStat label="Reviews" value={data.reviewCount} />
                <RaStat label="Positive %" value={`${fmt(data.positivePct, 0)}%`} />
                <RaStat label="Negative %" value={`${fmt(data.negativePct, 0)}%`} />
                <RaStat label="Open alerts" value={data.criticalOpen} hint="See Alerts page" />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <RaStat label="Last 24h" value={data.reviewsLast24h} />
                <RaStat label="Last 7 days" value={data.reviewsLast7d} />
                <RaStat label="This month" value={data.reviewsThisMonth} />
              </div>

              {data.latestImport ? (
                <p className="text-xs text-sidebar-muted">
                  Last import: {data.latestImport.status} · +{data.latestImport.importedCount} / skipped{' '}
                  {data.latestImport.skippedCount}
                  {data.latestImport.errorMessage ? ` · ${data.latestImport.errorMessage}` : ''}
                </p>
              ) : (
                <p className="text-xs text-sidebar-muted">No import runs yet — trigger Run import.</p>
              )}

              <RaSection title="Score trend (daily)">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trend}>
                      <CartesianGrid stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} />
                      <YAxis domain={[0, 10]} stroke="#94a3b8" fontSize={11} />
                      <Tooltip
                        contentStyle={{ background: '#0f172a', border: '1px solid #334155' }}
                      />
                      <Line type="monotone" dataKey="averageScore" stroke="#38bdf8" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </RaSection>

              <div className="grid gap-4 lg:grid-cols-2">
                <RaSection title="Top strengths">
                  <ul className="space-y-2">
                    {data.topStrengths.map((s) => (
                      <li key={s.topicId} className="flex items-center justify-between text-sm text-white">
                        <span>{s.name}</span>
                        <span className="text-sidebar-muted">{s.mentions}</span>
                      </li>
                    ))}
                    {!data.topStrengths.length ? (
                      <li className="text-sm text-sidebar-muted">No strengths yet</li>
                    ) : null}
                  </ul>
                </RaSection>
                <RaSection title="Top problems">
                  <ul className="space-y-2">
                    {data.topProblems.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-2 text-sm text-white">
                        <span>{p.title}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-sidebar-muted">{p.mentionCount}</span>
                          <RaBadge tone={priorityTone(p.priority)}>{p.priority}</RaBadge>
                        </div>
                      </li>
                    ))}
                    {!data.topProblems.length ? (
                      <li className="text-sm text-sidebar-muted">No problems yet</li>
                    ) : null}
                  </ul>
                </RaSection>
              </div>

              <RaSection title="Review volume">
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={trend}>
                      <CartesianGrid stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} />
                      <YAxis stroke="#94a3b8" fontSize={11} />
                      <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155' }} />
                      <Bar dataKey="reviewCount" fill="#64748b" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </RaSection>
            </>
          )}
        </div>
      </AppPageBody>
    </div>
  );
}
