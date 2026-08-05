'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { PublicAreaDto, PublicAreaKind } from '@housekeeping/shared';
import { formatFloorLabel } from '@housekeeping/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { AppPageChrome, AppPageBody, APP_DARK_CARD, APP_DARK_INPUT } from '@/components/nav/AppPageChrome';
import { AppChromeTools } from '@/components/nav/AppChromeTools';
import { useSupervisorMobileMode } from '@/lib/supervisor-mobile-context';

const KINDS: PublicAreaKind[] = ['corridor', 'glass', 'elevator', 'staff', 'custom'];

const FREQUENCY_OPTIONS = [
  { value: 1, label: 'Every day' },
  { value: 2, label: 'Every 2 days' },
  { value: 3, label: 'Every 3 days' },
  { value: 7, label: 'Every week' },
];

export default function PublicAreasPage() {
  const qc = useQueryClient();
  const { enterMobile } = useSupervisorMobileMode();
  const { data: areas = [], isLoading, error } = useQuery({
    queryKey: ['public-areas'],
    queryFn: () => api<PublicAreaDto[]>('/public-areas'),
  });

  const [name, setName] = useState('');
  const [kind, setKind] = useState<PublicAreaKind>('corridor');
  const [floor, setFloor] = useState('');
  const [frequencyDays, setFrequencyDays] = useState(1);

  const sync = useMutation({
    mutationFn: () =>
      api<{ created: number; skipped: number }>('/public-areas/sync-floor-plans', {
        method: 'POST',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['public-areas'] }),
  });

  const create = useMutation({
    mutationFn: () =>
      api('/public-areas', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          kind,
          floor: floor.trim() ? Number(floor) : null,
          frequencyDays,
        }),
      }),
    onSuccess: () => {
      setName('');
      qc.invalidateQueries({ queryKey: ['public-areas'] });
    },
  });

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api(`/public-areas/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['public-areas'] }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/public-areas/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['public-areas'] }),
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AppPageChrome
        title="Public areas"
        description="Set how often corridors, glass, elevators, and staff areas must be cleaned. Due items are included in the daily auto-assignment."
        actions={<AppChromeTools onEnterMobile={enterMobile} />}
      />

      <AppPageBody>
        <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              className="border border-sidebar-border bg-transparent text-white hover:bg-white/10"
              disabled={sync.isPending}
              onClick={() => sync.mutate()}
            >
              {sync.isPending ? 'Syncing…' : 'Sync from floor plans'}
            </Button>
            {sync.data && (
              <p className="self-center text-sm text-sidebar-muted">
                Created {sync.data.created}, skipped {sync.data.skipped}
              </p>
            )}
          </div>

          <div className={APP_DARK_CARD + ' space-y-3 p-5'}>
            <h2 className="text-sm font-semibold text-white">Add public area</h2>
            <div className="flex flex-wrap gap-2">
              <input
                className={APP_DARK_INPUT + ' min-h-[44px] min-w-[160px] flex-1'}
                placeholder="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <select
                className={APP_DARK_INPUT + ' min-h-[44px]'}
                value={kind}
                onChange={(e) => setKind(e.target.value as PublicAreaKind)}
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
              <input
                className={APP_DARK_INPUT + ' min-h-[44px] w-24'}
                placeholder="Floor"
                value={floor}
                onChange={(e) => setFloor(e.target.value)}
              />
              <select
                className={APP_DARK_INPUT + ' min-h-[44px]'}
                value={frequencyDays}
                onChange={(e) => setFrequencyDays(Number(e.target.value))}
              >
                {FREQUENCY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <Button
                variant="action"
                disabled={!name.trim() || create.isPending}
                onClick={() => create.mutate()}
              >
                Add
              </Button>
            </div>
          </div>

          {isLoading && <p className="text-sm text-sidebar-muted">Loading…</p>}
          {error && <p className="text-sm text-red-400">Could not load public areas.</p>}

          <ul className="space-y-3">
            {areas.map((a) => (
              <li key={a.id}>
                <div className={APP_DARK_CARD + ' flex flex-wrap items-center gap-3 p-4'}>
                  <div className="min-w-[140px] flex-1">
                    <p className="font-semibold text-white">{a.name}</p>
                    <p className="text-xs text-sidebar-muted">
                      {a.kind}
                      {a.floor != null ? ` · ${formatFloorLabel(a.floor)}` : ''}
                      {a.isDueToday ? ' · due today' : ''}
                      {!a.isActive ? ' · inactive' : ''}
                    </p>
                  </div>
                  <select
                    className={APP_DARK_INPUT + ' min-h-[44px]'}
                    value={a.frequencyDays}
                    onChange={(e) =>
                      patch.mutate({ id: a.id, body: { frequencyDays: Number(e.target.value) } })
                    }
                  >
                    {FREQUENCY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                    {!FREQUENCY_OPTIONS.some((o) => o.value === a.frequencyDays) && (
                      <option value={a.frequencyDays}>Every {a.frequencyDays} days</option>
                    )}
                  </select>
                  <Button
                    variant="ghost"
                    className="text-sidebar-muted hover:bg-white/10 hover:text-white"
                    onClick={() => patch.mutate({ id: a.id, body: { isActive: !a.isActive } })}
                  >
                    {a.isActive ? 'Deactivate' : 'Activate'}
                  </Button>
                  <Button
                    variant="ghost"
                    className="text-sidebar-muted hover:bg-white/10 hover:text-white"
                    onClick={() => remove.mutate(a.id)}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          {!isLoading && areas.length === 0 && (
            <p className="text-sm text-sidebar-muted">
              No public areas yet. Sync from floor plans or add manually.
            </p>
          )}
        </div>
      </AppPageBody>
    </div>
  );
}
