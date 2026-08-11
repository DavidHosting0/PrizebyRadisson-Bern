'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { useDamageTypeLabel } from '@/lib/damageReportTypes';
import { formatUserWithTitlePrefix } from '@/lib/userTitlePrefix';
import { usePermission } from '@/lib/auth-context';
import { AppPageChrome, AppPageBody, APP_DARK_CARD, APP_DARK_INPUT } from '@/components/nav/AppPageChrome';
import { AppChromeTools } from '@/components/nav/AppChromeTools';
import { useReceptionMobileMode } from '@/lib/reception-mobile-context';

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

function damageStatusOptionLabel(
  status: string,
  t: ReturnType<typeof useTranslations<'chat'>>,
): string {
  if (status === 'REPORTED') return t('damageStatus.reportedOption');
  if (status === 'ACKNOWLEDGED') return t('damageStatus.acknowledgedOption');
  if (status === 'RESOLVED') return t('damageStatus.resolvedOption');
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export default function ReceptionDamageReportsPage() {
  const tNav = useTranslations('nav');
  const t = useTranslations('reception.damagesPage');
  const tCommon = useTranslations('common');
  const tChat = useTranslations('chat');
  const qc = useQueryClient();
  const damageLabel = useDamageTypeLabel();
  const [status, setStatus] = useState('');
  const canUpdate = usePermission('DAMAGE_REPORT_UPDATE');
  const { enterMobile } = useReceptionMobileMode();

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
    <div className="flex min-h-0 flex-1 flex-col">
      <AppPageChrome
        title={tNav('damageReports')}
        description={t('description')}
        actions={<AppChromeTools onEnterMobile={enterMobile} />}
        toolbar={
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-sidebar-muted">
              {t('filterByStatus')}
            </label>
            <select
              className={APP_DARK_INPUT + ' mt-1 min-h-[40px] min-w-[160px]'}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">{tCommon('all')}</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {damageStatusOptionLabel(s, tChat)}
                </option>
              ))}
            </select>
          </div>
        }
      />

      <AppPageBody>
        <div className="space-y-8 p-4 md:p-6">
          {isLoading && <p className="text-sm text-sidebar-muted">{t('loading')}</p>}

          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.map((item) => (
              <li key={item.id}>
                <div className={APP_DARK_CARD + ' h-full overflow-hidden'}>
                  <div className="aspect-[4/3] bg-black/20">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.photoUrl} alt="" className="h-full w-full object-cover" />
                  </div>
                  <div className="p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-sidebar-muted">
                      {damageLabel(item.damageType)}
                    </p>
                    <p className="mt-1 font-medium leading-snug text-white">{item.description}</p>
                    <p className="mt-2 text-sm text-sidebar-muted">
                      {t('roomLine', {
                        roomNumber: item.room.roomNumber,
                        reporter: formatUserWithTitlePrefix(item.reportedBy.name, item.reportedBy.titlePrefix),
                        when: new Date(item.reportedAt).toLocaleString(),
                      })}
                    </p>
                    {canUpdate ? (
                      <select
                        className={APP_DARK_INPUT + ' mt-3 min-h-[40px] w-full'}
                        value={item.status}
                        disabled={patchStatus.isPending}
                        onChange={(e) => patchStatus.mutate({ id: item.id, next: e.target.value })}
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {damageStatusOptionLabel(s, tChat)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="mt-3 inline-flex rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-sidebar-muted">
                        {damageStatusOptionLabel(item.status, tChat)}
                      </span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {data.length === 0 && !isLoading && <p className="text-sm text-sidebar-muted">{t('empty')}</p>}
        </div>
      </AppPageBody>
    </div>
  );
}
