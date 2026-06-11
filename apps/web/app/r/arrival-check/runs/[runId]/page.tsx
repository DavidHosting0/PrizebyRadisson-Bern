'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ArrivalCheckItemStatus,
  ArrivalCheckRunDetail,
  ArrivalCheckRunItem,
  ArrivalCheckRunStatus,
} from '@housekeeping/shared';
import { api } from '@/lib/api';
import { useAuth, usePermission } from '@/lib/auth-context';
import { getFirstAllowedPath, RECEPTION_NAV } from '@/lib/permission-routes';
import clsx from 'clsx';

function runStatusLabel(status: ArrivalCheckRunStatus): string {
  switch (status) {
    case 'RUNNING':
      return 'Läuft';
    case 'COMPLETED':
      return 'Abgeschlossen';
    case 'FAILED':
      return 'Mit Hinweisen abgeschlossen';
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
    case 'NEEDS_MANUAL':
      return 'Manuell nötig';
    default:
      return status;
  }
}

function statusBadgeClass(status: ArrivalCheckItemStatus | ArrivalCheckRunStatus): string {
  switch (status) {
    case 'COMPLETED':
      return 'border-emerald-200 bg-emerald-50 text-emerald-900';
    case 'FAILED':
      return 'border-rose-200 bg-rose-50 text-rose-900';
    case 'NEEDS_MANUAL':
      return 'border-orange-200 bg-orange-50 text-orange-900';
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

function needsManual(item: ArrivalCheckRunItem): boolean {
  return item.status === 'NEEDS_MANUAL' || item.status === 'FAILED';
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
    else if (!canArrivalCheck) router.replace(getFirstAllowedPath(user, RECEPTION_NAV) ?? '/login');
  }, [user, loading, canArrivalCheck, router]);

  const runQuery = useQuery({
    queryKey: ['arrival-check', 'run', runId],
    queryFn: () => api<ArrivalCheckRunDetail>(`/arrival-check/runs/${runId}`),
    enabled: !!runId && canArrivalCheck,
    refetchInterval: () => (executing ? 1500 : false),
  });

  const run = runQuery.data;
  const canExecute =
    run &&
    run.status !== 'CANCELLED' &&
    run.pendingCount + run.failedCount + run.manualCount > 0 &&
    !executing;

  const processed = run
    ? run.completedCount + run.failedCount + run.manualCount + run.skippedCount
    : 0;
  const progressPct = run && run.itemCount > 0 ? Math.round((processed / run.itemCount) * 100) : 0;

  const liveMessage = useMemo(() => {
    if (!run) return null;
    const active = run.items.find((i) => i.status === 'IN_PROGRESS');
    if (active) return active.statusMessage ?? `${active.reservationId} wird verarbeitet …`;
    return null;
  }, [run]);

  const manualItems = useMemo(() => (run ? run.items.filter(needsManual) : []), [run]);

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

  const isDone = run.status === 'COMPLETED' || run.status === 'FAILED';

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
              {executing
                ? 'Läuft…'
                : run.completedCount + run.failedCount + run.manualCount > 0
                  ? 'Erneut ausführen'
                  : 'Anreise-Check ausführen'}
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-3 text-sm text-ink-muted">
          <span>{run.itemCount} Reservierungen</span>
          <span>·</span>
          <span>{run.completedCount} erledigt</span>
          {run.manualCount > 0 && (
            <>
              <span>·</span>
              <span className="text-orange-700">{run.manualCount} manuell nötig</span>
            </>
          )}
          {run.failedCount > 0 && (
            <>
              <span>·</span>
              <span className="text-rose-700">{run.failedCount} fehlgeschlagen</span>
            </>
          )}
          {run.pendingCount > 0 && (
            <>
              <span>·</span>
              <span>{run.pendingCount} ausstehend</span>
            </>
          )}
        </div>

        {/* Status bar */}
        <div className="space-y-2">
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-muted">
            <div
              className={clsx(
                'h-full rounded-full transition-all duration-500',
                run.failedCount > 0 || run.manualCount > 0 ? 'bg-amber-500' : 'bg-emerald-500',
              )}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="text-sm text-ink-muted">
            {executing || run.status === 'RUNNING' ? (
              <span>
                {liveMessage ?? 'Anreise-Check wird ausgeführt …'}{' '}
                <span className="tabular-nums">
                  ({processed}/{run.itemCount})
                </span>
              </span>
            ) : isDone ? (
              <span>
                Anreise-Check abgeschlossen · {processed}/{run.itemCount} verarbeitet.
              </span>
            ) : (
              <span>
                Bereit zur Ausführung. Klicke „Anreise-Check ausführen“, um die Posten gemäss
                Regelwerk auf die Folios zu verteilen.
              </span>
            )}
          </p>
        </div>

        {executeError && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
            {executeError}
          </p>
        )}

        <p className="rounded-lg border border-border bg-surface-muted/40 px-3 py-2 text-sm text-ink-muted">
          Posten werden automatisch zugeordnet: OTA mit VCC → Zimmer/Verpflegung auf Folio 2,
          City Tax und Hotel Tax auf Folio 1. OTA Prepaid sowie Radisson-/CTrip-Buchungen → alle
          Posten auf Folio 1. OTA ohne VCC (flexibel) bleibt unverändert. Unbekannte Quellen und
          EMMA-Sperren werden zur manuellen Bearbeitung aufgelistet.
        </p>
      </header>

      {/* Overview after completion */}
      {isDone && run.categoryCounts.length > 0 && (
        <section className="rounded-xl border border-border bg-surface p-4 shadow-card md:p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Übersicht
          </h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {run.categoryCounts.map((c) => (
              <li
                key={`${c.source}-${c.scenario}`}
                className="flex items-center justify-between rounded-lg border border-border bg-surface-muted/40 px-3 py-2 text-sm"
              >
                <span className="text-ink">{c.label}</span>
                <span className="tabular-nums font-semibold text-ink">{c.count}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Manual intervention list */}
      {manualItems.length > 0 && (
        <section className="rounded-xl border border-orange-200 bg-orange-50/60 p-4 shadow-card md:p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-orange-900">
            Manuelle Bearbeitung nötig ({manualItems.length})
          </h2>
          <ul className="mt-3 space-y-2">
            {manualItems.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-orange-200 bg-surface px-3 py-2.5 text-sm"
              >
                <div>
                  <span className="font-medium text-ink">{item.mainGuestName ?? '—'}</span>
                  <span className="ml-2 tabular-nums text-ink-muted">{item.reservationId}</span>
                  {item.roomId && (
                    <span className="ml-2 tabular-nums text-ink-muted">Zi. {item.roomId}</span>
                  )}
                  <p className="mt-0.5 text-xs text-orange-800">
                    {item.manualReason ?? item.error ?? 'Manuelle Prüfung erforderlich.'}
                  </p>
                </div>
                <Link
                  href={`/r/reservations/${item.reservationId}?from=arrivals`}
                  className="shrink-0 rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface-muted"
                >
                  Reservierung öffnen
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
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
                  Kategorie
                </th>
                <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-ink-muted">
                  Status
                </th>
                <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-ink-muted">
                  Verlauf
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
                  <td className="px-4 py-3.5 text-ink-muted">
                    {item.categoryLabel ?? '—'}
                    {item.movesPlanned > 0 && (
                      <span className="ml-1 tabular-nums text-xs text-ink-muted/70">
                        ({item.movesDone}/{item.movesPlanned})
                      </span>
                    )}
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
                  </td>
                  <td className="px-4 py-3.5 text-xs text-ink-muted">
                    {item.statusMessage ?? '—'}
                    {item.manualReason && item.manualReason !== item.statusMessage && (
                      <p className="mt-1 text-orange-700">{item.manualReason}</p>
                    )}
                  </td>
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
