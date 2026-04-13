'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { damageTypeLabel } from '@/lib/damageReportTypes';
import { formatUserWithTitlePrefix } from '@/lib/userTitlePrefix';
import { usePermission } from '@/lib/auth-context';
import { Card } from '@/components/ui/Card';

type Row = {
  id: string;
  damageType: string;
  description: string;
  status: string;
  reportedAt: string;
  photoUrl: string;
  room: { roomNumber: string };
  reportedBy: { name: string; titlePrefix: string };
};

const STATUSES = ['REPORTED', 'ACKNOWLEDGED', 'RESOLVED'];

export default function SupervisorDamageReportsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const canUpdate = usePermission('DAMAGE_REPORT_UPDATE');

  const { data = [], isLoading } = useQuery({
    queryKey: ['damage-reports', status],
    queryFn: () => {
      const q = status ? `?status=${encodeURIComponent(status)}` : '';
      return api<Row[]>(`/damage-reports${q}`);
    },
  });

  const patchStatus = useMutation({
    mutationFn: ({ id, next }: { id: string; next: string }) =>
      api(`/damage-reports/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['damage-reports'] }),
  });

  return (
    <div className="space-y-8 p-4 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink md:text-3xl">Damage reports</h1>
          <p className="mt-1 text-sm text-ink-muted">Review and update status</p>
        </div>
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-ink-muted">Filter by status</label>
          <select
            className="mt-1 min-h-[44px] min-w-[160px] rounded-btn border border-border bg-surface px-3 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0) + s.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading && <p className="text-sm text-ink-muted">Loading…</p>}

      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {data.map((item) => (
          <li key={item.id}>
            <Card className="h-full overflow-hidden p-0">
              <div className="aspect-[4/3] bg-surface-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.photoUrl} alt="" className="h-full w-full object-cover" />
              </div>
              <div className="p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{damageTypeLabel(item.damageType)}</p>
                <p className="mt-1 font-medium leading-snug text-ink">{item.description}</p>
                <p className="mt-2 text-sm text-ink-muted">
                  Room {item.room.roomNumber} ·{' '}
                  {formatUserWithTitlePrefix(item.reportedBy.name, item.reportedBy.titlePrefix)} ·{' '}
                  {new Date(item.reportedAt).toLocaleString()}
                </p>
                {canUpdate ? (
                  <select
                    className="mt-3 min-h-[40px] w-full rounded-btn border border-border bg-surface px-2 text-sm"
                    value={item.status}
                    disabled={patchStatus.isPending}
                    onChange={(e) => patchStatus.mutate({ id: item.id, next: e.target.value })}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s.charAt(0) + s.slice(1).toLowerCase()}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="mt-3 inline-flex rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium capitalize text-ink-muted">
                    {item.status.toLowerCase()}
                  </span>
                )}
              </div>
            </Card>
          </li>
        ))}
      </ul>
      {data.length === 0 && !isLoading && <p className="text-sm text-ink-muted">No reports.</p>}
    </div>
  );
}
