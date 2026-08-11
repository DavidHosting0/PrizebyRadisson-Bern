'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { PriorityBadge } from '@/components/PriorityBadge';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/toast/ToastProvider';

type Req = {
  id: string;
  status: string;
  priority: string;
  room: { roomNumber: string };
  type: { label: string };
  claimedBy: { id: string; name: string; titlePrefix: string } | null;
};

export default function HousekeeperRequestsPage() {
  const t = useTranslations('housekeeper');
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ['service-requests'],
    queryFn: () => api<Req[]>('/service-requests'),
  });

  const resolve = useMutation({
    mutationFn: (id: string) =>
      api<Req>(`/service-requests/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'RESOLVED' }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-requests'] }),
    onError: (e: Error) => {
      try {
        const j = JSON.parse(e.message) as { message?: string | string[] };
        const msg = Array.isArray(j.message) ? j.message.join(', ') : j.message;
        toast.push(msg || e.message, 'warning');
      } catch {
        toast.push(e.message || 'Could not complete request', 'warning');
      }
    },
  });

  const claim = useMutation({
    mutationFn: (id: string) => api<Req>(`/service-requests/${id}/claim`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-requests'] }),
    onError: (e: Error) => {
      try {
        const j = JSON.parse(e.message) as { message?: string | string[] };
        const msg = Array.isArray(j.message) ? j.message.join(', ') : j.message;
        toast.push(msg || e.message, 'warning');
      } catch {
        toast.push(e.message || 'Could not claim request', 'warning');
      }
    },
  });

  if (isLoading) {
    return (
      <div className="p-4">
        <p className="text-sm text-sidebar-muted">{t('loadingRequests')}</p>
      </div>
    );
  }

  const rows = data ?? [];
  const open = rows.filter((r) => r.status === 'OPEN' || r.status === 'CREATED');
  const mine = rows.filter(
    (r) =>
      r.claimedBy?.id === user?.id &&
      (r.status === 'CLAIMED' || r.status === 'IN_PROGRESS'),
  );

  return (
    <div className="space-y-8 p-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-white">{t('requestsTitle')}</h1>
        <p className="mt-1 text-sm text-sidebar-muted">{t('requestsSubtitle')}</p>
      </div>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-sidebar-muted">{t('open')}</h2>
        <ul className="mt-3 space-y-3">
          {open.map((r) => (
            <li key={r.id}>
              <Card tone="dark">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-lg font-semibold text-white">
                      {t('room', { number: r.room.roomNumber })}
                    </p>
                    <p className="mt-1 text-sm text-sidebar-muted">{r.type.label}</p>
                    <div className="mt-2">
                      <PriorityBadge priority={r.priority} tone="dark" />
                    </div>
                  </div>
                  <Button
                    variant="action"
                    className="min-h-[48px] min-w-[96px]"
                    disabled={claim.isPending}
                    onClick={() => claim.mutate(r.id)}
                  >
                    {t('claim')}
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
        {open.length === 0 && (
          <p className="mt-2 text-sm text-sidebar-muted">{t('noOpenRequests')}</p>
        )}
      </section>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-sidebar-muted">
          {t('myActiveTasks')}
        </h2>
        <ul className="mt-3 space-y-3">
          {mine.map((r) => (
            <li key={r.id}>
              <Card tone="dark">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-lg font-semibold text-white">
                      {t('room', { number: r.room.roomNumber })}
                    </p>
                    <p className="mt-1 text-sm text-sidebar-muted">{r.type.label}</p>
                  </div>
                  <Button
                    variant="ghostOnDark"
                    disabled={resolve.isPending}
                    onClick={() => resolve.mutate(r.id)}
                  >
                    {t('markAsDone')}
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
        {mine.length === 0 && (
          <p className="mt-2 text-sm text-sidebar-muted">{t('noClaimedRequests')}</p>
        )}
      </section>
    </div>
  );
}
