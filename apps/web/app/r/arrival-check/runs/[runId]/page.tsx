'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ArrivalCheckItemStatus,
  ArrivalCheckRunDetail,
  ArrivalCheckRunStatus,
  ArrivalCheckStep,
} from '@housekeeping/shared';
import { api } from '@/lib/api';
import { useAuth, usePermission } from '@/lib/auth-context';
import clsx from 'clsx';

function runStatusLabel(status: ArrivalCheckRunStatus): string {
  switch (status) {
    case 'RUNNING':
      return 'Läuft';
    case 'COMPLETED':
      return 'Abgeschlossen';
    case 'FAILED':
      return 'Fehlgeschlagen';
    case 'CANCELLED':
      return 'Abgebrochen';
    default:
      return status;
  }
}

function itemStatusLabel(status: ArrivalCheckItemStatus): string {
  switch (status) {
    case 'PENDING':
      return 'Ausstehend';
    case 'IN_PROGRESS':
      return 'In Bearbeitung';
    case 'COMPLETED':
      return 'Erledigt';
    case 'FAILED':
      return 'Fehler';
    case 'SKIPPED':
      return 'Übersprungen';
    default:
      return status;
  }
}

function stepLabel(step: ArrivalCheckStep | null): string {
  switch (step) {
    case 'FOLIO_LOAD':
      return 'Folio laden';
    case 'CHARGE_ASSIGN':
      return 'Charges zuordnen';
    case 'PREPAID_SETTLE':
      return 'Prepaid abrechnen';
    default:
      return '—';
  }
}

function statusBadgeClass(status: ArrivalCheckItemStatus | ArrivalCheckRunStatus): string {
  switch (status) {
    case 'COMPLETED':
      return 'border-emerald-200 bg-emerald-50 text-emerald-900';
    case 'FAILED':
      return 'border-rose-200 bg-rose-50 text-rose-900';
    case 'IN_PROGRESS':
    case 'RUNNING':
      return 'border-amber-200 bg-amber-50 text-amber-950';
    case 'SKIPPED':
    case 'CANCELLED':
      return 'border-border bg-surface-muted text-ink-muted';
    default:
      return 'border-border bg-surface-muted text-ink-muted';
  }
}

export default function ArrivalCheckRunPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading } = useAuth();
  const canArrivalCheck = usePermission('ARRIVAL_CHECK');
  const runId = String(params.runId ?? '');
  const queryClient = useQueryClient();
  const [executing, setExecuting] = useState(false);
  const [executeError, setExecuteError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    else if (!canArrivalCheck) router.replace('/r');
  }, [user, loading, canArrivalCheck, router]);

  const runQuery = useQuery({
    queryKey: ['arrival-check', 'run', runId],
    queryFn: () => api<ArrivalCheckRunDetail>(`/arrival-check/runs/${runId}`),
    enabled: !!runId && canArrivalCheck,
    refetchInterval: 4000,
  });

  const run = runQuery.data;
  const canExecute =
    run &&
    run.status !== 'CANCELLED' &&
    run.pendingCount + run.failedCount > 0 &&
    !executing;

  async function handleExecute() {
    if (!runId) return;
    setExecuting(true);
    setExecuteError(null);
    try {
      await api<ArrivalCheckRunDetail>(`/arrival-check/runs/${runId}/execute`, { method: 'POST' });
      await queryClient.invalidateQueries({ queryKey: ['arrival-check', 'run', runId] });
    } catch (err) {
      setExecuteError(err instanceof Error ? err.message : 'Ausführung fehlgeschlagen.');
    } finally {
      setExecuting(false);
    }
  }

  if (loading || !user || !canArrivalCheck) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-sm text-ink-muted">Lädt…</p>
      </div>
    );
  }

  if (runQuery.isLoading) {
    return (
      <div className="mx-auto max-w-[1200px] p-4 md:p-8">
        <p className="text-sm text-ink-muted">Lädt…</p>
      </div>
    );
  }

  if (runQuery.isError || !run) {
    return (
      <div className="mx-auto max-w-[1200px] space-y-4 p-4 md:p-8">
        <p className="text-sm text-danger">{(runQuery.error as Error)?.message ?? 'Lauf nicht gefunden.'}</p>
        <Link href="/r/arrival-check" className="text-sm font-medium text-ink underline">
          Zurück zur Auswahl
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-8">
      <header className="space-y-3 border-b border-border pb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <button
              type="button"
              onClick={() => router.push('/r/arrival-check')}
              className="mb-2 text-sm text-ink-muted hover:text-ink"
            >
              ← Zurück zur Auswahl
            </button>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">Anreise-Check Lauf</h1>
            <p className="mt-1 text-sm text-ink-muted">
              Gestartet von {run.createdByName} ·{' '}
              {new Date(run.startedAt).toLocaleString('de-CH')} · Hotel {run.hotelId}
            </p>
          </div>
          <span
            className={clsx(
              'rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide',
              statusBadgeClass(run.status),
            )}
          >
            {runStatusLabel(run.status)}
          </span>
          {canExecute && (
            <button
              type="button"
              onClick={() => void handleExecute()}
              disabled={executing}
              className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-surface hover:bg-ink/90 disabled:opacity-50"
            >
              {executing ? 'Läuft…' : 'Ausführen'}
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-3 text-sm text-ink-muted">
          <span>{run.itemCount} Reservierungen</span>
          <span>·</span>
          <span>{run.pendingCount} ausstehend</span>
          <span>·</span>
          <span>{run.completedCount} erledigt</span>
          {run.failedCount > 0 && (
            <>
              <span>·</span>
              <span className="text-rose-700">{run.failedCount} fehlgeschlagen</span>
            </>
          )}
        </div>

        {executeError && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
            {executeError}
          </p>
        )}

        <p className="rounded-lg border border-border bg-surface-muted/40 px-3 py-2 text-sm text-ink-muted">
          Phase 1: Folio aus EMMA laden und Zimmer-/Hotelsteuer-Posten (BB, CTAX2) von Folio 1 auf
          das Firmen-Folio verschieben. City Tax (CTAX) bleibt auf Folio 1.
        </p>
      </header>

      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="border-b border-border bg-surface-muted/50">
              <tr>
                <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-ink-muted">
                  Gast
                </th>
                <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-ink-muted">
                  Res.
                </th>
                <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-ink-muted">
                  Zimmer
                </th>
                <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-ink-muted">
                  An / Ab
                </th>
                <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-ink-muted">
                  Status
                </th>
                <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-ink-muted">
                  Schritt
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {run.items.map((item) => (
                <tr key={item.id} className="hover:bg-surface-muted/40">
                  <td className="px-4 py-3.5 font-medium text-ink">{item.mainGuestName ?? '—'}</td>
                  <td className="px-4 py-3.5 tabular-nums text-ink-muted">{item.reservationId}</td>
                  <td className="px-4 py-3.5 tabular-nums text-ink">{item.roomId ?? '—'}</td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-ink-muted">
                    <span className="tabular-nums">{item.arrivalDate}</span>
                    <span className="mx-1.5 text-ink-muted/50">→</span>
                    <span className="tabular-nums">{item.departureDate}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span
                      className={clsx(
                        'inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium',
                        statusBadgeClass(item.status),
                      )}
                    >
                      {itemStatusLabel(item.status)}
                    </span>
                    {item.error && (
                      <p className="mt-1 max-w-xs text-xs text-rose-700">{item.error}</p>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-ink-muted">{stepLabel(item.currentStep)}</td>
                  <td className="px-4 py-3.5 text-right">
                    <Link
                      href={`/r/reservations/${item.reservationId}?from=arrivals`}
                      className="text-xs font-medium text-ink-muted hover:text-ink"
                    >
                      Reservierung
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
