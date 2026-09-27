'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import { useTranslations } from 'next-intl';
import { AppPageChrome, AppPageBody } from '@/components/nav/AppPageChrome';
import { AppChromeTools } from '@/components/nav/AppChromeTools';
import { useReceptionMobileMode } from '@/lib/reception-mobile-context';
import { DateInput } from '@/components/ui/DateInput';
import { Button } from '@/components/ui/Button';
import { reviewApi } from '@/lib/review-analyzer-api';
import { RaSection } from './RaUi';

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function defaultFrom() {
  return `${new Date().getFullYear()}-01-01`;
}

function defaultTo() {
  return isoDate(new Date());
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function round0(n: number) {
  return Math.round(n);
}

function fmtTick(n: number, digits: number) {
  if (!Number.isFinite(n)) return '';
  return digits === 0 ? String(Math.round(n)) : n.toFixed(digits);
}

/** Tight Y-range around values so small score swings are visible (still within 1–10). */
function fittedScoreDomain(values: number[]): [number, number] {
  const nums = values.filter((v) => Number.isFinite(v) && v > 0);
  if (!nums.length) return [6, 10];
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = Math.max(max - min, 0.6);
  const pad = Math.max(span * 0.35, 0.25);
  let lo = Math.floor((min - pad) * 10) / 10;
  let hi = Math.ceil((max + pad) * 10) / 10;
  if (hi - lo < 1) {
    const mid = (lo + hi) / 2;
    lo = mid - 0.5;
    hi = mid + 0.5;
  }
  lo = Math.max(1, Math.min(lo, 9));
  hi = Math.min(10, Math.max(hi, lo + 0.5));
  return [lo, hi];
}

type ChartRow = {
  label: string;
  fullDate: string;
  averageScore: number;
  positivePct: number;
  negativePct: number;
  reviewCount: number;
};

function MetricChart({
  title,
  data,
  dataKey,
  color,
  yDomain,
  yDigits,
  unit,
  heightClass = 'h-64',
  showDots = false,
  area = false,
  referenceY,
}: {
  title: string;
  data: ChartRow[];
  dataKey: keyof ChartRow;
  color: string;
  yDomain: [number, number] | ['auto', 'auto'];
  yDigits: number;
  unit?: string;
  heightClass?: string;
  showDots?: boolean;
  area?: boolean;
  referenceY?: number;
}) {
  const Chart = area ? AreaChart : LineChart;
  const gradientId = `fill-${String(dataKey)}`;

  return (
    <RaSection title={title}>
      <div className={heightClass}>
        {data.length === 0 ? (
          <p className="text-sm text-sidebar-muted">No data in this period.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <Chart data={data} margin={{ top: 12, right: 16, left: 4, bottom: 4 }}>
              {area ? (
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
              ) : null}
              <CartesianGrid stroke="rgba(255,255,255,0.1)" strokeDasharray="3 6" vertical={false} />
              <XAxis
                dataKey="label"
                stroke="#94a3b8"
                fontSize={11}
                minTickGap={24}
                tick={{ fill: '#94a3b8' }}
                tickLine={false}
                axisLine={{ stroke: 'rgba(148,163,184,0.35)' }}
              />
              <YAxis
                domain={yDomain}
                stroke="#94a3b8"
                fontSize={11}
                width={48}
                tick={{ fill: '#94a3b8' }}
                tickLine={false}
                axisLine={false}
                tickCount={6}
                tickFormatter={(v) => fmtTick(Number(v), yDigits)}
                allowDecimals={yDigits > 0}
              />
              {referenceY != null ? (
                <ReferenceLine
                  y={referenceY}
                  stroke="rgba(148,163,184,0.45)"
                  strokeDasharray="4 4"
                  label={{
                    value: `avg ${fmtTick(referenceY, yDigits)}`,
                    position: 'insideTopRight',
                    fill: '#94a3b8',
                    fontSize: 10,
                  }}
                />
              ) : null}
              <Tooltip
                contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8 }}
                labelStyle={{ color: '#e2e8f0' }}
                formatter={(value) => {
                  const n = Number(value);
                  const text = Number.isFinite(n) ? fmtTick(n, yDigits) : String(value ?? '');
                  return [`${text}${unit ?? ''}`, title];
                }}
                labelFormatter={(_, payload) => {
                  const row = payload?.[0]?.payload as ChartRow | undefined;
                  return row?.fullDate ?? '';
                }}
              />
              {area ? (
                <Area
                  type="monotone"
                  dataKey={dataKey}
                  stroke={color}
                  strokeWidth={2.5}
                  fill={`url(#${gradientId})`}
                  dot={
                    showDots
                      ? { r: 3, fill: color, strokeWidth: 0 }
                      : data.length <= 40
                        ? { r: 2.5, fill: color, strokeWidth: 0 }
                        : false
                  }
                  activeDot={{ r: 5, strokeWidth: 0, fill: '#fff' }}
                  isAnimationActive={false}
                  connectNulls={false}
                />
              ) : (
                <Line
                  type="monotone"
                  dataKey={dataKey}
                  stroke={color}
                  strokeWidth={2}
                  dot={showDots ? { r: 3, fill: color, strokeWidth: 0 } : false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                  isAnimationActive={false}
                />
              )}
            </Chart>
          </ResponsiveContainer>
        )}
      </div>
    </RaSection>
  );
}

export function TrendsPage() {
  const tNav = useTranslations('nav');
  const { enterMobile } = useReceptionMobileMode();
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [appliedFrom, setAppliedFrom] = useState(defaultFrom);
  const [appliedTo, setAppliedTo] = useState(defaultTo);
  const [daily, setDaily] = useState<Array<Record<string, unknown>>>([]);
  const [weekly, setWeekly] = useState<Array<Record<string, unknown>>>([]);
  const [monthly, setMonthly] = useState<Array<Record<string, unknown>>>([]);
  const [scores, setScores] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (f: string, t: string) => {
    setLoading(true);
    setError(null);
    try {
      const [trend, scoreRows] = await Promise.all([reviewApi.trends(f, t), reviewApi.scores()]);
      setDaily(trend.daily);
      setWeekly(trend.weekly);
      setMonthly(trend.monthly);
      setScores(scoreRows);
      setAppliedFrom(f);
      setAppliedTo(t);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(defaultFrom(), defaultTo());
  }, [load]);

  const dailyChart: ChartRow[] = useMemo(
    () =>
      daily.map((d) => {
        const dateStr = String(d.date).slice(0, 10);
        return {
          label: dateStr.slice(5),
          fullDate: dateStr,
          averageScore: round1(Number(d.averageScore) || 0),
          positivePct: round0(Number(d.positivePct) || 0),
          negativePct: round0(Number(d.negativePct) || 0),
          reviewCount: Number(d.reviewCount) || 0,
        };
      }),
    [daily],
  );

  // Days without reviews (score 0) flatten the curve — keep only scored days for average score
  const scoreChart = useMemo(
    () => dailyChart.filter((d) => d.reviewCount > 0 && d.averageScore > 0),
    [dailyChart],
  );

  const scoreDomain = useMemo(
    () => fittedScoreDomain(scoreChart.map((d) => d.averageScore)),
    [scoreChart],
  );

  const scorePeriodAvg = useMemo(() => {
    if (!scoreChart.length) return undefined;
    const sum = scoreChart.reduce((s, d) => s + d.averageScore, 0);
    return round1(sum / scoreChart.length);
  }, [scoreChart]);

  const applyRange = () => {
    if (!from || !to) return;
    if (from > to) {
      setError('From date must be before to date');
      return;
    }
    void load(from, to);
  };

  const setThisYear = () => {
    const f = defaultFrom();
    const t = defaultTo();
    setFrom(f);
    setTo(t);
    void load(f, t);
  };

  const setLast30 = () => {
    const end = new Date();
    const start = new Date();
    start.setUTCDate(start.getUTCDate() - 29);
    const f = isoDate(start);
    const t = isoDate(end);
    setFrom(f);
    setTo(t);
    void load(f, t);
  };

  const setLast90 = () => {
    const end = new Date();
    const start = new Date();
    start.setUTCDate(start.getUTCDate() - 89);
    const f = isoDate(start);
    const t = isoDate(end);
    setFrom(f);
    setTo(t);
    void load(f, t);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AppPageChrome title={tNav('reviewAnalyzerTrends')} actions={<AppChromeTools onEnterMobile={enterMobile} />} />
      <AppPageBody>
        <div className="space-y-4 p-4 md:p-6">
          <RaSection
            title="Period"
            action={
              <span className="text-xs text-sidebar-muted">
                {appliedFrom} → {appliedTo}
                {loading ? ' · loading…' : ''}
              </span>
            }
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <label className="block min-w-[10rem] flex-1 text-xs text-sidebar-muted">
                From
                <div className="mt-1">
                  <DateInput size="sm" value={from} onChange={(e) => setFrom(e.target.value)} />
                </div>
              </label>
              <label className="block min-w-[10rem] flex-1 text-xs text-sidebar-muted">
                To
                <div className="mt-1">
                  <DateInput size="sm" value={to} onChange={(e) => setTo(e.target.value)} />
                </div>
              </label>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" disabled={loading} onClick={applyRange}>
                  Apply
                </Button>
                <Button variant="secondary" disabled={loading} onClick={setThisYear}>
                  This year
                </Button>
                <Button variant="secondary" disabled={loading} onClick={setLast90}>
                  90 days
                </Button>
                <Button variant="secondary" disabled={loading} onClick={setLast30}>
                  30 days
                </Button>
              </div>
            </div>
            {error ? <p className="mt-2 text-sm text-rose-300">{error}</p> : null}
          </RaSection>

          <MetricChart
            title="Average score"
            data={scoreChart}
            dataKey="averageScore"
            color="#38bdf8"
            yDomain={scoreDomain}
            yDigits={1}
            heightClass="h-80"
            area
            referenceY={scorePeriodAvg}
          />
          <MetricChart
            title="Positive %"
            data={dailyChart}
            dataKey="positivePct"
            color="#34d399"
            yDomain={[0, 100]}
            yDigits={0}
            unit="%"
          />
          <MetricChart
            title="Negative %"
            data={dailyChart}
            dataKey="negativePct"
            color="#fb7185"
            yDomain={[0, 100]}
            yDigits={0}
            unit="%"
          />

          <div className="grid gap-4 lg:grid-cols-2">
            <RaSection title="Weekly">
              <ul className="max-h-64 space-y-2 overflow-auto text-sm text-white">
                {weekly.length === 0 ? (
                  <li className="text-sidebar-muted">No weekly rows in this period.</li>
                ) : (
                  weekly.map((w) => (
                    <li
                      key={`${w.year}-W${w.week}`}
                      className="flex justify-between border-b border-sidebar-border/30 py-1"
                    >
                      <span>
                        {String(w.year)}-W{String(w.week).padStart(2, '0')}
                      </span>
                      <span className="text-sidebar-muted">
                        {round1(Number(w.averageScore)).toFixed(1)} · +
                        {round0(Number(w.positivePct))}% / −{round0(Number(w.negativePct))}% ·{' '}
                        {String(w.reviewCount)} reviews
                      </span>
                    </li>
                  ))
                )}
              </ul>
            </RaSection>
            <RaSection title="Monthly + category scores">
              <ul className="max-h-64 space-y-2 overflow-auto text-sm text-white">
                {monthly.length === 0 ? (
                  <li className="text-sidebar-muted">No monthly rows in this period.</li>
                ) : (
                  monthly.map((m) => (
                    <li key={`${m.year}-${m.month}`} className="border-b border-sidebar-border/30 py-1">
                      <div className="flex justify-between">
                        <span>
                          {String(m.year)}-{String(m.month).padStart(2, '0')}
                        </span>
                        <span className="text-sidebar-muted">
                          {round1(Number(m.averageScore)).toFixed(1)} · +
                          {round0(Number(m.positivePct))}% / −{round0(Number(m.negativePct))}%
                        </span>
                      </div>
                    </li>
                  ))
                )}
                {scores.slice(-6).map((s, i) => (
                  <li key={i} className="text-xs text-sidebar-muted">
                    Categories {String(s.year)}-{String(s.month)}:{' '}
                    {Object.entries((s.categoryScores as Record<string, number>) ?? {})
                      .map(([k, v]) => `${k} ${round1(Number(v)).toFixed(1)}`)
                      .join(', ') || '—'}
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
