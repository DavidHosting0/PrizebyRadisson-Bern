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
  Legend,
} from 'recharts';
import { useTranslations } from 'next-intl';
import { AppPageChrome, AppPageBody } from '@/components/nav/AppPageChrome';
import { AppChromeTools } from '@/components/nav/AppChromeTools';
import { useReceptionMobileMode } from '@/lib/reception-mobile-context';
import { reviewApi } from '@/lib/review-analyzer-api';
import { RaSection } from './RaUi';

export function TrendsPage() {
  const tNav = useTranslations('nav');
  const { enterMobile } = useReceptionMobileMode();
  const [daily, setDaily] = useState<Array<Record<string, unknown>>>([]);
  const [weekly, setWeekly] = useState<Array<Record<string, unknown>>>([]);
  const [monthly, setMonthly] = useState<Array<Record<string, unknown>>>([]);
  const [scores, setScores] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    void (async () => {
      const t = await reviewApi.trends();
      setDaily(t.daily);
      setWeekly(t.weekly);
      setMonthly(t.monthly);
      setScores(await reviewApi.scores());
    })();
  }, []);

  const dailyChart = daily.map((d) => ({
    label: String(d.date).slice(5, 10),
    averageScore: Number(d.averageScore),
    positivePct: Number(d.positivePct),
    negativePct: Number(d.negativePct),
    reviewCount: Number(d.reviewCount),
  }));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AppPageChrome title={tNav('reviewAnalyzerTrends')} actions={<AppChromeTools onEnterMobile={enterMobile} />} />
      <AppPageBody>
        <div className="space-y-4 p-4 md:p-6">
          <RaSection title="Daily average score / sentiment">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailyChart}>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} />
                  <YAxis stroke="#94a3b8" fontSize={11} />
                  <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155' }} />
                  <Legend />
                  <Line type="monotone" dataKey="averageScore" stroke="#38bdf8" dot={false} />
                  <Line type="monotone" dataKey="positivePct" stroke="#34d399" dot={false} />
                  <Line type="monotone" dataKey="negativePct" stroke="#fb7185" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </RaSection>

          <div className="grid gap-4 lg:grid-cols-2">
            <RaSection title="Weekly">
              <ul className="max-h-64 space-y-2 overflow-auto text-sm text-white">
                {weekly.map((w) => (
                  <li key={`${w.year}-W${w.week}`} className="flex justify-between border-b border-sidebar-border/30 py-1">
                    <span>
                      {String(w.year)}-W{String(w.week).padStart(2, '0')}
                    </span>
                    <span className="text-sidebar-muted">
                      {Number(w.averageScore).toFixed(1)} · {String(w.reviewCount)} reviews
                    </span>
                  </li>
                ))}
              </ul>
            </RaSection>
            <RaSection title="Monthly + category scores">
              <ul className="max-h-64 space-y-2 overflow-auto text-sm text-white">
                {monthly.map((m) => (
                  <li key={`${m.year}-${m.month}`} className="border-b border-sidebar-border/30 py-1">
                    <div className="flex justify-between">
                      <span>
                        {String(m.year)}-{String(m.month).padStart(2, '0')}
                      </span>
                      <span className="text-sidebar-muted">{Number(m.averageScore).toFixed(1)}</span>
                    </div>
                  </li>
                ))}
                {scores.slice(-6).map((s, i) => (
                  <li key={i} className="text-xs text-sidebar-muted">
                    Categories {String(s.year)}-{String(s.month)}: {JSON.stringify(s.categoryScores)}
                  </li>
                ))}
              </ul>
            </RaSection>
          </div>
        </div>
      </AppPageBody>
    </div>
  );
}
