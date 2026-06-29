'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import type { ArrivalCheckRunDetail, ArrivalCheckRunItem } from '@housekeeping/shared';
import { api } from '@/lib/api';
import { useAuth, usePermission } from '@/lib/auth-context';
import { getFirstAllowedPath, RECEPTION_NAV } from '@/lib/permission-routes';
import clsx from 'clsx';

function needsManual(item: ArrivalCheckRunItem): boolean {
  return item.status === 'NEEDS_MANUAL' || item.status === 'FAILED';
}

function isDeclinedVcc(item: ArrivalCheckRunItem): boolean {
  return item.paymentStatus === 'DECLINED';
}

function manualReasonText(item: ArrivalCheckRunItem): string {
  return item.manualReason ?? item.paymentError ?? item.error ?? 'Manuelle Prüfung erforderlich.';
}

/** True while the backend may still be processing — keep polling. */
function isRunActive(run: ArrivalCheckRunDetail | undefined): boolean {
  if (!run) return true;
  if (run.status === 'RUNNING') return true;
  if (run.items.some((i) => i.status === 'IN_PROGRESS')) return true;
  if (
    run.status !== 'COMPLETED' &&
    run.status !== 'FAILED' &&
    run.status !== 'CANCELLED' &&
    run.pendingCount > 0
  ) {
    return true;
  }
  return false;
}

function isRunFinished(run: ArrivalCheckRunDetail): boolean {
  return run.status === 'COMPLETED' || run.status === 'FAILED' || run.status === 'CANCELLED';
}

/** Progress 0–100 including partial credit for the reservation currently in progress. */
function computeProgressPct(run: ArrivalCheckRunDetail): number {
  if (run.itemCount === 0) return 0;
  const weight = 1 / run.itemCount;
  let total = 0;
  for (const item of run.items) {
    if (item.status === 'IN_PROGRESS') {
      total += weight * inProgressFraction(item);
    } else if (
      item.status === 'COMPLETED' ||
      item.status === 'SKIPPED' ||
      item.status === 'NEEDS_MANUAL' ||
      item.status === 'FAILED'
    ) {
      total += weight;
    }
  }
  return Math.min(100, Math.round(total * 100));
}

function inProgressFraction(item: ArrivalCheckRunItem): number {
  switch (item.currentStep) {
    case 'PREPAID_SETTLE':
      return 0.9;
    case 'CHARGE_ASSIGN':
      if (item.movesPlanned > 0) {
        return 0.25 + (0.55 * item.movesDone) / item.movesPlanned;
      }
      return 0.45;
    case 'FOLIO_LOAD':
      return 0.12;
    default:
      return 0.08;
  }
}

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
    refetchInterval: (query) => (isRunActive(query.state.data as ArrivalCheckRunDetail | undefined) ? 1000 : false),
  });

  const run = runQuery.data;
  const active = run ? isRunActive(run) : true;
  const finished = run ? isRunFinished(run) : false;
  const progressPct = run ? computeProgressPct(run) : 0;

  const manualItems = useMemo(
    () => (run ? run.items.filter(needsManual) : []),
    [run],
  );

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
        <Link href="/r/arrival-check" className="text-sm font-medium text-ink underline">
          Zurück zur Auswahl
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6 md:p-10">
      <header className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => router.push('/r/arrival-check')}
          className="text-sm text-ink-muted hover:text-ink"
        >
          ← Zurück
        </button>
        {active && run.status === 'RUNNING' && (
          <button
            type="button"
            onClick={() => cancelMut.mutate()}
            disabled={cancelMut.isPending}
            className="text-sm text-rose-700 hover:text-rose-900 disabled:opacity-50"
          >
            {cancelMut.isPending ? 'Wird abgebrochen…' : 'Abbrechen'}
          </button>
        )}
      </header>

      {active && (
        <section className="space-y-6 py-8">
          <div className="text-center">
            <h1 className="text-xl font-semibold text-ink">Anreise-Check läuft</h1>
            <p className="mt-1 text-sm text-ink-muted">
              {run.itemCount} Reservierung{run.itemCount === 1 ? '' : 'en'}
            </p>
          </div>

          <div className="space-y-3">
            <div className="h-3 w-full overflow-hidden rounded-full bg-surface-muted">
              <div
                className="h-full rounded-full bg-ink transition-[width] duration-700 ease-out"
                style={{ width: `${Math.max(progressPct, 2)}%` }}
              />
            </div>
            <p className="text-center text-sm tabular-nums text-ink-muted">{progressPct}%</p>
          </div>
        </section>
      )}

      {finished && (
        <section className="space-y-6">
          <div className="text-center">
            <h1 className="text-xl font-semibold text-ink">
              {run.status === 'CANCELLED'
                ? 'Anreise-Check abgebrochen'
                : manualItems.length > 0
                  ? 'Anreise-Check abgeschlossen'
                  : 'Alles erledigt'}
            </h1>
            {run.status !== 'CANCELLED' && manualItems.length === 0 && (
              <p className="mt-2 text-sm text-ink-muted">
                {run.completedCount > 0 && (
                  <span>
                    {run.completedCount} erfolgreich
                    {run.paidCount > 0 ? ` · ${run.paidCount} VCC belastet` : ''}
                  </span>
                )}
                {run.skippedCount > 0 && (
                  <span>
                    {run.completedCount > 0 ? ' · ' : ''}
                    {run.skippedCount} übersprungen
                  </span>
                )}
              </p>
            )}
            {run.status === 'CANCELLED' && (
              <p className="mt-2 text-sm text-ink-muted">
                Ausstehende Reservierungen wurden nicht verarbeitet.
              </p>
            )}
          </div>

          {manualItems.length > 0 ? (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-ink">
                Manuelle Bearbeitung nötig ({manualItems.length})
              </h2>
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
                {manualItems.map((item) => (
                  <li key={item.id} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-ink">
                          {item.mainGuestName ?? '—'}
                          {item.roomId && (
                            <span className="ml-2 font-normal text-ink-muted">
                              Zi. {item.roomId}
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 text-xs tabular-nums text-ink-muted">
                          {item.reservationId}
                        </p>
                        <p
                          className={clsx(
                            'mt-2 text-sm',
                            isDeclinedVcc(item) ? 'text-rose-800' : 'text-orange-800',
                          )}
                        >
                          {manualReasonText(item)}
                        </p>
                        {isDeclinedVcc(item) && (
                          <span className="mt-1 inline-block rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-900">
                            VCC abgelehnt
                          </span>
                        )}
                      </div>
                      <Link
                        href={`/r/reservations/${item.reservationId}?from=arrivals`}
                        className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-muted"
                      >
                        Öffnen
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            run.status !== 'CANCELLED' && (
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm text-emerald-900">
                Keine manuelle Nachbearbeitung nötig.
              </p>
            )
          )}

          {cancelMut.isError && (
            <p className="text-sm text-rose-700">{(cancelMut.error as Error).message}</p>
          )}
        </section>
      )}

      {!active && !finished && (
        <section className="space-y-4 py-8 text-center">
          <p className="text-sm text-ink-muted">Warte auf Start…</p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
            <div className="h-full w-1/4 animate-pulse rounded-full bg-ink/20" />
          </div>
        </section>
      )}
    </div>
  );
}
