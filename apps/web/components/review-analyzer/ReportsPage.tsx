'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AppPageChrome, AppPageBody } from '@/components/nav/AppPageChrome';
import { AppChromeTools } from '@/components/nav/AppChromeTools';
import { useReceptionMobileMode } from '@/lib/reception-mobile-context';
import { reviewApi } from '@/lib/review-analyzer-api';
import { RaSection } from './RaUi';

export function ReportsPage() {
  const tNav = useTranslations('nav');
  const { enterMobile } = useReceptionMobileMode();
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    void reviewApi.reports().then(setRows).catch(() => setRows([]));
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AppPageChrome title={tNav('reviewAnalyzerReports')} actions={<AppChromeTools onEnterMobile={enterMobile} />} />
      <AppPageBody>
        <div className="space-y-4 p-4 md:p-6">
          {rows.map((r) => (
            <RaSection key={String(r.id)} title={String(r.title)}>
              <p className="text-xs text-sidebar-muted">
                {String(r.periodType)} · {String(r.periodKey)}
              </p>
              <p className="mt-3 whitespace-pre-wrap text-sm text-white">{String(r.summaryEn)}</p>
            </RaSection>
          ))}
          {!rows.length ? <p className="text-sm text-sidebar-muted">No reports yet — run import + recompute.</p> : null}
        </div>
      </AppPageBody>
    </div>
  );
}
