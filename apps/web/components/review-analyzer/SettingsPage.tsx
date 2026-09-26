'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AppPageChrome, AppPageBody } from '@/components/nav/AppPageChrome';
import { AppChromeTools } from '@/components/nav/AppChromeTools';
import { useReceptionMobileMode } from '@/lib/reception-mobile-context';
import { Button } from '@/components/ui/Button';
import { reviewApi } from '@/lib/review-analyzer-api';

export function SettingsPage() {
  const tNav = useTranslations('nav');
  const { enterMobile } = useReceptionMobileMode();
  const [form, setForm] = useState<Record<string, unknown> | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    void reviewApi
      .settings()
      .then(setForm)
      .catch((e) => setMsg((e as Error).message));
  }, []);

  if (!form) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <AppPageChrome title={tNav('reviewAnalyzerSettings')} actions={<AppChromeTools onEnterMobile={enterMobile} />} />
        <AppPageBody>
          <p className="p-6 text-sm text-sidebar-muted">{msg ?? 'Loading…'}</p>
        </AppPageBody>
      </div>
    );
  }

  const set = (key: string, value: unknown) => setForm({ ...form, [key]: value });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AppPageChrome title={tNav('reviewAnalyzerSettings')} actions={<AppChromeTools onEnterMobile={enterMobile} />} />
      <AppPageBody>
        <div className="max-w-xl space-y-4 p-4 md:p-6">
          <p className="text-xs text-sidebar-muted">
            Admin only. AI model is configured under Admin → AI (global OpenAI settings).
          </p>
          <label className="block text-sm text-white">
            <span className="text-xs text-sidebar-muted">Enabled</span>
            <input
              type="checkbox"
              className="ml-2"
              checked={!!form.enabled}
              onChange={(e) => set('enabled', e.target.checked)}
            />
          </label>
          <label className="block text-sm text-white">
            <span className="text-xs text-sidebar-muted">Booking URL</span>
            <input
              className="mt-1 w-full rounded-btn border border-sidebar-border bg-transparent px-3 py-2"
              value={String(form.bookingUrl ?? '')}
              onChange={(e) => set('bookingUrl', e.target.value)}
            />
          </label>
          <label className="block text-sm text-white">
            <span className="text-xs text-sidebar-muted">Historical months</span>
            <input
              type="number"
              className="mt-1 w-full rounded-btn border border-sidebar-border bg-transparent px-3 py-2"
              value={Number(form.historicalMonths ?? 24)}
              onChange={(e) => set('historicalMonths', Number(e.target.value))}
            />
          </label>
          <label className="block text-sm text-white">
            <span className="text-xs text-sidebar-muted">Score drop threshold</span>
            <input
              type="number"
              step="0.1"
              className="mt-1 w-full rounded-btn border border-sidebar-border bg-transparent px-3 py-2"
              value={Number(form.scoreDropThreshold ?? 0.5)}
              onChange={(e) => set('scoreDropThreshold', Number(e.target.value))}
            />
          </label>
          <label className="block text-sm text-white">
            <span className="text-xs text-sidebar-muted">Topic spike multiplier</span>
            <input
              type="number"
              step="0.1"
              className="mt-1 w-full rounded-btn border border-sidebar-border bg-transparent px-3 py-2"
              value={Number(form.topicSpikeMultiplier ?? 2)}
              onChange={(e) => set('topicSpikeMultiplier', Number(e.target.value))}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={async () => {
                await reviewApi.updateSettings(form);
                setMsg('Saved');
              }}
            >
              Save
            </Button>
            <Button
              variant="secondary"
              onClick={async () => {
                await reviewApi.importNow('historical');
                setMsg('Historical import started');
              }}
            >
              Historical import (24 months)
            </Button>
            <Button
              variant="secondary"
              onClick={async () => {
                await reviewApi.analyze();
                setMsg('Analyze queued');
              }}
            >
              Analyze pending
            </Button>
            <Button
              variant="secondary"
              onClick={async () => {
                await reviewApi.recompute();
                setMsg('Recompute started');
              }}
            >
              Recompute metrics
            </Button>
          </div>
          {msg ? <p className="text-sm text-emerald-300">{msg}</p> : null}
        </div>
      </AppPageBody>
    </div>
  );
}
