'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/Button';
import { AppPageChrome, AppPageBody, APP_DARK_CARD, APP_DARK_INPUT } from '@/components/nav/AppPageChrome';
import { AppChromeTools } from '@/components/nav/AppChromeTools';
import { useReceptionMobileMode } from '@/lib/reception-mobile-context';

/** Secondary button on the dark chrome — outline instead of the light "secondary" fill. */
const DARK_SECONDARY_BTN = 'border border-sidebar-border bg-transparent text-white hover:bg-white/10';

type PuzzelTicketPrizeCategory =
  | 'SPAM'
  | 'RECHNUNG_ANGEFRAGT'
  | 'RECHNUNGSKORREKTUR'
  | 'MEHRERE_RECHNUNGSANFRAGEN'
  | 'SONSTIGES';

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
  analysis?: {
    prizeCategory: PuzzelTicketPrizeCategory;
    summary: string;
    updatedAt: string;
  } | null;
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
  prizeCategory: PuzzelTicketPrizeCategory;
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
  /** KI-Entwurf für die E-Mail-Antwort an den Gast — vor Versand prüfen und ggf. PDF anhängen. */
  suggestedGuestReply: string;
  model: string;
  stale: boolean;
  createdAt: string;
  updatedAt: string;
};

const PRIZE_CATEGORY_LABEL: Record<PuzzelTicketPrizeCategory, string> = {
  SPAM: 'Spam',
  RECHNUNG_ANGEFRAGT: 'Rechnung angefragt',
  RECHNUNGSKORREKTUR: 'Rechnungskorrektur',
  MEHRERE_RECHNUNGSANFRAGEN: 'Mehrere Rechnungsanfragen',
  SONSTIGES: 'Sonstiges (Rechnung)',
};

const PRIZE_CATEGORY_TONE: Record<PuzzelTicketPrizeCategory, string> = {
  SPAM: 'border-slate-400/30 bg-slate-500/15 text-slate-300',
  RECHNUNG_ANGEFRAGT: 'border-sky-400/30 bg-sky-500/15 text-sky-300',
  RECHNUNGSKORREKTUR: 'border-amber-400/30 bg-amber-500/15 text-amber-300',
  MEHRERE_RECHNUNGSANFRAGEN: 'border-violet-400/30 bg-violet-500/15 text-violet-300',
  SONSTIGES: 'border-teal-400/30 bg-teal-500/15 text-teal-300',
};

const ALL_PRIZE_CATEGORIES = Object.keys(PRIZE_CATEGORY_LABEL) as PuzzelTicketPrizeCategory[];

function countTicketsByPrizeCategory(source: PuzzelTicket[]) {
  const counts: Record<PuzzelTicketPrizeCategory, number> = {
    SPAM: 0,
    RECHNUNG_ANGEFRAGT: 0,
    RECHNUNGSKORREKTUR: 0,
    MEHRERE_RECHNUNGSANFRAGEN: 0,
    SONSTIGES: 0,
  };
  let none = 0;
  for (const t of source) {
    const c = t.analysis?.prizeCategory;
    if (c && c in counts) {
      counts[c]++;
    } else {
      none++;
    }
  }
  return { counts, none };
}

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
  resend_only: 'border-sky-400/30 bg-sky-500/15 text-sky-300',
  correct_and_reissue: 'border-amber-400/30 bg-amber-500/15 text-amber-300',
  new_or_additional_invoice: 'border-violet-400/30 bg-violet-500/15 text-violet-300',
  vat_tax_legal: 'border-indigo-400/30 bg-indigo-500/15 text-indigo-300',
  payment_refund: 'border-rose-400/30 bg-rose-500/15 text-rose-300',
  invoice_question: 'border-teal-400/30 bg-teal-500/15 text-teal-300',
  other_billing: 'border-slate-400/30 bg-slate-500/15 text-slate-300',
  unclear: 'border-sidebar-border/60 bg-white/5 text-sidebar-muted',
};

const REQUEST_TYPE_LABEL: Record<PuzzelTicketAnalysisRequestType, string> = {
  invoice_correction: 'Rechnungskorrektur',
  invoice_resend: 'Rechnung zusenden',
  invoice_other: 'Sonstige Rechnungsfrage',
  unknown: 'Unklar',
};

const REQUEST_TYPE_TONE: Record<PuzzelTicketAnalysisRequestType, string> = {
  invoice_correction: 'border-amber-400/30 bg-amber-500/15 text-amber-300',
  invoice_resend: 'border-sky-400/30 bg-sky-500/15 text-sky-300',
  invoice_other: 'border-violet-400/30 bg-violet-500/15 text-violet-300',
  unknown: 'border-sidebar-border/60 bg-white/5 text-sidebar-muted',
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
  critical: 'border-rose-400/30 bg-rose-500/15 text-rose-300',
  high: 'border-amber-400/30 bg-amber-500/15 text-amber-300',
  normal: 'border-slate-400/30 bg-slate-500/15 text-slate-300',
  low: 'border-sidebar-border/60 bg-white/5 text-sidebar-muted',
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
        className="rounded-sm bg-amber-500/35 px-0.5 text-amber-100"
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
  const cat = ticket.analysis?.prizeCategory
    ? PRIZE_CATEGORY_LABEL[ticket.analysis.prizeCategory]
    : '';
  return [
    ticket.reference,
    ticket.subject,
    ticket.status,
    ticket.rowSummary,
    ticket.externalKey,
    ticket.analysis?.summary,
    cat,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function statusTone(status: string | null) {
  const s = status?.toLowerCase() ?? '';
  if (/(closed|done|solved|resolved|fermé|geschlossen)/.test(s)) {
    return 'border-emerald-400/30 bg-emerald-500/15 text-emerald-300';
  }
  if (/(new|open|neu|pending|created)/.test(s)) {
    return 'border-amber-400/30 bg-amber-500/15 text-amber-300';
  }
  if (/(urgent|error|failed|overdue|kritisch)/.test(s)) {
    return 'border-rose-400/30 bg-rose-500/15 text-rose-300';
  }
  return 'border-sidebar-border/60 bg-white/5 text-sidebar-muted';
}

/** Synced Puzzel row status: archive tab (Resolved / Closed in CM). */
function isPuzzelTicketArchivedStatus(status: string | null | undefined): boolean {
  if (!status?.trim()) return false;
  const u = status.trim().toUpperCase();
  return u === 'RESOLVED' || u === 'CLOSED';
}

/**
 * Puzzel shows **Resolve Ticket** while the ticket is still actionable in CM
 * (not already Resolved/Closed) — same idea as the pink Resolve control in the web UI.
 */
function showPuzzelResolveTicketAction(status: string | null | undefined): boolean {
  return !isPuzzelTicketArchivedStatus(status);
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

function initials(value: string | null | undefined) {
  const text = value?.trim() || '?';
  return text
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?';
}

/** Open / in-progress tickets in the left list — not only the „Aktiv“ tab. */
function canReplyOrResolveInBucket(
  bucket: 'active' | 'resolved' | 'all',
  ticketStatus: string | null | undefined,
): boolean {
  if (isPuzzelTicketArchivedStatus(ticketStatus)) return false;
  return bucket !== 'resolved';
}

export default function ReceptionPuzzlePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { enterMobile } = useReceptionMobileMode();
  const isAdmin = user?.role === 'ADMIN';
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<PuzzelTicketPrizeCategory | ''>('');
  const [ticketBucket, setTicketBucket] = useState<'active' | 'resolved' | 'all'>('active');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const replyFileInputRef = useRef<HTMLInputElement>(null);
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
  const activeTickets = useMemo(
    () => tickets.filter((t) => !isPuzzelTicketArchivedStatus(t.status)),
    [tickets],
  );
  const resolvedTickets = useMemo(
    () => tickets.filter((t) => isPuzzelTicketArchivedStatus(t.status)),
    [tickets],
  );
  const bucketTickets =
    ticketBucket === 'active'
      ? activeTickets
      : ticketBucket === 'resolved'
        ? resolvedTickets
        : tickets;

  const statuses = useMemo(() => {
    return Array.from(
      new Set(bucketTickets.map((ticket) => ticket.status).filter(Boolean) as string[]),
    ).sort((a, b) => a.localeCompare(b));
  }, [bucketTickets]);

  const filteredTickets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bucketTickets.filter((ticket) => {
      const matchesStatus = !statusFilter || ticket.status === statusFilter;
      const matchesCategory =
        !categoryFilter || ticket.analysis?.prizeCategory === categoryFilter;
      const matchesSearch = !q || ticketSearchText(ticket).includes(q);
      return matchesStatus && matchesCategory && matchesSearch;
    });
  }, [search, statusFilter, categoryFilter, bucketTickets]);

  useEffect(() => {
    if (statusFilter && !statuses.includes(statusFilter)) {
      setStatusFilter('');
    }
  }, [statusFilter, statuses]);

  useEffect(() => {
    if (!expandedId) return;
    const t = tickets.find((x) => x.id === expandedId);
    if (!t) return;
    if (ticketBucket === 'all') return;
    if (ticketBucket === 'active' && isPuzzelTicketArchivedStatus(t.status)) {
      setExpandedId(null);
    }
    if (ticketBucket === 'resolved' && !isPuzzelTicketArchivedStatus(t.status)) {
      setExpandedId(null);
    }
  }, [tickets, expandedId, ticketBucket]);

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
    queryKey: ['puzzle', 'ticket-analysis', expandedId, 'sgr'],
    // The endpoint generates the analysis on-demand; we only fire it once
    // per selected ticket and reuse the cached result on tab-switches.
    queryFn: () =>
      api<PuzzelTicketAnalysis>(`/puzzle/tickets/${expandedId}/analysis`),
    enabled: !!expandedId && (messagesQuery.data?.length ?? 0) > 0,
    retry: false,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  useEffect(() => {
    const data = analysisQuery.data;
    if (!expandedId || !data) return;
    queryClient.setQueryData<PuzzelTicket[]>(['puzzle', 'tickets'], (curr) =>
      curr?.map((t) =>
        t.id === expandedId
          ? {
              ...t,
              analysis: {
                prizeCategory: data.prizeCategory,
                summary: data.summary,
                updatedAt: data.updatedAt,
              },
            }
          : t,
      ),
    );
  }, [analysisQuery.data, expandedId, queryClient]);

  const refreshAnalysisMut = useMutation({
    mutationFn: (ticketId: string) =>
      api<PuzzelTicketAnalysis>(`/puzzle/tickets/${ticketId}/analysis/refresh`, {
        method: 'POST',
      }),
    onSuccess: (data, ticketId) => {
      queryClient.setQueryData(['puzzle', 'ticket-analysis', ticketId, 'sgr'], data);
      queryClient.setQueryData<PuzzelTicket[]>(['puzzle', 'tickets'], (curr) =>
        curr?.map((t) =>
          t.id === ticketId
            ? {
                ...t,
                analysis: {
                  prizeCategory: data.prizeCategory,
                  summary: data.summary,
                  updatedAt: data.updatedAt,
                },
              }
            : t,
        ),
      );
    },
  });

  const resolveMut = useMutation({
    mutationFn: (ticketId: string) =>
      api<{ ok: true; action: string }>(`/puzzle/tickets/${ticketId}/resolve`, { method: 'POST' }),
    onSuccess: (_data, ticketId) => {
      queryClient.setQueryData<PuzzelTicket[]>(['puzzle', 'tickets'], (curr) =>
        curr?.map((t) => (t.id === ticketId ? { ...t, status: 'RESOLVED' } : t)),
      );
      queryClient.invalidateQueries({ queryKey: ['puzzle', 'tickets'] });
      queryClient.invalidateQueries({ queryKey: ['puzzle', 'ticket-messages', ticketId] });
      setTicketBucket((prev) => (prev === 'active' ? 'resolved' : prev));
      setExpandedId(ticketId);
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
    mutationFn: ({ ticketId, message, files }: { ticketId: string; message: string; files: File[] }) => {
      const fd = new FormData();
      fd.append('message', message);
      for (const f of files) {
        fd.append('attachments', f);
      }
      return api<{ ok: true; action: 'reply' }>(`/puzzle/tickets/${ticketId}/reply`, {
        method: 'POST',
        body: fd,
      });
    },
    onSuccess: (_data, vars) => {
      setReplyText('');
      setReplyFiles([]);
      if (replyFileInputRef.current) replyFileInputRef.current.value = '';
      queryClient.setQueryData<PuzzelTicket[]>(['puzzle', 'tickets'], (curr) =>
        curr?.map((t) => (t.id === vars.ticketId ? { ...t, status: 'RESOLVED' } : t)),
      );
      queryClient.invalidateQueries({ queryKey: ['puzzle', 'ticket-messages', vars.ticketId] });
      queryClient.invalidateQueries({ queryKey: ['puzzle', 'tickets'] });
      setTicketBucket((prev) => (prev === 'active' ? 'resolved' : prev));
      setExpandedId(vars.ticketId);
    },
  });

  useEffect(() => {
    setReplyText('');
    setReplyFiles([]);
  }, [expandedId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AppPageChrome
        title="Puzzel Tickets"
        description="Alle synchronisierten Tickets aus Puzzel CM für die Rezeption"
        actions={
          <>
            <AppChromeTools onEnterMobile={enterMobile} />
            {isAdmin && (
              <Button
                type="button"
                variant="action"
                className="min-h-[40px]"
                disabled={syncMut.isPending || status?.inProgress}
                onClick={() => syncMut.mutate()}
              >
                {status?.inProgress ? 'Läuft…' : syncMut.isPending ? 'Starte…' : 'Jetzt synchronisieren'}
              </Button>
            )}
          </>
        }
      />

      <AppPageBody>
        <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div />
        <div className="flex flex-col items-start gap-1 sm:items-end">
          {status?.lastSyncedAt != null && (
            <p className="text-xs text-sidebar-muted">
              Zuletzt synchronisiert: {formatDateTime(status.lastSyncedAt)}
              {typeof status.lastTicketCount === 'number' ? ` · ${status.lastTicketCount} Tickets` : ''}
            </p>
          )}
          {status?.inProgress && (
            <p className="text-xs font-medium text-amber-300">Synchronisation läuft…</p>
          )}
          {status?.lastError && !status?.inProgress && (
            <p className="max-w-xl text-xs text-rose-300">{status.lastError}</p>
          )}
          {isAdmin && syncMut.data?.status === 'already_running' && (
            <span className="text-xs text-sidebar-muted">Bereits aktiv.</span>
          )}
          {isAdmin && syncMut.isError && (
            <span className="text-xs text-rose-300">{(syncMut.error as Error).message}</span>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className={clsx(APP_DARK_CARD, 'p-4')}>
          <p className="text-xs font-semibold uppercase tracking-wide text-sidebar-muted">Aktive Tickets</p>
          <p className="mt-1 text-2xl font-semibold text-white">{activeTickets.length}</p>
        </div>
        <div className={clsx(APP_DARK_CARD, 'p-4')}>
          <p className="text-xs font-semibold uppercase tracking-wide text-sidebar-muted">Erledigt (Resolved)</p>
          <p className="mt-1 text-2xl font-semibold text-white">{resolvedTickets.length}</p>
        </div>
        <div className={clsx(APP_DARK_CARD, 'p-4')}>
          <p className="text-xs font-semibold uppercase tracking-wide text-sidebar-muted">In dieser Ansicht</p>
          <p className="mt-1 text-2xl font-semibold text-white">{filteredTickets.length}</p>
        </div>
        <div className={clsx(APP_DARK_CARD, 'p-4')}>
          <p className="text-xs font-semibold uppercase tracking-wide text-sidebar-muted">Sync-Status</p>
          <p className="mt-1 text-sm font-medium text-white">
            {status?.inProgress ? 'Synchronisation läuft' : status?.lastError ? 'Letzter Lauf mit Fehler' : 'Bereit'}
          </p>
        </div>
      </div>

      <div className={clsx(APP_DARK_CARD, 'p-4')}>
        <p className="text-xs font-semibold uppercase tracking-wide text-sidebar-muted">Ticket-Ansicht</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            variant={ticketBucket === 'active' ? 'action' : 'secondary'}
            className={clsx('min-h-[44px]', ticketBucket !== 'active' && DARK_SECONDARY_BTN)}
            onClick={() => {
              setTicketBucket('active');
              setExpandedId(null);
            }}
          >
            Aktive Tickets ({activeTickets.length})
          </Button>
          <Button
            type="button"
            variant={ticketBucket === 'resolved' ? 'action' : 'secondary'}
            className={clsx('min-h-[44px]', ticketBucket !== 'resolved' && DARK_SECONDARY_BTN)}
            onClick={() => {
              setTicketBucket('resolved');
              setExpandedId(null);
            }}
          >
            Erledigt — Resolved ({resolvedTickets.length})
          </Button>
          <Button
            type="button"
            variant={ticketBucket === 'all' ? 'action' : 'secondary'}
            className={clsx('min-h-[44px]', ticketBucket !== 'all' && DARK_SECONDARY_BTN)}
            onClick={() => {
              setTicketBucket('all');
              setExpandedId(null);
            }}
          >
            Alle Tickets ({tickets.length})
          </Button>
        </div>
        <p className="mt-2 text-xs text-sidebar-muted">
          Unter „Alle Status“ (Filter) siehst du nur Status-Werte der aktuellen Ansicht — bei „Aktiv“ bzw. „Erledigt“
          jeweils eine Teilmenge. Für die komplette Liste „Alle Tickets“ wählen. Resolved/Closed erscheinen unter
          „Erledigt“. Nach dem Senden einer Antwort über PrizeBern wird der Status wie in Puzzel auf Resolved gesetzt.
        </p>
      </div>

      <div className={clsx(APP_DARK_CARD, 'p-4')}>
        <p className="text-xs font-semibold uppercase tracking-wide text-sidebar-muted">Tickets nach KI-Kategorie</p>
        <p className="mt-1 text-sm text-sidebar-muted">
          Anzahl pro PrizeBern-Kategorie (Spam, Rechnung angefragt, …), basierend auf der gespeicherten KI-Auswertung.
        </p>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          {(
            [
              { key: 'active' as const, title: 'Aktive Tickets', list: activeTickets },
              { key: 'resolved' as const, title: 'Erledigt (Resolved/Closed)', list: resolvedTickets },
            ] as const
          ).map(({ key, title, list }) => {
            const { counts, none } = countTicketsByPrizeCategory(list);
            return (
              <div key={key}>
                <p className="text-xs font-semibold text-white">
                  {title}{' '}
                  <span className="font-normal text-sidebar-muted">({list.length} gesamt)</span>
                </p>
                <ul className="mt-2 space-y-1.5 text-sm">
                  {ALL_PRIZE_CATEGORIES.map((cat) => (
                    <li
                      key={cat}
                      className="flex items-center justify-between gap-2 rounded-lg border border-sidebar-border/60 bg-white/5 px-2.5 py-1.5"
                    >
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${PRIZE_CATEGORY_TONE[cat]}`}>
                        {PRIZE_CATEGORY_LABEL[cat]}
                      </span>
                      <span className="font-mono tabular-nums text-sm font-semibold text-white">{counts[cat]}</span>
                    </li>
                  ))}
                  <li className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-sidebar-border/60 bg-white/[0.02] px-2.5 py-1.5 text-sidebar-muted">
                    <span className="text-xs font-medium">Keine KI-Auswertung</span>
                    <span className="font-mono tabular-nums text-sm font-semibold text-white">{none}</span>
                  </li>
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      {ticketsQuery.isLoading && <p className="text-sm text-sidebar-muted">Lädt Tickets…</p>}

      <div className={clsx(APP_DARK_CARD, 'p-4')}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Puzzel-Filter</h2>
            <p className="text-sm text-sidebar-muted">
              Diese Werte nutzt der Sync in Puzzel, bevor er die Ticketliste ausliest.
            </p>
          </div>
          {saveFilterMut.isSuccess && !saveFilterMut.isPending && (
            <span className="text-xs font-medium text-emerald-300">Filter gespeichert.</span>
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
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-sidebar-muted">Saved Search</span>
            <input
              value={filterDraft.savedSearchName}
              onChange={(e) => setFilterDraft((f) => ({ ...f, savedSearchName: e.target.value }))}
              disabled={!isAdmin}
              className={clsx(APP_DARK_INPUT, 'min-h-[44px] w-full disabled:opacity-50')}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-sidebar-muted">Team</span>
            <input
              value={filterDraft.teamName}
              onChange={(e) => setFilterDraft((f) => ({ ...f, teamName: e.target.value }))}
              disabled={!isAdmin}
              className={clsx(APP_DARK_INPUT, 'min-h-[44px] w-full disabled:opacity-50')}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-sidebar-muted">Status</span>
            <input
              value={filterDraft.statusName}
              onChange={(e) => setFilterDraft((f) => ({ ...f, statusName: e.target.value }))}
              disabled={!isAdmin}
              className={clsx(APP_DARK_INPUT, 'min-h-[44px] w-full disabled:opacity-50')}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-sidebar-muted">Time Period</span>
            <input
              value={filterDraft.timePeriod}
              onChange={(e) => setFilterDraft((f) => ({ ...f, timePeriod: e.target.value }))}
              disabled={!isAdmin}
              className={clsx(APP_DARK_INPUT, 'min-h-[44px] w-full disabled:opacity-50')}
            />
          </label>
          {isAdmin && (
            <div className="flex items-end md:col-span-4">
              <Button
                type="submit"
                variant="secondary"
                className={clsx('min-h-[44px]', DARK_SECONDARY_BTN)}
                disabled={saveFilterMut.isPending}
              >
                {saveFilterMut.isPending ? 'Speichert…' : 'Filter speichern'}
              </Button>
              {saveFilterMut.isError && (
                <span className="ml-3 text-sm text-rose-300">{(saveFilterMut.error as Error).message}</span>
              )}
            </div>
          )}
        </form>
      </div>

      {!ticketsQuery.isLoading && tickets.length === 0 && (
        <div className={clsx(APP_DARK_CARD, 'p-6')}>
          <p className="text-sm text-sidebar-muted">
            Noch keine Tickets. Sobald ein Admin unter <strong className="text-white">Puzzle → Zugangsdaten</strong> E-Mail,
            Passwort und 2FA-Seed eingetragen hat, holt der Server die Liste automatisch etwa alle 15&nbsp;Minuten
            (deaktivieren: Umgebungsvariable <code className="rounded bg-white/10 px-1 text-white">PUZZEL_AUTO_SYNC=false</code>).
            Zusätzlich kann ein Admin <strong className="text-white">Jetzt synchronisieren</strong> auslösen.
          </p>
        </div>
      )}

      {tickets.length > 0 && (
        <div className="grid items-start gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
          <div className={clsx(APP_DARK_CARD, 'p-4')}>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-sidebar-muted">Suchen</span>
              <input
                type="search"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setExpandedId(null);
                }}
                placeholder="Referenz, Betreff, Status oder Text suchen…"
                className={clsx(APP_DARK_INPUT, 'min-h-[44px] w-full')}
              />
            </label>
            <label className="mt-3 block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-sidebar-muted">Status</span>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setExpandedId(null);
                }}
                className={clsx(APP_DARK_INPUT, 'min-h-[44px] w-full')}
              >
                <option value="">Alle Status</option>
                {statuses.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-3 block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-sidebar-muted">Kategorie (KI)</span>
              <select
                value={categoryFilter}
                onChange={(e) => {
                  setCategoryFilter((e.target.value as PuzzelTicketPrizeCategory | '') || '');
                  setExpandedId(null);
                }}
                className={clsx(APP_DARK_INPUT, 'min-h-[44px] w-full')}
              >
                <option value="">Alle Kategorien</option>
                {(Object.keys(PRIZE_CATEGORY_LABEL) as PuzzelTicketPrizeCategory[]).map((c) => (
                  <option key={c} value={c}>
                    {PRIZE_CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-3 flex items-end">
              <Button
                type="button"
                variant="secondary"
                className={clsx('min-h-[44px] w-full', DARK_SECONDARY_BTN)}
                onClick={() => {
                  setSearch('');
                  setStatusFilter('');
                  setCategoryFilter('');
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
                      setReplyFiles([]);
                    }}
                    className={`w-full rounded-2xl border p-4 text-left transition ${
                      selected
                        ? 'border-action bg-action/10 shadow-none'
                        : 'border-sidebar-border/60 bg-white/5 hover:border-action/40 hover:bg-white/10'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs text-sidebar-muted">{ticket.reference ?? 'No reference'}</span>
                          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusTone(ticket.status)}`}>
                            {ticket.status ?? 'Unknown'}
                          </span>
                          {ticket.analysis?.prizeCategory && (
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${PRIZE_CATEGORY_TONE[ticket.analysis.prizeCategory]}`}
                            >
                              {PRIZE_CATEGORY_LABEL[ticket.analysis.prizeCategory]}
                            </span>
                          )}
                        </div>
                        <p className="mt-2 line-clamp-2 text-sm font-semibold leading-snug text-white">{ticket.subject}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-white/10 px-2 py-1 text-[11px] text-sidebar-muted">
                        {formatDateTime(ticket.scrapedAt)}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-sidebar-muted">
                      {team && <span className="rounded-full bg-white/10 px-2 py-1">Team: {team}</span>}
                      {lastActivity && <span className="rounded-full bg-white/10 px-2 py-1">Last activity: {lastActivity}</span>}
                    </div>
                    <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-sidebar-muted">{ticket.rowSummary}</p>
                  </button>
                );
              })}
            </div>
            {filteredTickets.length === 0 && (
              <p className="mt-4 rounded-xl border border-sidebar-border/60 bg-white/5 p-4 text-sm text-sidebar-muted">
                Keine Tickets passen zu den aktuellen Filtern.
              </p>
            )}
          </div>

          <div className={clsx(APP_DARK_CARD, 'flex min-h-[620px] flex-col overflow-hidden xl:sticky xl:top-4 xl:z-10 xl:max-h-[calc(100dvh-2rem)]')}>
            {selectedTicket ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="shrink-0 border-b border-sidebar-border/60 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-sidebar-muted">{selectedTicket.reference ?? 'No reference'}</span>
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(selectedTicket.status)}`}>
                          {selectedTicket.status ?? 'Unknown'}
                        </span>
                        {assignedAt(selectedTicket) && (
                          <span className="rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-300">
                            Assigned to me
                          </span>
                        )}
                      </div>
                      <h2 className="mt-2 text-xl font-semibold leading-tight text-white">{selectedTicket.subject}</h2>
                      <p className="mt-1 text-sm text-sidebar-muted">
                        Synced {formatDateTime(selectedTicket.scrapedAt)}
                        {metaText(selectedTicket, 'lastActivity') ? ` · Last activity ${metaText(selectedTicket, 'lastActivity')}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        className={clsx('min-h-[40px]', DARK_SECONDARY_BTN)}
                        disabled={assignMut.isPending || Boolean(assignedAt(selectedTicket))}
                        onClick={() => assignMut.mutate(selectedTicket.id)}
                      >
                        {assignMut.isPending ? 'Assigning…' : assignedAt(selectedTicket) ? 'Assigned to me' : 'Assign to me'}
                      </Button>
                      {canReplyOrResolveInBucket(ticketBucket, selectedTicket.status) &&
                        showPuzzelResolveTicketAction(selectedTicket.status) && (
                        <Button
                          type="button"
                          variant="secondary"
                          className={clsx('min-h-[40px]', DARK_SECONDARY_BTN)}
                          disabled={resolveMut.isPending}
                          onClick={() => resolveMut.mutate(selectedTicket.id)}
                        >
                          {resolveMut.isPending ? 'Resolving…' : 'Resolve Ticket'}
                        </Button>
                      )}
                      {selectedTicket.detailHref && (
                        <a
                          href={selectedTicket.detailHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-[40px] items-center rounded-btn border border-sidebar-border px-3 text-sm font-medium text-white hover:bg-white/10"
                        >
                          Open in Puzzel
                        </a>
                      )}
                    </div>
                  </div>
                  {(assignMut.isError || replyMut.isError || resolveMut.isError) && (
                    <p className="mt-3 rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-300">
                      {((assignMut.error || replyMut.error || resolveMut.error) as Error).message}
                    </p>
                  )}
                </div>

                <div className="min-h-0 flex-1 space-y-4 overflow-auto p-5">
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

                  {analysisQuery.isSuccess &&
                    analysisQuery.data &&
                    (messagesQuery.data?.length ?? 0) > 0 &&
                    !analysisQuery.data.suggestedGuestReply?.trim() && (
                      <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                        <p className="text-xs font-semibold uppercase tracking-wide text-amber-300/80">
                          Antwortvorschlag fehlt
                        </p>
                        <p className="mt-2 text-xs leading-relaxed text-amber-200/90">
                          Gespeicherte KI-Analyse ohne Gast-Antwort. Oben in der KI-Übersicht{' '}
                          <strong className="font-semibold text-amber-100">Re-analyze</strong> wählen (oder Ticket
                          erneut öffnen), damit ein Vorschlag erzeugt wird.
                        </p>
                      </div>
                    )}

                  <SuggestedGuestReplyPanel
                    text={analysisQuery.data?.suggestedGuestReply}
                    showApply={canReplyOrResolveInBucket(ticketBucket, selectedTicket.status)}
                    onApply={setReplyText}
                  />

                  <div className="rounded-2xl border border-sidebar-border/60 bg-white/5 p-4 text-xs text-sidebar-muted">
                    <p className="font-semibold uppercase tracking-wide text-sidebar-muted">Ticket summary</p>
                    <p className="mt-2 leading-relaxed">{selectedTicket.rowSummary || selectedTicket.subject}</p>
                  </div>

                  {messagesQuery.isLoading && (
                    <p className="rounded-xl border border-sidebar-border/60 bg-white/5 p-4 text-sm text-sidebar-muted">
                      Loading chat history from Puzzel…
                    </p>
                  )}
                  {messagesQuery.isError && (
                    <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-300">
                      {(messagesQuery.error as Error).message}
                    </p>
                  )}
                  {!messagesQuery.isLoading && !messagesQuery.isError && (messagesQuery.data?.length ?? 0) === 0 && (
                    <p className="rounded-xl border border-sidebar-border/60 bg-white/5 p-4 text-sm text-sidebar-muted">
                      No messages saved yet.
                    </p>
                  )}

                  <ol className="space-y-4">
                    {(messagesQuery.data ?? []).map((message) => {
                      const outbound = message.direction === 'outbound';
                      return (
                        <li key={message.id} className={`flex gap-3 ${outbound ? 'justify-end' : 'justify-start'}`}>
                          {!outbound && (
                            <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-xs font-semibold text-amber-300">
                              {initials(message.fromText)}
                            </div>
                          )}
                          <article
                            className={`max-w-[780px] rounded-2xl border p-4 shadow-sm ${
                              outbound
                                ? 'border-indigo-400/30 bg-indigo-500/20 text-white'
                                : 'border-sidebar-border/60 bg-white/5 text-white'
                            }`}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-sidebar-muted">
                                  {outbound ? 'Hotel reply' : 'Guest message'}
                                </p>
                                <p className="mt-1 text-sm font-medium">
                                  {message.fromText ?? 'Unknown'} → {message.toText ?? 'Unknown'}
                                </p>
                              </div>
                              <span className="text-xs text-sidebar-muted">{message.sentAtText ?? formatDateTime(message.scrapedAt)}</span>
                            </div>
                            <div className="mt-3 max-h-[560px] overflow-auto whitespace-pre-wrap rounded-xl bg-black/20 p-3 text-sm leading-7">
                              {highlightTicketMessageBody(message.bodyText, analysisQuery.data ?? null)}
                            </div>
                          </article>
                          {outbound && (
                            <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-500/20 text-xs font-semibold text-sky-300">
                              {initials(message.fromText)}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                </div>

                <div className="shrink-0 border-t border-sidebar-border/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-sidebar-muted">
                      Reply and attachments are sent through Puzzel (same as the pink Send in the CM composer).
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
                  {canReplyOrResolveInBucket(ticketBucket, selectedTicket.status) ? (
                  <>
                  <form
                    className="mt-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const t = replyText.trim();
                      if (!t && replyFiles.length === 0) return;
                      replyMut.mutate({
                        ticketId: selectedTicket.id,
                        message: t,
                        files: replyFiles,
                      });
                    }}
                  >
                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      rows={5}
                      placeholder="Write a reply to the guest…"
                      className="w-full rounded-2xl border border-sidebar-border bg-sidebar px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-sidebar-muted focus:border-action focus:ring-2 focus:ring-action/30"
                    />
                    {replyFiles.length > 0 && (
                      <ul className="mt-2 space-y-1 rounded-xl border border-sidebar-border/60 bg-white/5 px-3 py-2 text-xs text-white">
                        {replyFiles.map((f, i) => (
                          <li key={`${f.name}-${i}-${f.size}`} className="flex items-center justify-between gap-2">
                            <span className="truncate">{f.name}</span>
                            <button
                              type="button"
                              className="shrink-0 font-medium text-rose-400 hover:underline"
                              onClick={() => setReplyFiles((prev) => prev.filter((_, j) => j !== i))}
                            >
                              Remove
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <div
                          className={
                            replyMut.isPending
                              ? 'relative inline-flex pointer-events-none opacity-50'
                              : 'relative inline-flex'
                          }
                        >
                          <input
                            ref={replyFileInputRef}
                            type="file"
                            multiple
                            disabled={replyMut.isPending}
                            className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                            accept="*/*"
                            aria-label="Attach files"
                            onChange={(e) => {
                              const list = e.target.files;
                              if (!list?.length) return;
                              setReplyFiles((prev) => [...prev, ...Array.from(list)].slice(0, 10));
                              e.target.value = '';
                            }}
                          />
                          <Button
                            type="button"
                            variant="secondary"
                            className={clsx('min-h-[44px] pointer-events-none', DARK_SECONDARY_BTN)}
                            tabIndex={-1}
                          >
                            Attach files
                          </Button>
                        </div>
                        <p className="text-xs text-sidebar-muted">Up to 10 files, 25 MB each.</p>
                      </div>
                      <p className="max-w-md text-xs text-sidebar-muted">
                        Use the same signature/business data you want in Puzzel.
                      </p>
                      <Button
                        type="submit"
                        variant="action"
                        className="min-h-[44px]"
                        disabled={
                          replyMut.isPending || (!replyText.trim() && replyFiles.length === 0)
                        }
                      >
                        {replyMut.isPending ? 'Sending…' : 'Send via Puzzel'}
                      </Button>
                    </div>
                    {replyMut.isSuccess && (
                      <p className="mt-2 text-sm font-medium text-emerald-300">Sent through Puzzel.</p>
                    )}
                  </form>
                  </>
                  ) : (
                    <p className="mt-3 rounded-xl border border-sidebar-border/60 bg-white/5 p-4 text-sm text-sidebar-muted">
                      {ticketBucket === 'resolved' || isPuzzelTicketArchivedStatus(selectedTicket.status)
                        ? 'Archiv: Tickets mit Status Resolved oder Closed in Puzzel. Es können hier keine neuen Antworten mehr gesendet werden.'
                        : 'Dieses Ticket ist erledigt — Antworten über PrizeBern sind deaktiviert.'}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex min-h-[520px] items-center justify-center p-8 text-center">
                <div>
                  <p className="text-lg font-semibold text-white">Select a ticket</p>
                  <p className="mt-1 text-sm text-sidebar-muted">The chat history and actions will appear here.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
        </div>
      </AppPageBody>
    </div>
  );
}

function SuggestedGuestReplyPanel({
  text,
  showApply,
  onApply,
}: {
  text: string | undefined;
  showApply: boolean;
  onApply: (value: string) => void;
}) {
  const body = text?.trim() ?? '';
  if (!body) {
    return null;
  }
  return (
    <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">KI-Antwortvorschlag</p>
          <p className="mt-1 text-xs leading-snug text-emerald-200/80">
            Entwurf für den Gast — bitte prüfen. Wenn die KI eine Rechnung im Anhang erwähnt,{' '}
            <strong className="font-semibold text-emerald-100">vor dem Senden das PDF anhängen</strong>.
          </p>
        </div>
        {showApply && (
          <Button
            type="button"
            variant="secondary"
            className={clsx('min-h-[40px] shrink-0', DARK_SECONDARY_BTN)}
            onClick={() => onApply(body)}
          >
            In Antwort übernehmen
          </Button>
        )}
      </div>
      <div className="mt-3 max-h-72 overflow-auto rounded-xl border border-emerald-400/20 bg-white/5 p-3 text-sm leading-6 text-white whitespace-pre-wrap">
        {body}
      </div>
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
      <section className="rounded-2xl border border-dashed border-sidebar-border/60 bg-white/5 p-4 text-sm text-sidebar-muted">
        <p className="text-xs font-semibold uppercase tracking-wide text-sidebar-muted">
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
      <section className="rounded-2xl border border-sidebar-border/60 bg-white/5 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-sidebar-muted">
          KI-Übersicht
        </p>
        <p className="mt-2 text-sm text-sidebar-muted">
          Analyse läuft … (üblicherweise 3–8 Sekunden)
        </p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-200">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-rose-200">
            KI-Übersicht — Fehler
          </p>
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="text-xs font-medium text-rose-200 underline disabled:opacity-50"
          >
            {isRefreshing ? 'Wiederholt …' : 'Erneut versuchen'}
          </button>
        </div>
        <p className="mt-2 break-words leading-relaxed">{error}</p>
        <p className="mt-2 text-xs text-rose-300/70">
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
    { label: 'Puzzel-Kategorie (PrizeBern)', value: PRIZE_CATEGORY_LABEL[analysis.prizeCategory] },
    { label: 'Technische KI-Anfrageart', value: REQUEST_TYPE_LABEL[analysis.requestType] },
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
    <section className="relative rounded-2xl border border-action/40 bg-white/5 p-4 shadow-none ring-1 ring-white/5">
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
              <span className="rounded-full border border-amber-400/30 bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
                Outdated — new messages
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${PRIZE_CATEGORY_TONE[analysis.prizeCategory]}`}
              title={analysis.prizeCategory}
            >
              {PRIZE_CATEGORY_LABEL[analysis.prizeCategory]}
            </span>
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
            <span className="rounded-full border border-sidebar-border/60 bg-white/5 px-2 py-0.5 text-[11px] font-medium text-sidebar-muted">
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

      <p className="mt-3 text-base font-semibold leading-snug text-white">
        {analysis.summary}
      </p>

      <div className="mt-4">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-sidebar-muted">
          Key fields
        </p>
        <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {primaryRows.map((row) => (
            <div
              key={row.label}
              className={`rounded-xl border px-3 py-2.5 ${
                missing(row.value)
                  ? 'border-dashed border-sidebar-border/60 bg-white/[0.02]'
                  : 'border-sidebar-border/60 bg-white/5'
              }`}
            >
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-sidebar-muted">
                {row.label}
              </dt>
              <dd
                className={`mt-1 break-words text-sm font-medium leading-snug ${
                  missing(row.value) ? 'text-sidebar-muted italic' : 'text-white'
                }`}
              >
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="mt-4 rounded-xl border border-sidebar-border/60 bg-white/5 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-sidebar-muted">
          Company / invoice address (AI)
        </p>
        <p className="mt-2 text-sm font-medium leading-snug text-white">
          {COMPANY_BILLING_INTENT_LABEL[cib.intent]}
        </p>
        {requestedOnInvoice.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {requestedOnInvoice.map((k) => (
              <span
                key={k}
                className="rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300"
              >
                On invoice: {COMPANY_BILLING_FIELD_LABEL[k]}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs text-sidebar-muted">
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
                  ? 'border-dashed border-sidebar-border/60 bg-white/[0.02]'
                  : 'border-sidebar-border/60 bg-white/5'
              }`}
            >
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-sidebar-muted">
                {COMPANY_BILLING_FIELD_LABEL[key]} (from message)
              </dt>
              <dd
                className={`mt-0.5 break-words text-sm font-medium ${
                  missing(fmt(cib.extracted[key])) ? 'text-sidebar-muted italic' : 'text-white'
                }`}
              >
                {fmt(cib.extracted[key])}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="mt-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-sidebar-muted">
          Additional
        </p>
        <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {secondaryRows.map((row) => (
            <div key={row.label} className="rounded-xl border border-sidebar-border/60 bg-white/5 px-3 py-2">
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-sidebar-muted">
                {row.label}
              </dt>
              <dd className="mt-1 break-words text-sm font-medium text-white">{row.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {bd.otherDetails.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-white">
          {bd.otherDetails.map((detail, idx) => (
            <li key={idx}>{detail}</li>
          ))}
        </ul>
      )}

      {analysis.rationale && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-sidebar-muted hover:text-white">
            AI rationale
          </summary>
          <p className="mt-2 whitespace-pre-wrap rounded-lg border border-sidebar-border/60 bg-white/5 p-3 text-xs leading-relaxed text-sidebar-muted">
            {analysis.rationale}
          </p>
        </details>
      )}

      <p className="mt-3 text-[10px] uppercase tracking-wide text-sidebar-muted">
        Model: {analysis.model}
      </p>
    </section>
  );
}
