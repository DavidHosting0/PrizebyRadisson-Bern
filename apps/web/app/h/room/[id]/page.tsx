'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/Button';
import { LostFoundReportModal } from '@/components/housekeeper/LostFoundReportModal';
import { DamageReportModal } from '@/components/housekeeper/DamageReportModal';
import { useToast } from '@/components/toast/ToastProvider';
import { usePermission } from '@/lib/auth-context';

type RoomDetail = {
  id: string;
  roomNumber: string;
  derivedStatus: string;
  cleaningDeclaredAt: string | null;
};

export default function RoomChecklistPage() {
  const t = useTranslations('housekeeper');
  const params = useParams();
  const id = params.id as string;
  const qc = useQueryClient();
  const [lostFoundOpen, setLostFoundOpen] = useState(false);
  const [damageOpen, setDamageOpen] = useState(false);
  const canReportDamage = usePermission('DAMAGE_REPORT_CREATE');
  const toast = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ['room', id],
    queryFn: () => api<RoomDetail>(`/rooms/${id}`),
  });

  const markClean = useMutation({
    mutationFn: () =>
      api<RoomDetail>(`/rooms/${id}/mark-clean`, {
        method: 'POST',
      }),
    onSuccess: () => {
      toast.push(t('toastMarkedClean'), 'success');
      qc.invalidateQueries({ queryKey: ['room', id] });
      qc.invalidateQueries({ queryKey: ['assignments', 'my-daily-tasks'] });
      qc.invalidateQueries({ queryKey: ['rooms'] });
    },
    onError: (e: Error) => toast.push(e.message || 'Could not mark room clean', 'warning'),
  });

  const { data: daily } = useQuery({
    queryKey: ['assignments', 'my-daily-tasks'],
    queryFn: () =>
      api<{ date: string; tasks: Array<{ roomId: string | null; workType: string; completedAt: string | null }> }>(
        '/assignments/my-daily-tasks',
      ),
  });

  const isRestantTask = (daily?.tasks ?? []).some(
    (task) => task.roomId === id && task.workType === 'RESTANT' && !task.completedAt,
  );

  const canMarkClean =
    !!data &&
    !isRestantTask &&
    !data.cleaningDeclaredAt &&
    data.derivedStatus !== 'INSPECTED' &&
    data.derivedStatus !== 'OUT_OF_ORDER';
  const isFinished = !!data?.cleaningDeclaredAt || data?.derivedStatus === 'INSPECTED';

  if (isLoading || !data) {
    return (
      <div className="p-4">
        <p className="text-sm text-sidebar-muted">{t('loadingRoom')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center gap-3">
        <Link
          href="/h"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-sidebar-border/70 bg-sidebar text-white tap-scale"
          aria-label={t('backToRooms')}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            {t('room', { number: data.roomNumber })}
          </h1>
          <div className="mt-1">
            <StatusBadge status={data.derivedStatus} variant="dark" />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Button
          type="button"
          variant="danger"
          className="min-h-[48px] border-0 bg-red-600 text-white shadow-sm hover:bg-red-700 hover:text-white sm:min-w-[200px]"
          onClick={() => setLostFoundOpen(true)}
        >
          {t('reportLostFound')}
        </Button>
        {canReportDamage && (
          <Button
            type="button"
            variant="danger"
            className="min-h-[48px] border-0 bg-red-800 text-white shadow-sm hover:bg-red-900 hover:text-white sm:min-w-[200px]"
            onClick={() => setDamageOpen(true)}
          >
            {t('reportDamage')}
          </Button>
        )}
      </div>

      <LostFoundReportModal
        open={lostFoundOpen}
        onClose={() => setLostFoundOpen(false)}
        roomId={data.id}
        roomNumber={data.roomNumber}
      />
      <DamageReportModal
        open={damageOpen}
        onClose={() => setDamageOpen(false)}
        roomId={data.id}
        roomNumber={data.roomNumber}
      />

      {isRestantTask ? (
        <section className="rounded-card border border-sidebar-border/70 bg-sidebar/40 p-4 text-center">
          <p className="font-medium text-white">{t('restant')}</p>
          <p className="mt-1 text-sm text-sidebar-muted">{t('restantHint')}</p>
          <Link
            href="/h"
            className="mt-3 inline-block text-sm font-medium text-action underline underline-offset-2"
          >
            {t('backToRooms')}
          </Link>
        </section>
      ) : (
        <>
          {!isFinished && (
            <p className="text-center text-sm text-sidebar-muted">{t('markCleanHint')}</p>
          )}

          <Button
            variant="primary"
            fullWidth
            className={`min-h-[52px] border-0 text-base font-semibold text-white ${
              canMarkClean ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-400/80 hover:bg-emerald-400/80'
            }`}
            disabled={!canMarkClean || markClean.isPending}
            onClick={() => markClean.mutate()}
          >
            {markClean.isPending
              ? t('saving')
              : isFinished
                ? t('alreadyMarkedClean')
                : t('fertigMarkClean')}
          </Button>

          {isFinished && (
            <section className="rounded-card border border-emerald-400/30 bg-emerald-500/15 p-4 text-center">
              <p className="font-medium text-emerald-100">{t('roomMarkedClean')}</p>
              <p className="mt-1 text-sm text-sidebar-muted">{t('waitingInspection')}</p>
            </section>
          )}
        </>
      )}
    </div>
  );
}
