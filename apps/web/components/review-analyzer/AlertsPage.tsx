'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AppPageChrome, AppPageBody } from '@/components/nav/AppPageChrome';
import { AppChromeTools } from '@/components/nav/AppChromeTools';
import { useReceptionMobileMode } from '@/lib/reception-mobile-context';
import { Button } from '@/components/ui/Button';
import { reviewApi } from '@/lib/review-analyzer-api';
import { RaBadge, priorityTone } from './RaUi';

export function AlertsPage() {
  const tNav = useTranslations('nav');
  const { enterMobile } = useReceptionMobileMode();
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);

  const load = () => reviewApi.alerts(true).then(setRows).catch(() => setRows([]));

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AppPageChrome title={tNav('reviewAnalyzerAlerts')} actions={<AppChromeTools onEnterMobile={enterMobile} />} />
      <AppPageBody>
        <div className="space-y-3 p-4 md:p-6">
          {rows.map((a) => (
            <div
              key={String(a.id)}
              className="rounded-card border border-sidebar-border/60 px-4 py-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <RaBadge tone={priorityTone(String(a.severity))}>{String(a.severity)}</RaBadge>
                  <p className="text-sm font-semibold text-white">{String(a.title)}</p>
                </div>
                {!a.acknowledgedAt ? (
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      await reviewApi.ackAlert(String(a.id));
                      await load();
                    }}
                  >
                    Acknowledge
                  </Button>
                ) : (
                  <span className="text-xs text-sidebar-muted">Acknowledged</span>
                )}
              </div>
              <p className="mt-2 text-sm text-sidebar-muted">{String(a.message)}</p>
              <p className="mt-1 text-[11px] text-sidebar-muted">
                {new Date(String(a.createdAt)).toLocaleString()} · {String(a.type)}
              </p>
            </div>
          ))}
          {!rows.length ? <p className="text-sm text-sidebar-muted">No alerts</p> : null}
        </div>
      </AppPageBody>
    </div>
  );
}
