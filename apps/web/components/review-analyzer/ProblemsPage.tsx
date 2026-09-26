'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AppPageChrome, AppPageBody } from '@/components/nav/AppPageChrome';
import { AppChromeTools } from '@/components/nav/AppChromeTools';
import { useReceptionMobileMode } from '@/lib/reception-mobile-context';
import { reviewApi, type GuestReviewRow } from '@/lib/review-analyzer-api';
import { RaBadge, priorityTone } from './RaUi';

export function ProblemsPage() {
  const tNav = useTranslations('nav');
  const { enterMobile } = useReceptionMobileMode();
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [reviews, setReviews] = useState<GuestReviewRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    void reviewApi.problems().then(setRows).catch(() => setRows([]));
  }, []);

  const open = async (id: string) => {
    setSelected(id);
    const res = await reviewApi.problemReviews(id);
    setReviews(res.items);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AppPageChrome title={tNav('reviewAnalyzerProblems')} actions={<AppChromeTools onEnterMobile={enterMobile} />} />
      <AppPageBody>
        <div className="grid gap-4 p-4 lg:grid-cols-2 md:p-6">
          <div className="overflow-auto rounded-card border border-sidebar-border/60">
            <table className="w-full text-left text-sm text-white">
              <thead className="bg-white/5 text-xs uppercase text-sidebar-muted">
                <tr>
                  <th className="px-3 py-2">Problem</th>
                  <th className="px-3 py-2">Mentions</th>
                  <th className="px-3 py-2">Neg %</th>
                  <th className="px-3 py-2">Trend</th>
                  <th className="px-3 py-2">Priority</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={String(r.id)}
                    className="cursor-pointer border-t border-sidebar-border/40 hover:bg-white/5"
                    onClick={() => void open(String(r.id))}
                  >
                    <td className="px-3 py-2">{String(r.title)}</td>
                    <td className="px-3 py-2 tabular-nums">{String(r.mentionCount)}</td>
                    <td className="px-3 py-2 tabular-nums">{Number(r.negativePct).toFixed(0)}%</td>
                    <td className="px-3 py-2 tabular-nums">
                      {r.trendPct == null ? '→' : `${Number(r.trendPct) > 0 ? '↑' : '↓'} ${Math.abs(Number(r.trendPct)).toFixed(0)}%`}
                    </td>
                    <td className="px-3 py-2">
                      <RaBadge tone={priorityTone(String(r.priority))}>{String(r.priority)}</RaBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length ? <p className="p-4 text-sm text-sidebar-muted">No clustered problems yet</p> : null}
          </div>
          <div className="rounded-card border border-sidebar-border/60 p-4">
            <h3 className="text-sm font-semibold text-white">
              {selected ? 'Linked reviews' : 'Select a problem'}
            </h3>
            {selected ? (
              <ul className="mt-3 space-y-3">
                {reviews.map((r) => (
                  <li key={r.id} className="border-t border-sidebar-border/40 pt-3 text-sm">
                    <div className="flex justify-between text-white">
                      <span>{r.score.toFixed(1)}</span>
                      <span className="text-xs text-sidebar-muted">
                        {new Date(r.reviewedAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-3 text-sidebar-muted">{r.fullText}</p>
                  </li>
                ))}
              </ul>
            ) : null}
            {selected && (rows.find((r) => r.id === selected) as { rootCauseHypothesis?: string; suggestedAction?: string } | undefined) ? (
              <div className="mt-4 space-y-2 text-xs text-sidebar-muted">
                <p>
                  {(rows.find((r) => r.id === selected) as { rootCauseHypothesis?: string }).rootCauseHypothesis}
                </p>
                <p>
                  {(rows.find((r) => r.id === selected) as { suggestedAction?: string }).suggestedAction}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </AppPageBody>
    </div>
  );
}
