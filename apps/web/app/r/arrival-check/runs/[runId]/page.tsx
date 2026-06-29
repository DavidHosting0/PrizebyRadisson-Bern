'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import type { ArrivalCheckRunDetail } from '@housekeeping/shared';
import { api } from '@/lib/api';
import { useAuth, usePermission } from '@/lib/auth-context';
import { getFirstAllowedPath, RECEPTION_NAV } from '@/lib/permission-routes';
import { ArrivalCheckRunView } from '@/components/reception/ArrivalCheckRunView';
import { isRunActive } from '@/components/reception/arrival-check-run-utils';

export default function ArrivalCheckRunPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading } = useAuth();
  const canArrivalCheck = usePermission('ARRIVAL_CHECK');
  const runId = String(params.runId ?? '');
  const queryClient = useQueryClient();

  const cancelMut = useMutation({
    mutationFn: () =>
      api<ArrivalCheckRunDetail>(`/arrival-check/runs/${runId}/cancel`, { method: 'POST' }),
    onSuccess: (data) => {
      queryClient.setQueryData(['arrival-check', 'run', runId], data);
    },
  });

  const retryFailedMut = useMutation({
    mutationFn: () =>
      api<ArrivalCheckRunDetail>(`/arrival-check/runs/${runId}/retry-failed`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['arrival-check', 'run', runId], data);
    },
  });

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    else if (!canArrivalCheck) router.replace(getFirstAllowedPath(user, RECEPTION_NAV) ?? '/login');
  }, [user, loading, canArrivalCheck, router]);

  const runQuery = useQuery({
    queryKey: ['arrival-check', 'run', runId],
    queryFn: () => api<ArrivalCheckRunDetail>(`/arrival-check/runs/${runId}`),
    enabled: !!runId && canArrivalCheck,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchInterval: (query) =>
      isRunActive(query.state.data as ArrivalCheckRunDetail | undefined) ? 1000 : false,
  });

  const run = runQuery.data;

  if (loading || !user || !canArrivalCheck) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-sm text-ink-muted">Lädt…</p>
      </div>
    );
  }

  if (runQuery.isLoading && !run) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center gap-6 p-6">
        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-ink/20" />
        </div>
        <p className="text-sm text-ink-muted">Anreise-Check wird geladen…</p>
      </div>
    );
  }

  if (runQuery.isError || !run) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-6">
        <p className="text-sm text-danger">
          {(runQuery.error as Error)?.message ?? 'Lauf nicht gefunden.'}
        </p>
        <button
          type="button"
          onClick={() => router.push('/r/arrival-check')}
          className="text-sm font-medium text-ink underline"
        >
          Zurück zur Auswahl
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10">
      <ArrivalCheckRunView
        run={run}
        onBack={() => router.push('/r/arrival-check')}
        onCancel={() => cancelMut.mutate()}
        cancelPending={cancelMut.isPending}
        cancelError={cancelMut.isError ? (cancelMut.error as Error).message : null}
        onRetryFailed={() => retryFailedMut.mutate()}
        retryFailedPending={retryFailedMut.isPending}
        retryFailedError={
          retryFailedMut.isError ? (retryFailedMut.error as Error).message : null
        }
      />
    </div>
  );
}
