'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { useDamageTypeLabel } from '@/lib/damageReportTypes';
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

const STATUSES = ['REPORTED', 'ACKNOWLEDGED', 'RESOLVED'] as const;
const FILTERS = ['OPEN', ...STATUSES, 'ALL'] as const;

export default function TechnicianMaintenancePage() {
  const t = useTranslations('technician');
  const tPage = useTranslations('technician.maintenancePage');
  const tChat = useTranslations('chat');
  const damageLabel = useDamageTypeLabel();
  const qc = useQueryClient();
  const [status, setStatus] = useState<(typeof FILTERS)[number]>('OPEN');
  const canUpdate = usePermission('DAMAGE_REPORT_UPDATE');

  const { data = [], isLoading } = useQuery({
    queryKey: ['damage-reports', status],
    queryFn: () => {
      const q = status === 'ALL' ? '' : `?status=${encodeURIComponent(status)}`;
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

  function filterLabel(value: (typeof FILTERS)[number]) {
    if (value === 'OPEN') return tPage('filterOpen');
    if (value === 'ALL') return tPage('filterAll');
    if (value === 'REPORTED') return tPage('filterReported');
    if (value === 'ACKNOWLEDGED') return tPage('filterAcknowledged');
    if (value === 'RESOLVED') return tPage('filterResolved');
    return value;
  }

  function statusOptionLabel(value: string) {
    if (value === 'REPORTED') return tChat('damageStatus.reportedOption');
    if (value === 'ACKNOWLEDGED') return tChat('damageStatus.acknowledgedOption');
    if (value === 'RESOLVED') return tChat('damageStatus.resolvedOption');
    return value.charAt(0) + value.slice(1).toLowerCase();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col space-y-4 p-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-white">{t('maintenanceTitle')}</h1>
        <p className="mt-1 text-sm text-sidebar-muted">{tPage('description')}</p>
      </div>
      <div>
        <label className="text-[11px] font-semibold uppercase tracking-wide text-sidebar-muted">
          {tPage('statusLabel')}
        </label>
        <select
          className="mt-1 min-h-[44px] w-full rounded-btn border border-sidebar-border bg-sidebar px-3 text-sm text-white"
          value={status}
          onChange={(e) => setStatus(e.target.value as (typeof FILTERS)[number])}
        >
          {FILTERS.map((s) => (
            <option key={s} value={s}>
              {filterLabel(s)}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <p className="text-sm text-sidebar-muted">{tPage('loading')}</p>}

      <ul className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-2">
        {data.map((item) => (
          <li key={item.id}>
            <Card className="overflow-hidden border-sidebar-border/60 bg-[#1A2332] p-0 text-slate-100">
              <div className="aspect-[16/10] bg-sidebar">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.photoUrl} alt="" className="h-full w-full object-cover" />
              </div>
              <div className="p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {damageLabel(item.damageType)}
                </p>
                <p className="mt-1 text-sm font-medium leading-snug text-slate-100">{item.description}</p>
                <p className="mt-2 text-xs text-slate-400">
                  {tPage('roomLine', {
                    roomNumber: item.room.roomNumber,
                    reporter: formatUserWithTitlePrefix(
                      item.reportedBy.name,
                      item.reportedBy.titlePrefix,
                    ),
                    when: new Date(item.reportedAt).toLocaleString(),
                  })}
                </p>
                {canUpdate ? (
                  <select
                    className="mt-3 min-h-[44px] w-full rounded-btn border border-sidebar-border bg-sidebar px-2 text-sm text-white"
                    value={item.status}
                    disabled={patchStatus.isPending}
                    onChange={(e) => patchStatus.mutate({ id: item.id, next: e.target.value })}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {statusOptionLabel(s)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="mt-3 inline-flex rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-slate-300">
                    {statusOptionLabel(item.status)}
                  </span>
                )}
              </div>
            </Card>
          </li>
        ))}
      </ul>
      {data.length === 0 && !isLoading && (
        <p className="text-sm text-sidebar-muted">
          {status === 'OPEN' ? tPage('emptyOpen') : tPage('empty')}
        </p>
      )}
    </div>
  );
}
