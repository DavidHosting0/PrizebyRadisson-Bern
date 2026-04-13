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

export default function TechnicianMaintenancePage() {
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
    <div className="flex min-h-0 flex-1 flex-col space-y-4 p-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Maintenance</h1>
        <p className="mt-1 text-sm text-ink-muted">Room damage reports from housekeeping.</p>
      </div>
      <div>
        <label className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Status</label>
        <select
          className="mt-1 min-h-[44px] w-full rounded-btn border border-border bg-surface px-3 text-sm"
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

      {isLoading && <p className="text-sm text-ink-muted">Loading…</p>}

      <ul className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-2">
        {data.map((item) => (
          <li key={item.id}>
            <Card className="overflow-hidden p-0">
              <div className="aspect-[16/10] bg-surface-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.photoUrl} alt="" className="h-full w-full object-cover" />
              </div>
              <div className="p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                  {damageTypeLabel(item.damageType)}
                </p>
                <p className="mt-1 text-sm font-medium leading-snug text-ink">{item.description}</p>
                <p className="mt-2 text-xs text-ink-muted">
                  Room {item.room.roomNumber} · {formatUserWithTitlePrefix(item.reportedBy.name, item.reportedBy.titlePrefix)} ·{' '}
                  {new Date(item.reportedAt).toLocaleString()}
                </p>
                {canUpdate ? (
                  <select
                    className="mt-3 min-h-[44px] w-full rounded-btn border border-border bg-surface px-2 text-sm"
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
      {data.length === 0 && !isLoading && <p className="text-sm text-ink-muted">No damage reports.</p>}
    </div>
  );
}
