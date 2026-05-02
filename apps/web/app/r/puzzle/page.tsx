'use client';

import { Fragment, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

type PuzzelTicket = {
  id: string;
  externalKey: string;
  subject: string;
  reference: string | null;
  status: string | null;
  detailHref: string | null;
  rowSummary: string;
  metadata?: unknown;
  scrapedAt: string;
};

type SyncStatus = {
  lastSyncedAt?: string | null;
  lastError?: string | null;
  lastTicketCount?: number;
  inProgress?: boolean;
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return '–';
  return new Date(value).toLocaleString('de-CH');
}

function ticketSearchText(ticket: PuzzelTicket) {
  return [
    ticket.reference,
    ticket.subject,
    ticket.status,
    ticket.rowSummary,
    ticket.externalKey,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function statusTone(status: string | null) {
  const s = status?.toLowerCase() ?? '';
  if (/(closed|done|solved|resolved|fermé|geschlossen)/.test(s)) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-900';
  }
  if (/(new|open|neu|pending|created)/.test(s)) {
    return 'border-amber-200 bg-amber-50 text-amber-900';
  }
  if (/(urgent|error|failed|overdue|kritisch)/.test(s)) {
    return 'border-rose-200 bg-rose-50 text-rose-900';
  }
  return 'border-border bg-surface-muted text-ink-muted';
}

export default function ReceptionPuzzlePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === 'ADMIN';
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const syncStatusQuery = useQuery({
    queryKey: ['puzzle', 'sync-status'],
    queryFn: () => api<SyncStatus>('/puzzle/sync-status'),
    refetchInterval: (q) => (q.state.data?.inProgress ? 3000 : 20_000),
  });

  const ticketsQuery = useQuery({
    queryKey: ['puzzle', 'tickets'],
    queryFn: () => api<PuzzelTicket[]>('/puzzle/tickets'),
    refetchInterval: syncStatusQuery.data?.inProgress ? 4000 : 25_000,
  });

  const syncMut = useMutation({
    mutationFn: () => api<{ status: string }>('/puzzle/sync', { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['puzzle', 'sync-status'] });
      queryClient.invalidateQueries({ queryKey: ['puzzle', 'tickets'] });
    },
  });

  const status = syncStatusQuery.data;
  const tickets = ticketsQuery.data ?? [];
  const statuses = useMemo(() => {
    return Array.from(new Set(tickets.map((ticket) => ticket.status).filter(Boolean) as string[])).sort((a, b) =>
      a.localeCompare(b),
    );
  }, [tickets]);

  const filteredTickets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tickets.filter((ticket) => {
      const matchesStatus = !statusFilter || ticket.status === statusFilter;
      const matchesSearch = !q || ticketSearchText(ticket).includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [search, statusFilter, tickets]);

  return (
    <div className="space-y-8 p-4 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink md:text-3xl">Puzzel Tickets</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Alle synchronisierten Tickets aus Puzzel CM für die Rezeption.
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          {status?.lastSyncedAt != null && (
            <p className="text-xs text-ink-muted">
              Zuletzt synchronisiert: {formatDateTime(status.lastSyncedAt)}
              {typeof status.lastTicketCount === 'number' ? ` · ${status.lastTicketCount} Tickets` : ''}
            </p>
          )}
          {status?.inProgress && (
            <p className="text-xs font-medium text-amber-800">Synchronisation läuft…</p>
          )}
          {status?.lastError && !status?.inProgress && (
            <p className="max-w-xl text-xs text-rose-700">{status.lastError}</p>
          )}
          {isAdmin && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="action"
                className="min-h-[44px]"
                disabled={syncMut.isPending || status?.inProgress}
                onClick={() => syncMut.mutate()}
              >
                {status?.inProgress ? 'Läuft…' : syncMut.isPending ? 'Starte…' : 'Jetzt synchronisieren'}
              </Button>
              {syncMut.data?.status === 'already_running' && (
                <span className="text-xs text-ink-muted">Bereits aktiv.</span>
              )}
              {syncMut.isError && (
                <span className="text-xs text-rose-700">{(syncMut.error as Error).message}</span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Tickets gesamt</p>
          <p className="mt-1 text-2xl font-semibold text-ink">{tickets.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Aktuell angezeigt</p>
          <p className="mt-1 text-2xl font-semibold text-ink">{filteredTickets.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Sync-Status</p>
          <p className="mt-1 text-sm font-medium text-ink">
            {status?.inProgress ? 'Synchronisation läuft' : status?.lastError ? 'Letzter Lauf mit Fehler' : 'Bereit'}
          </p>
        </Card>
      </div>

      {ticketsQuery.isLoading && <p className="text-sm text-ink-muted">Lädt Tickets…</p>}

      {!ticketsQuery.isLoading && tickets.length === 0 && (
        <Card className="p-6">
          <p className="text-sm text-ink-muted">
            Noch keine Tickets. Sobald ein Admin unter <strong>Puzzle → Zugangsdaten</strong> E-Mail,
            Passwort und 2FA-Seed eingetragen hat, kann unter <strong>Jetzt synchronisieren</strong> oder
            per Cron (<code className="rounded bg-surface-muted px-1">PUZZEL_AUTO_SYNC=true</code>) geholt werden.
          </p>
        </Card>
      )}

      {tickets.length > 0 && (
        <>
          <Card className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_220px_auto]">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-muted">Suchen</span>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Referenz, Betreff, Status oder Text suchen…"
                className="min-h-[44px] w-full rounded-btn border border-border bg-surface px-3 text-sm text-ink outline-none focus:border-action"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-muted">Status</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="min-h-[44px] w-full rounded-btn border border-border bg-surface px-3 text-sm text-ink outline-none focus:border-action"
              >
                <option value="">Alle Status</option>
                {statuses.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end">
              <Button
                type="button"
                variant="secondary"
                className="min-h-[44px] w-full"
                onClick={() => {
                  setSearch('');
                  setStatusFilter('');
                }}
              >
                Filter löschen
              </Button>
            </div>
          </Card>

          <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border text-left text-sm">
                <thead className="bg-surface-muted/80">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-ink">Referenz</th>
                    <th className="px-4 py-3 font-semibold text-ink">Ticket</th>
                    <th className="px-4 py-3 font-semibold text-ink">Status</th>
                    <th className="px-4 py-3 font-semibold text-ink">Stand</th>
                    <th className="px-4 py-3 font-semibold text-ink">Aktion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredTickets.map((t) => {
                    const expanded = expandedId === t.id;
                    return (
                      <Fragment key={t.id}>
                        <tr className="hover:bg-surface-muted/40">
                          <td className="whitespace-nowrap px-4 py-3 align-top font-mono text-xs text-ink-muted">
                            {t.reference ?? '–'}
                          </td>
                          <td className="min-w-[320px] max-w-2xl px-4 py-3 align-top text-ink">
                            <button
                              type="button"
                              className="block text-left"
                              onClick={() => setExpandedId(expanded ? null : t.id)}
                            >
                              <span className="line-clamp-2 font-medium leading-snug text-ink">{t.subject}</span>
                              <span className="mt-1 line-clamp-1 text-xs text-ink-muted">{t.rowSummary}</span>
                            </button>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 align-top">
                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusTone(t.status)}`}>
                              {t.status ?? 'Unbekannt'}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 align-top text-xs text-ink-muted">
                            {formatDateTime(t.scrapedAt)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 align-top">
                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                className="text-xs font-medium text-action hover:underline"
                                onClick={() => setExpandedId(expanded ? null : t.id)}
                              >
                                {expanded ? 'Schliessen' : 'Details'}
                              </button>
                              {t.detailHref ? (
                                <a
                                  href={t.detailHref}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs font-medium text-action hover:underline"
                                >
                                  Puzzel öffnen
                                </a>
                              ) : (
                                <span className="text-xs text-ink-muted">Kein Link</span>
                              )}
                            </div>
                          </td>
                        </tr>
                        {expanded && (
                          <tr className="bg-surface-muted/40">
                            <td colSpan={5} className="px-4 py-4">
                              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_260px]">
                                <div>
                                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                                    Vollständige Ticket-Zeile
                                  </p>
                                  <p className="mt-2 whitespace-pre-wrap rounded-xl border border-border bg-surface p-3 text-sm leading-relaxed text-ink">
                                    {t.rowSummary || t.subject}
                                  </p>
                                </div>
                                <dl className="grid content-start gap-2 rounded-xl border border-border bg-surface p-3 text-xs">
                                  <div>
                                    <dt className="font-semibold uppercase tracking-wide text-ink-muted">External Key</dt>
                                    <dd className="mt-1 break-all font-mono text-ink-muted">{t.externalKey}</dd>
                                  </div>
                                  <div>
                                    <dt className="font-semibold uppercase tracking-wide text-ink-muted">Gescraped</dt>
                                    <dd className="mt-1 text-ink-muted">{formatDateTime(t.scrapedAt)}</dd>
                                  </div>
                                </dl>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filteredTickets.length === 0 && (
              <p className="p-6 text-sm text-ink-muted">Keine Tickets passen zu den aktuellen Filtern.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
