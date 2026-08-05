'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ArrivalCheckRunDetail } from '@housekeeping/shared';
import { ArrivalCheckRunView } from '@/components/reception/ArrivalCheckRunView';
import { Button } from '@/components/ui/Button';
import {
  advanceMockRun,
  buildArrivalCheckMockRun,
  MOCK_PRESET_LABELS,
  startAnimatedMockRun,
  type ArrivalCheckMockPreset,
} from '@/lib/arrival-check-mock';
import { AppPageChrome, AppPageBody, APP_DARK_CARD } from '@/components/nav/AppPageChrome';
import { AppChromeTools } from '@/components/nav/AppChromeTools';

const PRESETS = Object.keys(MOCK_PRESET_LABELS) as ArrivalCheckMockPreset[];

export default function AdminArrivalCheckPreviewPage() {
  const [preset, setPreset] = useState<ArrivalCheckMockPreset>('running');
  const [itemCount, setItemCount] = useState(8);
  const [animate, setAnimate] = useState(false);
  const [run, setRun] = useState<ArrivalCheckRunDetail>(() =>
    buildArrivalCheckMockRun('running', 8),
  );

  const applyPreset = useCallback(
    (nextPreset: ArrivalCheckMockPreset, count = itemCount) => {
      setPreset(nextPreset);
      if (nextPreset === 'running') {
        setRun(startAnimatedMockRun(count));
        setAnimate(true);
      } else {
        setRun(buildArrivalCheckMockRun(nextPreset, count));
        setAnimate(false);
      }
    },
    [itemCount],
  );

  useEffect(() => {
    if (!animate || preset !== 'running') return;
    const timer = window.setInterval(() => {
      setRun((prev) => {
        const next = advanceMockRun(prev);
        if (next.status === 'COMPLETED') {
          window.setTimeout(() => setAnimate(false), 0);
        }
        return next;
      });
    }, 1400);
    return () => window.clearInterval(timer);
  }, [animate, preset]);

  function handleItemCountChange(count: number) {
    setItemCount(count);
    applyPreset(preset, count);
  }

  function handleStepForward() {
    setRun((prev) => advanceMockRun(prev));
  }

  function handleRestartAnimation() {
    setRun(startAnimatedMockRun(itemCount));
    setAnimate(true);
    setPreset('running');
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AppPageChrome
        title="Arrival Check Preview"
        description="Simulate the reception arrival-check run screen without waiting for real arrivals or starting an EMMA run."
        actions={<AppChromeTools />}
      />
      <AppPageBody>
        <div className="space-y-8 p-4 md:p-6">
      <div className="grid gap-8 xl:grid-cols-[minmax(0,340px)_1fr]">
        <div className={APP_DARK_CARD + ' h-fit space-y-5 p-5'}>
          <div>
            <h2 className="text-sm font-semibold text-white">Scenario</h2>
            <p className="mt-1 text-xs text-sidebar-muted">
              Pick a finished state or run the live animation.
            </p>
          </div>

          <div className="space-y-2">
            {PRESETS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => applyPreset(key)}
                className={`w-full rounded-lg border px-3 py-2.5 text-left text-sm transition ${
                  preset === key
                    ? 'border-action/40 bg-action/10 font-medium text-white ring-1 ring-action/20'
                    : 'border-sidebar-border text-sidebar-muted hover:bg-white/5 hover:text-white'
                }`}
              >
                {MOCK_PRESET_LABELS[key]}
              </button>
            ))}
          </div>

          <label className="block text-sm">
            <span className="font-medium text-white">Reservations in queue</span>
            <input
              type="range"
              min={3}
              max={12}
              value={itemCount}
              onChange={(e) => handleItemCountChange(Number(e.target.value))}
              className="mt-2 w-full"
            />
            <span className="mt-1 block text-xs tabular-nums text-sidebar-muted">{itemCount}</span>
          </label>

          <div className="flex flex-col gap-2 border-t border-sidebar-border/60 pt-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-white">
              <input
                type="checkbox"
                checked={animate}
                onChange={(e) => {
                  if (e.target.checked) {
                    handleRestartAnimation();
                  } else {
                    setAnimate(false);
                  }
                }}
                className="rounded border-sidebar-border"
              />
              Auto-advance animation
            </label>
            <Button
              type="button"
              variant="secondary"
              className="min-h-[40px] border border-sidebar-border bg-transparent text-white hover:bg-white/10"
              onClick={handleStepForward}
            >
              Step forward
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="min-h-[40px] border border-sidebar-border bg-transparent text-white hover:bg-white/10"
              onClick={handleRestartAnimation}
            >
              Restart animation
            </Button>
          </div>

          <p className="text-xs leading-relaxed text-sidebar-muted">
            The live reception page polls the API every second while a run is active. This preview
            uses mock data only — no EMMA calls.
          </p>
        </div>

        <div className="min-w-0">
          <ArrivalCheckRunView run={run} preview />
        </div>
      </div>
        </div>
      </AppPageBody>
    </div>
  );
}
