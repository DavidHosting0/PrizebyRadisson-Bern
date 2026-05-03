'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, postNdjsonStream } from '@/lib/api';
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

type PuzzelTicketAnalysisRequestType =
  | 'invoice_correction'
  | 'invoice_resend'
  | 'invoice_other'
  | 'unknown';

type PuzzelTicketUrgency = 'critical' | 'high' | 'normal' | 'low';

type PuzzelInvoiceAction =
  | 'resend_only'
  | 'correct_and_reissue'
  | 'new_or_additional_invoice'
  | 'vat_tax_legal'
  | 'payment_refund'
  | 'invoice_question'
  | 'other_billing'
  | 'unclear';

type CompanyBillingOnInvoiceIntent = 'yes' | 'no' | 'unclear' | 'not_mentioned';

type CompanyInvoiceBillingDetails = {
  intent: CompanyBillingOnInvoiceIntent;
  fieldsRequestedOnInvoice: {
    companyName: boolean;
    street: boolean;
    houseNumber: boolean;
    postalCode: boolean;
    city: boolean;
    country: boolean;
    vatNumber: boolean;
  };
  extracted: {
    companyName: string | null;
    street: string | null;
    houseNumber: string | null;
    postalCode: string | null;
    city: string | null;
    country: string | null;
    vatNumber: string | null;
  };
};

type PuzzelTicketAnalysis = {
  id: string;
  ticketId: string;
  requestType: PuzzelTicketAnalysisRequestType;
  invoiceAction: PuzzelInvoiceAction;
  issueTypeLabel: string;
  urgencyLevel: PuzzelTicketUrgency;
  summary: string;
  bookingDetails: {
    reservationNumber: string | null;
    roomNumber: string | null;
    checkInDate: string | null;
    checkOutDate: string | null;
    guestName: string | null;
    invoiceNumber: string | null;
    bookingPlatform: string | null;
    otherDetails: string[];
  };
  companyInvoiceBillingDetails: CompanyInvoiceBillingDetails;
  rationale: string;
  confidence: 'high' | 'medium' | 'low';
  model: string;
  stale: boolean;
  createdAt: string;
  updatedAt: string;
};

const INVOICE_ACTION_LABEL: Record<PuzzelInvoiceAction, string> = {
  resend_only: 'Nur Zusendung — gleicher Inhalt (PDF/E-Mail)',
  correct_and_reissue: 'Korrektur — Rechnung inhaltlich ändern & neu',
  new_or_additional_invoice: 'Zusätzliche / geteilte / Pro-forma-Rechnung',
  vat_tax_legal: 'USt / Steuer / VAT / Formulierung auf Beleg',
  payment_refund: 'Zahlung / Rückerstattung / Abbuchung',
  invoice_question: 'Rückfrage zur Rechnung (kein klarer Auftrag)',
  other_billing: 'Sonstiges Buchhaltungs-/Zahlungsthema',
  unclear: 'Anliegen unklar',
};

/** Distinct badge colour so “resend” vs “correct” is scannable. */
const INVOICE_ACTION_TONE: Record<PuzzelInvoiceAction, string> = {
  resend_only: 'border-sky-300 bg-sky-100 text-sky-950',
  correct_and_reissue: 'border-amber-300 bg-amber-100 text-amber-950',
  new_or_additional_invoice: 'border-violet-300 bg-violet-100 text-violet-950',
  vat_tax_legal: 'border-indigo-300 bg-indigo-100 text-indigo-950',
  payment_refund: 'border-rose-300 bg-rose-100 text-rose-950',
  invoice_question: 'border-teal-300 bg-teal-100 text-teal-950',
  other_billing: 'border-slate-300 bg-slate-100 text-slate-900',
  unclear: 'border-border bg-surface-muted text-ink-muted',
};

const REQUEST_TYPE_LABEL: Record<PuzzelTicketAnalysisRequestType, string> = {
  invoice_correction: 'Rechnungskorrektur',
  invoice_resend: 'Rechnung zusenden',
  invoice_other: 'Sonstige Rechnungsfrage',
  unknown: 'Unklar',
};

const REQUEST_TYPE_TONE: Record<PuzzelTicketAnalysisRequestType, string> = {
  invoice_correction: 'border-amber-200 bg-amber-50 text-amber-900',
  invoice_resend: 'border-sky-200 bg-sky-50 text-sky-900',
  invoice_other: 'border-violet-200 bg-violet-50 text-violet-900',
  unknown: 'border-border bg-surface-muted text-ink-muted',
};

const CONFIDENCE_LABEL: Record<'high' | 'medium' | 'low', string> = {
  high: 'Hohe Sicherheit',
  medium: 'Mittlere Sicherheit',
  low: 'Niedrige Sicherheit',
};

const URGENCY_LABEL: Record<PuzzelTicketUrgency, string> = {
  critical: 'Critical',
  high: 'High',
  normal: 'Normal',
  low: 'Low',
};

const URGENCY_TONE: Record<PuzzelTicketUrgency, string> = {
  critical: 'border-rose-300 bg-rose-100 text-rose-950',
  high: 'border-amber-300 bg-amber-100 text-amber-950',
  normal: 'border-slate-200 bg-slate-100 text-slate-800',
  low: 'border-border bg-surface-muted text-ink-muted',
};

const MISSING_FIELD = 'Not detected';

const COMPANY_BILLING_INTENT_LABEL: Record<CompanyBillingOnInvoiceIntent, string> = {
  yes: 'Guest wants company / full billing details on the invoice',
  no: 'Private billing only / no company invoice requested',
  unclear: 'Unclear whether company details belong on the invoice',
  not_mentioned: 'Not mentioned',
};

const COMPANY_BILLING_FIELD_LABEL: Record<keyof CompanyInvoiceBillingDetails['fieldsRequestedOnInvoice'], string> = {
  companyName: 'Company name',
  street: 'Street',
  houseNumber: 'No.',
  postalCode: 'Postal code',
  city: 'City',
  country: 'Country',
  vatNumber: 'VAT / UID',
};

function mergeIntervals(intervals: { start: number; end: number }[]) {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const out: { start: number; end: number }[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    const last = out[out.length - 1];
    if (cur.start <= last.end) {
      last.end = Math.max(last.end, cur.end);
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

/**
 * Highlights dates, money-like tokens, long numeric references, and exact phrases
 * from the AI extraction (guest name, reservation, etc.) when they appear in body text.
 */
function highlightTicketMessageBody(
  text: string,
  analysis: PuzzelTicketAnalysis | null | undefined,
): ReactNode {
  if (!text) return null;

  const ranges: { start: number; end: number }[] = [];
  const phrases: string[] = [];
  if (analysis?.bookingDetails) {
    const bd = analysis.bookingDetails;
    for (const v of [bd.guestName, bd.reservationNumber, bd.invoiceNumber, bd.roomNumber]) {
      if (typeof v === 'string' && v.trim().length >= 2) phrases.push(v.trim());
    }
  }
  const ex = analysis?.companyInvoiceBillingDetails?.extracted;
  if (ex) {
    for (const v of Object.values(ex)) {
      if (typeof v === 'string' && v.trim().length >= 2) phrases.push(v.trim());
    }
  }

  for (const phrase of phrases) {
    const esc = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(esc, 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      ranges.push({ start: m.index, end: m.index + m[0].length });
    }
  }

  const patterns: RegExp[] = [
    /\b(\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4}|\d{4}-\d{2}-\d{2})\b/g,
    /\b(?:CHF|EUR|USD)\s*[\d',.]+\b|\b[\d',.]+\s*(?:CHF|EUR|USD)\b/gi,
    /\B#\d{4,}\b|\b\d{7,}\b/g,
  ];
  for (const re of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      ranges.push({ start: m.index, end: m.index + m[0].length });
    }
  }

  const merged = mergeIntervals(ranges);
  if (merged.length === 0) return text;

  const nodes: ReactNode[] = [];
  let cursor = 0;
  merged.forEach((iv, idx) => {
    if (iv.start > cursor) {
      nodes.push(
        <Fragment key={`t-${idx}-a`}>{text.slice(cursor, iv.start)}</Fragment>,
      );
    }
    const slice = text.slice(iv.start, iv.end);
    nodes.push(
      <mark
        key={`h-${idx}`}
        className="rounded-sm bg-amber-200/90 px-0.5 text-inherit dark:bg-amber-500/40"
      >
        {slice}
      </mark>,
    );
    cursor = iv.end;
  });
  if (cursor < text.length) {
    nodes.push(<Fragment key="t-end">{text.slice(cursor)}</Fragment>);
  }
  return nodes;
}

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

function assignedAt(ticket: PuzzelTicket) {
  return metaText(ticket, 'lastAssignedViaPrizeBernAt');
}

/** Build EMMA search/open payload: Puzzel reference + optional AI PMS id. */
function buildEmmaOpenFolioPayload(
  ticket: PuzzelTicket,
  analysis: PuzzelTicketAnalysis | null | undefined,
): {
  shellSearch: string;
  gridReservationId: string;
  checkInDate?: string | null;
  checkOutDate?: string | null;
} | null {
  const ref = ticket.reference?.trim() || null;
  const resNum = analysis?.bookingDetails?.reservationNumber?.trim() || null;
  if (!ref && !resNum) return null;
  const shellSearch = ref ?? resNum!;
  const gridReservationId = resNum ?? ref!;
  return {
    shellSearch,
    gridReservationId,
    checkInDate: analysis?.bookingDetails?.checkInDate ?? undefined,
    checkOutDate: analysis?.bookingDetails?.checkOutDate ?? undefined,
  };
}

const EMMA_STEP_TITLE_DE: Record<string, string> = {
  session_launch: 'EMMA: Launchpad / Session',
  session_login: 'EMMA: Anmeldung',
  session_ready: 'Launchpad bereit',
  search_tile: 'Search Reservations öffnen',
  filters_restore: 'Filter zurücksetzen',
  fill_shell_search: 'Suchbegriff setzen',
  fill_date_filters: 'Anreise / Abreise',
  search_go: 'Suche ausführen',
  open_reservation_row: 'Reservation öffnen',
  open_folio_management: 'Folio Management',
};

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
      queryClient.invalidateQueries({ queryKey: ['puzzle', 'ticket-analysis', ticketId] });
    },
  });

  const analysisQuery = useQuery({
    queryKey: ['puzzle', 'ticket-analysis', expandedId],
    // The endpoint generates the analysis on-demand; we only fire it once
    // per selected ticket and reuse the cached result on tab-switches.
    queryFn: () =>
      api<PuzzelTicketAnalysis>(`/puzzle/tickets/${expandedId}/analysis`),
    enabled: !!expandedId && (messagesQuery.data?.length ?? 0) > 0,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const refreshAnalysisMut = useMutation({
    mutationFn: (ticketId: string) =>
      api<PuzzelTicketAnalysis>(`/puzzle/tickets/${ticketId}/analysis/refresh`, {
        method: 'POST',
      }),
    onSuccess: (data, ticketId) => {
      queryClient.setQueryData(['puzzle', 'ticket-analysis', ticketId], data);
    },
  });

  const assignMut = useMutation({
    mutationFn: (ticketId: string) =>
      api<{ ok: true; action: 'assign'; assignedAt: string }>(`/puzzle/tickets/${ticketId}/assign-to-me`, { method: 'POST' }),
    onSuccess: (data, ticketId) => {
      queryClient.setQueryData<PuzzelTicket[]>(['puzzle', 'tickets'], (current) =>
        current?.map((ticket) =>
          ticket.id === ticketId
            ? {
                ...ticket,
                metadata: {
                  ...metadataRecord(ticket.metadata),
                  lastAssignedViaPrizeBernAt: data.assignedAt,
                },
              }
            : ticket,
        ),
      );
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

  const [emmaSteps, setEmmaSteps] = useState<{ step: string; message: string }[]>([]);
  const [emmaBusy, setEmmaBusy] = useState(false);
  const [emmaError, setEmmaError] = useState<string | null>(null);
  const [emmaDone, setEmmaDone] = useState<{ url: string; title: string; durationMs: number } | null>(null);

  useEffect(() => {
    setEmmaSteps([]);
    setEmmaBusy(false);
    setEmmaError(null);
    setEmmaDone(null);
  }, [expandedId]);

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
                const ticketAssignedAt = assignedAt(ticket);
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
                          {ticketAssignedAt && (
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-900">
                              Assigned to me
                            </span>
                          )}
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
                  {(() => {
                    const emmaPayload = buildEmmaOpenFolioPayload(selectedTicket, analysisQuery.data);
                    return (
                      <div className="mb-4 rounded-2xl border border-indigo-200/80 bg-indigo-50/60 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-900/80">EMMA</p>
                            <p className="mt-0.5 text-sm font-medium text-indigo-950">
                              Buchung in EMMA suchen und Folio öffnen
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="action"
                            className="min-h-[44px] shrink-0"
                            disabled={emmaBusy || !emmaPayload}
                            onClick={async () => {
                              const payload = buildEmmaOpenFolioPayload(selectedTicket, analysisQuery.data);
                              if (!payload) return;
                              setEmmaBusy(true);
                              setEmmaError(null);
                              setEmmaDone(null);
                              setEmmaSteps([]);
                              try {
                                await postNdjsonStream(
                                  '/emma/reservation/open-folio-stream',
                                  { ...payload, headless: true },
                                  (line) => {
                                    if (line.type === 'step') {
                                      setEmmaSteps((prev) => [
                                        ...prev,
                                        { step: line.step, message: line.message },
                                      ]);
                                    } else if (line.type === 'done') {
                                      setEmmaDone({
                                        url: line.url,
                                        title: line.title,
                                        durationMs: line.durationMs,
                                      });
                                      setEmmaBusy(false);
                                    } else if (line.type === 'error') {
                                      setEmmaError(line.message);
                                      setEmmaBusy(false);
                                    }
                                  },
                                );
                              } catch (e) {
                                setEmmaError((e as Error).message);
                                setEmmaBusy(false);
                              }
                            }}
                          >
                            {emmaBusy ? 'EMMA läuft…' : 'Puzzel-Anfrage in Emma suchen'}
                          </Button>
                        </div>
                        {!emmaPayload && (
                          <p className="mt-2 text-xs text-indigo-900/70">
                            {analysisQuery.isLoading
                              ? 'KI-Analyse lädt … Referenz oder Reservierungsnummer wird gleich nutzbar.'
                              : 'Benötigt die Ticket-Referenz oder eine Reservierungsnummer aus der KI-Zusammenfassung (Nachrichten laden).'}
                          </p>
                        )}
                        {(emmaSteps.length > 0 || emmaError || emmaDone) && (
                          <div className="mt-3 max-h-48 overflow-auto rounded-xl border border-indigo-100 bg-white/80 p-3 text-xs">
                            <ol className="space-y-2">
                              {emmaSteps.map((row, i) => (
                                <li
                                  key={`${row.step}-${i}-${row.message.slice(0, 24)}`}
                                  className={`border-l-2 pl-2 ${
                                    i === emmaSteps.length - 1 && emmaBusy
                                      ? 'border-action font-medium text-ink'
                                      : 'border-indigo-200 text-ink-muted'
                                  }`}
                                >
                                  <span className="font-semibold text-indigo-950">
                                    {EMMA_STEP_TITLE_DE[row.step] ?? row.step}
                                  </span>
                                  <span className="mt-0.5 block text-[11px] leading-snug text-ink-muted">{row.message}</span>
                                </li>
                              ))}
                            </ol>
                            {emmaDone && (
                              <p className="mt-2 border-t border-indigo-100 pt-2 text-[11px] font-medium text-emerald-800">
                                Fertig in {(emmaDone.durationMs / 1000).toFixed(1)}s — {emmaDone.title}
                              </p>
                            )}
                            {emmaError && (
                              <p className="mt-2 text-[11px] font-medium text-rose-800">{emmaError}</p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-ink-muted">{selectedTicket.reference ?? 'No reference'}</span>
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(selectedTicket.status)}`}>
                          {selectedTicket.status ?? 'Unknown'}
                        </span>
                        {assignedAt(selectedTicket) && (
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-900">
                            Assigned to me
                          </span>
                        )}
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
                        disabled={assignMut.isPending || Boolean(assignedAt(selectedTicket))}
                        onClick={() => assignMut.mutate(selectedTicket.id)}
                      >
                        {assignMut.isPending ? 'Assigning…' : assignedAt(selectedTicket) ? 'Assigned to me' : 'Assign to me'}
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
                  <AiSummaryCard
                    ticketId={selectedTicket.id}
                    analysis={analysisQuery.data ?? null}
                    isLoading={analysisQuery.isLoading}
                    isRefreshing={refreshAnalysisMut.isPending}
                    error={
                      analysisQuery.isError
                        ? (analysisQuery.error as Error).message
                        : refreshAnalysisMut.isError
                          ? (refreshAnalysisMut.error as Error).message
                          : null
                    }
                    hasMessages={(messagesQuery.data?.length ?? 0) > 0}
                    onRefresh={() => refreshAnalysisMut.mutate(selectedTicket.id)}
                  />

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
                              {highlightTicketMessageBody(message.bodyText, analysisQuery.data ?? null)}
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

type AiSummaryCardProps = {
  ticketId: string;
  analysis: PuzzelTicketAnalysis | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  hasMessages: boolean;
  onRefresh: () => void;
};

/**
 * AI-generated overview of a Puzzel billing ticket: detected request type
 * (Rechnungskorrektur / Zusendung / sonstiges) and extracted booking details
 * (reservation #, room #, dates, guest name, …). Sits at the top of the
 * selected ticket's right pane so the receptionist sees the gist before
 * scrolling through the message thread.
 */
function AiSummaryCard({
  ticketId,
  analysis,
  isLoading,
  isRefreshing,
  error,
  hasMessages,
  onRefresh,
}: AiSummaryCardProps) {
  // Re-render hint: tie key off ticketId so React resets internal state when switching tickets.
  void ticketId;

  if (!hasMessages) {
    return (
      <section className="rounded-2xl border border-dashed border-border bg-surface p-4 text-sm text-ink-muted">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          KI-Übersicht
        </p>
        <p className="mt-2 leading-relaxed">
          Sobald die Nachrichten dieses Tickets aus Puzzel geladen sind, fasst die KI das
          Anliegen automatisch zusammen.
        </p>
      </section>
    );
  }

  if (isLoading) {
    return (
      <section className="rounded-2xl border border-border bg-surface p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          KI-Übersicht
        </p>
        <p className="mt-2 text-sm text-ink-muted">
          Analyse läuft … (üblicherweise 3–8 Sekunden)
        </p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-rose-900">
            KI-Übersicht — Fehler
          </p>
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="text-xs font-medium text-rose-900 underline disabled:opacity-50"
          >
            {isRefreshing ? 'Wiederholt …' : 'Erneut versuchen'}
          </button>
        </div>
        <p className="mt-2 break-words leading-relaxed">{error}</p>
        <p className="mt-2 text-xs text-rose-900/80">
          Falls noch kein OpenAI-API-Key hinterlegt ist: Admin → Settings → AI Config.
        </p>
      </section>
    );
  }

  if (!analysis) {
    return null;
  }

  const bd = analysis.bookingDetails;
  const fmt = (value: string | null | undefined) =>
    value && String(value).trim().length > 0 ? String(value).trim() : MISSING_FIELD;

  const primaryRows: { label: string; value: string }[] = [
    {
      label: 'Invoice request (AI)',
      value: INVOICE_ACTION_LABEL[analysis.invoiceAction] ?? analysis.invoiceAction,
    },
    { label: 'Guest name', value: fmt(bd.guestName) },
    { label: 'Reservation number', value: fmt(bd.reservationNumber) },
    { label: 'Check-in date', value: fmt(bd.checkInDate) },
    { label: 'Check-out date', value: fmt(bd.checkOutDate) },
    { label: 'Booking platform', value: fmt(bd.bookingPlatform) },
    { label: 'Issue type', value: fmt(analysis.issueTypeLabel) },
    {
      label: 'Urgency',
      value: `${URGENCY_LABEL[analysis.urgencyLevel]} (${analysis.urgencyLevel})`,
    },
  ];
  const secondaryRows: { label: string; value: string }[] = [
    { label: 'Invoice number', value: fmt(bd.invoiceNumber) },
    { label: 'Room', value: fmt(bd.roomNumber) },
    { label: 'Category', value: REQUEST_TYPE_LABEL[analysis.requestType] },
    { label: 'Extraction confidence', value: CONFIDENCE_LABEL[analysis.confidence] },
  ];

  const missing = (v: string) => v === MISSING_FIELD;

  const cib = analysis.companyInvoiceBillingDetails;
  const requestedOnInvoice = (
    Object.keys(cib.fieldsRequestedOnInvoice) as Array<
      keyof CompanyInvoiceBillingDetails['fieldsRequestedOnInvoice']
    >
  ).filter((k) => cib.fieldsRequestedOnInvoice[k]);

  return (
    <section className="sticky top-0 z-20 rounded-2xl border border-action/35 bg-surface/95 p-4 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.25)] ring-1 ring-black/[0.04] backdrop-blur-md supports-[backdrop-filter]:bg-surface/90">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-action">
              AI summary
            </span>
            <span
              className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${URGENCY_TONE[analysis.urgencyLevel]}`}
            >
              {URGENCY_LABEL[analysis.urgencyLevel]}
            </span>
            {analysis.stale && (
              <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-950">
                Outdated — new messages
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${INVOICE_ACTION_TONE[analysis.invoiceAction]}`}
              title={analysis.invoiceAction}
            >
              {INVOICE_ACTION_LABEL[analysis.invoiceAction]}
            </span>
            <span
              className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${REQUEST_TYPE_TONE[analysis.requestType]}`}
            >
              {REQUEST_TYPE_LABEL[analysis.requestType]}
            </span>
            <span className="rounded-full border border-border bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-ink-muted">
              {CONFIDENCE_LABEL[analysis.confidence]}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="shrink-0 text-xs font-medium text-action hover:underline disabled:opacity-50"
        >
          {isRefreshing ? 'Refreshing…' : 'Re-analyze'}
        </button>
      </div>

      <p className="mt-3 text-base font-semibold leading-snug text-ink">
        {analysis.summary}
      </p>

      <div className="mt-4">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
          Key fields
        </p>
        <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {primaryRows.map((row) => (
            <div
              key={row.label}
              className={`rounded-xl border px-3 py-2.5 ${
                missing(row.value) ? 'border-dashed border-border bg-surface-muted/50' : 'border-border bg-surface'
              }`}
            >
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
                {row.label}
              </dt>
              <dd
                className={`mt-1 break-words text-sm font-medium leading-snug ${
                  missing(row.value) ? 'text-ink-muted italic' : 'text-ink'
                }`}
              >
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="mt-4 rounded-xl border border-border bg-surface-muted/35 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
          Company / invoice address (AI)
        </p>
        <p className="mt-2 text-sm font-medium leading-snug text-ink">
          {COMPANY_BILLING_INTENT_LABEL[cib.intent]}
        </p>
        {requestedOnInvoice.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {requestedOnInvoice.map((k) => (
              <span
                key={k}
                className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-900"
              >
                On invoice: {COMPANY_BILLING_FIELD_LABEL[k]}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs text-ink-muted">
            No line-items explicitly flagged as “must appear on invoice” (may still be a firm booking — see intent above).
          </p>
        )}
        <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {(
            Object.keys(COMPANY_BILLING_FIELD_LABEL) as Array<
              keyof typeof COMPANY_BILLING_FIELD_LABEL
            >
          ).map((key) => (
            <div
              key={key}
              className={`rounded-lg border px-3 py-2 ${
                missing(fmt(cib.extracted[key]))
                  ? 'border-dashed border-border bg-surface/60'
                  : 'border-border bg-surface'
              }`}
            >
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
                {COMPANY_BILLING_FIELD_LABEL[key]} (from message)
              </dt>
              <dd
                className={`mt-0.5 break-words text-sm font-medium ${
                  missing(fmt(cib.extracted[key])) ? 'text-ink-muted italic' : 'text-ink'
                }`}
              >
                {fmt(cib.extracted[key])}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="mt-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
          Additional
        </p>
        <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {secondaryRows.map((row) => (
            <div key={row.label} className="rounded-xl border border-border bg-surface px-3 py-2">
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
                {row.label}
              </dt>
              <dd className="mt-1 break-words text-sm font-medium text-ink">{row.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {bd.otherDetails.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink">
          {bd.otherDetails.map((detail, idx) => (
            <li key={idx}>{detail}</li>
          ))}
        </ul>
      )}

      {analysis.rationale && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-ink-muted hover:text-ink">
            AI rationale
          </summary>
          <p className="mt-2 whitespace-pre-wrap rounded-lg border border-border bg-surface-muted/40 p-3 text-xs leading-relaxed text-ink-muted">
            {analysis.rationale}
          </p>
        </details>
      )}

      <p className="mt-3 text-[10px] uppercase tracking-wide text-ink-muted">
        Model: {analysis.model}
      </p>
    </section>
  );
}
