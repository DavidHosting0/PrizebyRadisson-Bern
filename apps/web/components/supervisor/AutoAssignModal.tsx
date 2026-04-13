'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { formatUserWithTitlePrefix } from '@/lib/userTitlePrefix';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

type Hk = { id: string; name: string; email: string; titlePrefix: string };

type SuggestionsRes = {
  dirtyRooms: number;
  suggestions: { roomId: string; roomNumber: string; suggestedHousekeeperId: string }[];
};

export function AutoAssignModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: housekeepers } = useQuery({
    queryKey: ['housekeepers'],
    queryFn: () => api<Hk[]>('/users/housekeepers'),
    enabled: open,
  });

  const suggestionsQ = useQuery({
    queryKey: ['assignments', 'suggestions'],
    queryFn: () => api<SuggestionsRes>('/assignments/suggestions', { method: 'POST' }),
    enabled: open,
  });

  const [overrides, setOverrides] = useState<Record<string, string>>({});

  const rows = suggestionsQ.data?.suggestions ?? [];
  const hkById = useMemo(() => Object.fromEntries((housekeepers ?? []).map((h) => [h.id, h])), [housekeepers]);

  const assignOne = useMutation({
    mutationFn: ({ roomId, housekeeperUserId }: { roomId: string; housekeeperUserId: string }) =>
      api('/assignments', { method: 'POST', body: JSON.stringify({ roomId, housekeeperUserId }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assignments'] }),
  });

  const runAuto = useMutation({
    mutationFn: () => api<{ assigned: number }>('/assignments/run-auto', { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assignments'] });
      qc.invalidateQueries({ queryKey: ['rooms'] });
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
            Auto-assign rooms
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            Suggested pairings balance workload. Adjust staff per room, then confirm — or run the automated job.
          </p>
        </div>
        <div className="space-y-4 p-6">
          {suggestionsQ.isLoading && <p className="text-sm text-ink-muted">Loading suggestions…</p>}
          {suggestionsQ.data && (
            <p className="text-sm text-ink-muted">
              <span className="font-medium text-ink">{suggestionsQ.data.dirtyRooms}</span> unassigned dirty rooms
              · {rows.length} suggestions
            </p>
          )}
          <div className="space-y-2">
            {rows.map((row) => (
              <Card key={row.roomId} className="flex flex-wrap items-center gap-3">
                <div className="min-w-[100px] font-semibold text-ink">Room {row.roomNumber}</div>
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
                <span className="text-xs text-ink-muted">Workload balancing</span>
              </Card>
            ))}
          </div>
          {rows.length === 0 && !suggestionsQ.isLoading && suggestionsQ.data && (
            <p className="text-sm text-ink-muted">No suggestions — no dirty unassigned rooms.</p>
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
