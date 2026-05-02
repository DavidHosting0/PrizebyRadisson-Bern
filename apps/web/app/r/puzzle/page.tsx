'use client';

import { useEffect, useMemo, useState } from 'react';
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

type PuzzelTicketMessage = {
  id: string;
  sentAtText: string | null;
  fromText: string | null;
  toText: string | null;
  direction: string | null;
  bodyText: string;
  bodyHtml?: string | null;
  scrapedAt: string;
};

type PuzzelFilter = {
  savedSearchName: string;
  teamName: string;
  statusName: string;
  timePeriod: string;
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

function metadataRecord(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  return {};
}

function metaText(ticket: PuzzelTicket, key: string) {
  const value = metadataRecord(ticket.metadata)[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function initials(value: string | null | undefined) {
  const text = value?.trim() || '?';
  return text
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?';
}

export default function ReceptionPuzzlePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === 'ADMIN';
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [filterDraft, setFilterDraft] = useState<PuzzelFilter>({
    savedSearchName: "My Favourite Team's Open Tickets",
    teamName: 'PZ | Billing Bern',
    statusName: 'Open',
    timePeriod: 'All Time',
  });

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

  const puzzelFilterQuery = useQuery({
    queryKey: ['puzzle', 'filter'],
    queryFn: () => api<PuzzelFilter>('/puzzle/filter'),
  });

  useEffect(() => {
    if (puzzelFilterQuery.data) {
      setFilterDraft(puzzelFilterQuery.data);
    }
  }, [puzzelFilterQuery.data]);

  const syncMut = useMutation({
    mutationFn: () => api<{ status: string }>('/puzzle/sync', { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['puzzle', 'sync-status'] });
      queryClient.invalidateQueries({ queryKey: ['puzzle', 'tickets'] });
    },
  });

  const saveFilterMut = useMutation({
    mutationFn: (body: PuzzelFilter) =>
      api<PuzzelFilter>('/puzzle/filter', {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: (next) => {
      queryClient.setQueryData(['puzzle', 'filter'], next);
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

  useEffect(() => {
    if (!expandedId && filteredTickets.length > 0) {
      setExpandedId(filteredTickets[0].id);
    }
  }, [expandedId, filteredTickets]);

  const selectedTicket = useMemo(() => {
    return tickets.find((ticket) => ticket.id === expandedId) ?? null;
  }, [expandedId, tickets]);

  const messagesQuery = useQuery({
    queryKey: ['puzzle', 'ticket-messages', expandedId],
    queryFn: () => api<PuzzelTicketMessage[]>(`/puzzle/tickets/${expandedId}/messages`),
    enabled: !!expandedId,
    retry: false,
  });

  const refreshMessagesMut = useMutation({
    mutationFn: (ticketId: string) =>
      api<PuzzelTicketMessage[]>(`/puzzle/tickets/${ticketId}/messages/refresh`, { method: 'POST' }),
    onSuccess: (_data, ticketId) => {
      queryClient.invalidateQueries({ queryKey: ['puzzle', 'ticket-messages', ticketId] });
    },
  });

  const assignMut = useMutation({
    mutationFn: (ticketId: string) => api<{ ok: true; action: 'assign' }>(`/puzzle/tickets/${ticketId}/assign-to-me`, { method: 'POST' }),
    onSuccess: (_data, ticketId) => {
      queryClient.invalidateQueries({ queryKey: ['puzzle', 'tickets'] });
      queryClient.invalidateQueries({ queryKey: ['puzzle', 'ticket-messages', ticketId] });
    },
  });

  const replyMut = useMutation({
    mutationFn: ({ ticketId, message }: { ticketId: string; message: string }) =>
      api<{ ok: true; action: 'reply' }>(`/puzzle/tickets/${ticketId}/reply`, {
        method: 'POST',
        body: JSON.stringify({ message }),
      }),
    onSuccess: (_data, vars) => {
      setReplyText('');
      queryClient.invalidateQueries({ queryKey: ['puzzle', 'ticket-messages', vars.ticketId] });
      queryClient.invalidateQueries({ queryKey: ['puzzle', 'tickets'] });
    },
  });

  return (
    <div className="space-y-6 bg-surface-muted/30 p-4 md:p-8">
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

      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-ink">Puzzel-Filter</h2>
            <p className="text-sm text-ink-muted">
              Diese Werte nutzt der Sync in Puzzel, bevor er die Ticketliste ausliest.
            </p>
          </div>
          {saveFilterMut.isSuccess && !saveFilterMut.isPending && (
            <span className="text-xs font-medium text-emerald-800">Filter gespeichert.</span>
          )}
        </div>
        <form
          className="mt-4 grid gap-3 md:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            saveFilterMut.mutate({
              savedSearchName: filterDraft.savedSearchName.trim(),
              teamName: filterDraft.teamName.trim(),
              statusName: filterDraft.statusName.trim(),
              timePeriod: filterDraft.timePeriod.trim(),
            });
          }}
        >
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-muted">Saved Search</span>
            <input
              value={filterDraft.savedSearchName}
              onChange={(e) => setFilterDraft((f) => ({ ...f, savedSearchName: e.target.value }))}
              disabled={!isAdmin}
              className="min-h-[44px] w-full rounded-btn border border-border bg-surface px-3 text-sm text-ink outline-none focus:border-action disabled:bg-surface-muted"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-muted">Team</span>
            <input
              value={filterDraft.teamName}
              onChange={(e) => setFilterDraft((f) => ({ ...f, teamName: e.target.value }))}
              disabled={!isAdmin}
              className="min-h-[44px] w-full rounded-btn border border-border bg-surface px-3 text-sm text-ink outline-none focus:border-action disabled:bg-surface-muted"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-muted">Status</span>
            <input
              value={filterDraft.statusName}
              onChange={(e) => setFilterDraft((f) => ({ ...f, statusName: e.target.value }))}
              disabled={!isAdmin}
              className="min-h-[44px] w-full rounded-btn border border-border bg-surface px-3 text-sm text-ink outline-none focus:border-action disabled:bg-surface-muted"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-muted">Time Period</span>
            <input
              value={filterDraft.timePeriod}
              onChange={(e) => setFilterDraft((f) => ({ ...f, timePeriod: e.target.value }))}
              disabled={!isAdmin}
              className="min-h-[44px] w-full rounded-btn border border-border bg-surface px-3 text-sm text-ink outline-none focus:border-action disabled:bg-surface-muted"
            />
          </label>
          {isAdmin && (
            <div className="flex items-end md:col-span-4">
              <Button type="submit" variant="secondary" className="min-h-[44px]" disabled={saveFilterMut.isPending}>
                {saveFilterMut.isPending ? 'Speichert…' : 'Filter speichern'}
              </Button>
              {saveFilterMut.isError && (
                <span className="ml-3 text-sm text-rose-700">{(saveFilterMut.error as Error).message}</span>
              )}
            </div>
          )}
        </form>
      </Card>

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
        <div className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
          <Card className="p-4">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-muted">Suchen</span>
              <input
                type="search"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setExpandedId(null);
                }}
                placeholder="Referenz, Betreff, Status oder Text suchen…"
                className="min-h-[44px] w-full rounded-btn border border-border bg-surface px-3 text-sm text-ink outline-none focus:border-action"
              />
            </label>
            <label className="mt-3 block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-muted">Status</span>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setExpandedId(null);
                }}
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
            <div className="mt-3 flex items-end">
              <Button
                type="button"
                variant="secondary"
                className="min-h-[44px] w-full"
                onClick={() => {
                  setSearch('');
                  setStatusFilter('');
                  setExpandedId(null);
                }}
              >
                Filter löschen
              </Button>
            </div>

            <div className="mt-4 space-y-2">
              {filteredTickets.map((ticket) => {
                const selected = selectedTicket?.id === ticket.id;
                const team = metaText(ticket, 'team');
                const lastActivity = metaText(ticket, 'lastActivity') ?? metaText(ticket, 'lastInboundActivity');
                return (
                  <button
                    key={ticket.id}
                    type="button"
                    onClick={() => {
                      setExpandedId(ticket.id);
                      setReplyText('');
                    }}
                    className={`w-full rounded-2xl border p-4 text-left transition ${
                      selected
                        ? 'border-action bg-action/5 shadow-card'
                        : 'border-border bg-surface hover:border-action/40 hover:bg-surface-muted/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs text-ink-muted">{ticket.reference ?? 'No reference'}</span>
                          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusTone(ticket.status)}`}>
                            {ticket.status ?? 'Unknown'}
                          </span>
                        </div>
                        <p className="mt-2 line-clamp-2 text-sm font-semibold leading-snug text-ink">{ticket.subject}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-surface-muted px-2 py-1 text-[11px] text-ink-muted">
                        {formatDateTime(ticket.scrapedAt)}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-ink-muted">
                      {team && <span className="rounded-full bg-surface-muted px-2 py-1">Team: {team}</span>}
                      {lastActivity && <span className="rounded-full bg-surface-muted px-2 py-1">Last activity: {lastActivity}</span>}
                    </div>
                    <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-ink-muted">{ticket.rowSummary}</p>
                  </button>
                );
              })}
            </div>
            {filteredTickets.length === 0 && (
              <p className="mt-4 rounded-xl border border-border bg-surface p-4 text-sm text-ink-muted">
                Keine Tickets passen zu den aktuellen Filtern.
              </p>
            )}
          </Card>

          <Card className="min-h-[620px] overflow-hidden">
            {selectedTicket ? (
              <div className="flex h-full flex-col">
                <div className="border-b border-border bg-surface p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-ink-muted">{selectedTicket.reference ?? 'No reference'}</span>
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(selectedTicket.status)}`}>
                          {selectedTicket.status ?? 'Unknown'}
                        </span>
                      </div>
                      <h2 className="mt-2 text-xl font-semibold leading-tight text-ink">{selectedTicket.subject}</h2>
                      <p className="mt-1 text-sm text-ink-muted">
                        Synced {formatDateTime(selectedTicket.scrapedAt)}
                        {metaText(selectedTicket, 'lastActivity') ? ` · Last activity ${metaText(selectedTicket, 'lastActivity')}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        className="min-h-[40px]"
                        disabled={assignMut.isPending}
                        onClick={() => assignMut.mutate(selectedTicket.id)}
                      >
                        {assignMut.isPending ? 'Assigning…' : 'Assign to me'}
                      </Button>
                      {selectedTicket.detailHref && (
                        <a
                          href={selectedTicket.detailHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-[40px] items-center rounded-btn border border-border px-3 text-sm font-medium text-ink hover:bg-surface-muted"
                        >
                          Open in Puzzel
                        </a>
                      )}
                    </div>
                  </div>
                  {(assignMut.isError || replyMut.isError) && (
                    <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                      {((assignMut.error || replyMut.error) as Error).message}
                    </p>
                  )}
                </div>

                <div className="flex-1 space-y-4 overflow-auto bg-gradient-to-b from-surface-muted/60 to-surface p-5">
                  <div className="rounded-2xl border border-border bg-surface p-4 text-xs text-ink-muted">
                    <p className="font-semibold uppercase tracking-wide text-ink-muted">Ticket summary</p>
                    <p className="mt-2 leading-relaxed">{selectedTicket.rowSummary || selectedTicket.subject}</p>
                  </div>

                  {messagesQuery.isLoading && (
                    <p className="rounded-xl border border-border bg-surface p-4 text-sm text-ink-muted">
                      Loading chat history from Puzzel…
                    </p>
                  )}
                  {messagesQuery.isError && (
                    <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                      {(messagesQuery.error as Error).message}
                    </p>
                  )}
                  {!messagesQuery.isLoading && !messagesQuery.isError && (messagesQuery.data?.length ?? 0) === 0 && (
                    <p className="rounded-xl border border-border bg-surface p-4 text-sm text-ink-muted">
                      No messages saved yet.
                    </p>
                  )}

                  <ol className="space-y-4">
                    {(messagesQuery.data ?? []).map((message) => {
                      const outbound = message.direction === 'outbound';
                      return (
                        <li key={message.id} className={`flex gap-3 ${outbound ? 'justify-end' : 'justify-start'}`}>
                          {!outbound && (
                            <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-semibold text-amber-900">
                              {initials(message.fromText)}
                            </div>
                          )}
                          <article
                            className={`max-w-[780px] rounded-2xl border p-4 shadow-sm ${
                              outbound
                                ? 'border-sky-200 bg-sky-50 text-sky-950'
                                : 'border-border bg-white text-ink'
                            }`}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                                  {outbound ? 'Hotel reply' : 'Guest message'}
                                </p>
                                <p className="mt-1 text-sm font-medium">
                                  {message.fromText ?? 'Unknown'} → {message.toText ?? 'Unknown'}
                                </p>
                              </div>
                              <span className="text-xs text-ink-muted">{message.sentAtText ?? formatDateTime(message.scrapedAt)}</span>
                            </div>
                            <div className="mt-3 max-h-[560px] overflow-auto whitespace-pre-wrap rounded-xl bg-white/80 p-3 text-sm leading-7">
                              {message.bodyText}
                            </div>
                          </article>
                          {outbound && (
                            <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-semibold text-sky-900">
                              {initials(message.fromText)}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                </div>

                <div className="border-t border-border bg-surface p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-ink-muted">
                      Reply is sent through Puzzel with line breaks preserved.
                    </p>
                    {isAdmin && (
                      <button
                        type="button"
                        className="text-xs font-medium text-action hover:underline disabled:opacity-50"
                        disabled={refreshMessagesMut.isPending}
                        onClick={() => refreshMessagesMut.mutate(selectedTicket.id)}
                      >
                        Refresh messages
                      </button>
                    )}
                  </div>
                  <form
                    className="mt-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!replyText.trim()) return;
                      replyMut.mutate({ ticketId: selectedTicket.id, message: replyText });
                    }}
                  >
                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      rows={5}
                      placeholder="Write a reply to the guest…"
                      className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm leading-6 text-ink outline-none focus:border-action"
                    />
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs text-ink-muted">
                        Use the same signature/business data you want to send in Puzzel.
                      </p>
                      <Button
                        type="submit"
                        variant="action"
                        className="min-h-[44px]"
                        disabled={replyMut.isPending || !replyText.trim()}
                      >
                        {replyMut.isPending ? 'Sending…' : 'Send reply via Puzzel'}
                      </Button>
                    </div>
                    {replyMut.isSuccess && (
                      <p className="mt-2 text-sm font-medium text-emerald-800">Reply sent through Puzzel.</p>
                    )}
                  </form>
                </div>
              </div>
            ) : (
              <div className="flex min-h-[520px] items-center justify-center p-8 text-center">
                <div>
                  <p className="text-lg font-semibold text-ink">Select a ticket</p>
                  <p className="mt-1 text-sm text-ink-muted">The chat history and actions will appear here.</p>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
