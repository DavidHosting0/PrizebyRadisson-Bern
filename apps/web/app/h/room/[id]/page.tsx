'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useState } from 'react';
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
      toast.push('Room marked clean', 'success');
      qc.invalidateQueries({ queryKey: ['room', id] });
    },
    onError: (e: Error) => toast.push(e.message || 'Could not mark room clean', 'warning'),
  });

  const canMarkClean =
    !!data &&
    !data.cleaningDeclaredAt &&
    data.derivedStatus !== 'INSPECTED' &&
    data.derivedStatus !== 'OUT_OF_ORDER';
  const isFinished = !!data?.cleaningDeclaredAt || data?.derivedStatus === 'INSPECTED';

  if (isLoading || !data) {
    return (
      <div className="p-4">
        <p className="text-sm text-ink-muted">Loading room…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center gap-3">
        <Link
          href="/h"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface text-ink shadow-card tap-scale"
          aria-label="Back to rooms"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Room {data.roomNumber}</h1>
          <div className="mt-1">
            <StatusBadge status={data.derivedStatus} />
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
          Report lost &amp; found
        </Button>
        {canReportDamage && (
          <Button
            type="button"
            variant="danger"
            className="min-h-[48px] border-0 bg-red-800 text-white shadow-sm hover:bg-red-900 hover:text-white sm:min-w-[200px]"
            onClick={() => setDamageOpen(true)}
          >
            Report damage
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

      {!isFinished && (
        <p className="text-center text-sm text-ink-muted">
          When you are done cleaning, mark the room clean. A supervisor will inspect and take photos.
        </p>
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
          ? 'Saving…'
          : isFinished
            ? 'Room already marked clean'
            : 'Mark room clean'}
      </Button>

      {isFinished && (
        <section className="rounded-card border border-success/30 bg-success-muted/50 p-4 text-center">
          <p className="font-medium text-ink">Room marked clean</p>
          <p className="mt-1 text-sm text-ink-muted">Waiting for supervisor inspection.</p>
        </section>
      )}
    </div>
  );
}
