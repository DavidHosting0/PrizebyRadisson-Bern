'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import type { AssignmentSuggestionsResponse } from '@housekeeping/shared';
import { formatFloorLabel } from '@housekeeping/shared';
import { api } from '@/lib/api';
import { formatUserWithTitlePrefix } from '@/lib/userTitlePrefix';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

type Hk = { id: string; name: string; email: string; titlePrefix: string };

function formatFloorRange(floors: number[]): string {
  if (!floors.length) return '—';
  if (floors.length === 1) return formatFloorLabel(floors[0]);
  const sorted = [...floors].sort((a, b) => a - b);
  return `${formatFloorLabel(sorted[0])} – ${formatFloorLabel(sorted[sorted.length - 1])}`;
}

export function AutoAssignModal({
  open,
  onClose,
  date,
}: {
  open: boolean;
  onClose: () => void;
  date?: string;
}) {
  const qc = useQueryClient();
  const dateParam = date?.trim() ? `?date=${encodeURIComponent(date.trim())}` : '';

  const { data: housekeepers } = useQuery({
    queryKey: ['housekeepers'],
    queryFn: () => api<Hk[]>('/users/housekeepers'),
    enabled: open,
  });

  const suggestionsQ = useQuery({
    queryKey: ['assignments', 'suggestions', date ?? 'today'],
    queryFn: () =>
      api<AssignmentSuggestionsResponse>(`/assignments/suggestions${dateParam}`, { method: 'POST' }),
    enabled: open,
  });

  const [overrides, setOverrides] = useState<Record<string, string>>({});

  const rows = suggestionsQ.data?.suggestions ?? [];
  const summaries = suggestionsQ.data?.summaries ?? [];
  const hkById = useMemo(() => Object.fromEntries((housekeepers ?? []).map((h) => [h.id, h])), [housekeepers]);

  const assignOne = useMutation({
    mutationFn: ({ roomId, housekeeperUserId }: { roomId: string; housekeeperUserId: string }) =>
      api('/assignments', { method: 'POST', body: JSON.stringify({ roomId, housekeeperUserId }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assignments'] }),
  });

  const runAuto = useMutation({
    mutationFn: () =>
      api<{ assigned: number }>(`/assignments/run-auto${dateParam}`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assignments'] });
      qc.invalidateQueries({ queryKey: ['rooms'] });
      qc.invalidateQueries({ queryKey: ['departures'] });
      onClose();
    },
  });

  async function confirmAll() {
    await Promise.all(
      rows.map(async (row) => {
        const hk = overrides[row.roomId] ?? row.suggestedHousekeeperId;
        if (!hk) return;
        await assignOne.mutateAsync({ roomId: row.roomId, housekeeperUserId: hk });
      }),
    );
    await qc.invalidateQueries({ queryKey: ['assignments'] });
    await qc.invalidateQueries({ queryKey: ['rooms'] });
    await qc.invalidateQueries({ queryKey: ['departures'] });
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center">
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-card border border-border bg-surface shadow-lift"
        role="dialog"
        aria-labelledby="auto-assign-title"
      >
        <div className="border-b border-border px-6 py-4">
          <h2 id="auto-assign-title" className="text-lg font-semibold text-ink">
            Auto-assign departures
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            Suggested pairings balance workload and keep cleaners on the same floors when possible.
            {date ? ` Date: ${date}.` : ''}
          </p>
        </div>
        <div className="space-y-4 p-6">
          {suggestionsQ.isLoading && <p className="text-sm text-ink-muted">Loading suggestions…</p>}
          {suggestionsQ.data && (
            <p className="text-sm text-ink-muted">
              <span className="font-medium text-ink">{suggestionsQ.data.departureRooms}</span> unassigned
              departure rooms · {rows.length} suggestions
            </p>
          )}

          {summaries.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {summaries.map((s) => {
                const hk = hkById[s.housekeeperId];
                return (
                  <Card key={s.housekeeperId} className="text-sm">
                    <p className="font-semibold text-ink">
                      {hk ? formatUserWithTitlePrefix(hk.name, hk.titlePrefix) : s.housekeeperId}
                    </p>
                    <p className="mt-1 text-ink-muted">
                      {s.count} rooms · {formatFloorRange(s.floors)}
                    </p>
                  </Card>
                );
              })}
            </div>
          )}

          <div className="space-y-2">
            {rows.map((row) => (
              <Card key={row.roomId} className="flex flex-wrap items-center gap-3">
                <div className="min-w-[100px]">
                  <p className="font-semibold text-ink">Room {row.roomNumber}</p>
                  {row.floor != null && (
                    <p className="text-xs text-ink-muted">{formatFloorLabel(row.floor)}</p>
                  )}
                </div>
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  <span className="text-xs text-ink-muted">Assign to</span>
                  <select
                    className="min-h-[44px] flex-1 min-w-[180px] rounded-btn border border-border bg-surface px-3 py-2 text-sm"
                    value={overrides[row.roomId] ?? row.suggestedHousekeeperId ?? ''}
                    onChange={(e) =>
                      setOverrides((o) => ({ ...o, [row.roomId]: e.target.value }))
                    }
                  >
                    {(housekeepers ?? []).map((h) => (
                      <option key={h.id} value={h.id}>
                        {formatUserWithTitlePrefix(h.name, h.titlePrefix)}
                      </option>
                    ))}
                  </select>
                </div>
              </Card>
            ))}
          </div>
          {rows.length === 0 && !suggestionsQ.isLoading && suggestionsQ.data && (
            <p className="text-sm text-ink-muted">No suggestions — no unassigned departure rooms.</p>
          )}
        </div>
        <div className="flex flex-wrap gap-3 border-t border-border bg-surface-muted/50 px-6 py-4">
          <Button
            variant="action"
            className="min-h-[48px]"
            disabled={assignOne.isPending || rows.length === 0}
            onClick={() => confirmAll()}
          >
            Confirm suggestions
          </Button>
          <Button
            variant="secondary"
            disabled={runAuto.isPending}
            onClick={() => runAuto.mutate()}
          >
            {runAuto.isPending ? 'Running…' : 'Run auto-assign job'}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
