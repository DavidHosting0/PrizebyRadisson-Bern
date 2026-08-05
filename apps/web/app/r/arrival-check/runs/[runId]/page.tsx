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
import { AppPageChrome, AppPageBody } from '@/components/nav/AppPageChrome';
import { AppChromeTools } from '@/components/nav/AppChromeTools';
import { useReceptionMobileMode } from '@/lib/reception-mobile-context';

export default function ArrivalCheckRunPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading } = useAuth();
  const canArrivalCheck = usePermission('ARRIVAL_CHECK');
  const runId = String(params.runId ?? '');
  const queryClient = useQueryClient();
  const { enterMobile } = useReceptionMobileMode();

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

  const continueMut = useMutation({
    mutationFn: () =>
      api<ArrivalCheckRunDetail>(`/arrival-check/runs/${runId}/execute`, {
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
      <div className="flex min-h-[50vh] items-center justify-center bg-[#121a26]">
        <p className="text-sm text-sidebar-muted">Lädt…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AppPageChrome title="Anreise-Check" actions={<AppChromeTools onEnterMobile={enterMobile} />} />
      <AppPageBody>
        <div className="p-4 md:p-6">
          {runQuery.isLoading && !run ? (
            <div className="flex min-h-[40vh] w-full flex-col justify-center gap-6">
              <div className="h-2 w-full max-w-md overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-1/3 animate-pulse rounded-full bg-indigo-400/40" />
              </div>
              <p className="text-sm text-sidebar-muted">Anreise-Check wird geladen…</p>
            </div>
          ) : runQuery.isError || !run ? (
            <div className="w-full space-y-4">
              <p className="text-sm text-rose-400">
                {(runQuery.error as Error)?.message ?? 'Lauf nicht gefunden.'}
              </p>
              <button
                type="button"
                onClick={() => router.push('/r/arrival-check')}
                className="text-sm font-medium text-white underline"
              >
                Zurück zur Auswahl
              </button>
            </div>
          ) : (
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
              onContinue={() => continueMut.mutate()}
              continuePending={continueMut.isPending}
              continueError={continueMut.isError ? (continueMut.error as Error).message : null}
            />
          )}
        </div>
      </AppPageBody>
    </div>
  );
}
