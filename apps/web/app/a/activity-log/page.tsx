'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { FormEvent, useMemo, useState } from 'react';
import clsx from 'clsx';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { DateInput } from '@/components/ui/DateInput';
import { AppPageChrome, AppPageBody, APP_DARK_CARD, APP_DARK_INPUT } from '@/components/nav/AppPageChrome';
import { AppChromeTools } from '@/components/nav/AppChromeTools';

type ActivityLogRow = {
  id: string;
  createdAt: string;
  action: string;
  label: string;
  category: string;
  actorUserId: string | null;
  actorEmail: string | null;
  actorName: string | null;
  method: string;
  path: string;
  resourceType: string | null;
  resourceId: string | null;
  statusCode: number | null;
  success: boolean;
  errorMessage: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  durationMs: number | null;
};

type ListResponse = {
  items: ActivityLogRow[];
  nextCursor: string | null;
  hasMore: boolean;
};

type CategoryOption = { code: string; label: string };

type SummaryResponse = {
  total: number;
  failed: number;
  byCategory: { category: string; count: number }[];
  topActions: { action: string; label: string; count: number }[];
};

const CATEGORY_LABELS: Record<string, string> = {
  AUTH: 'Anmeldung',
  USER: 'Benutzer',
  ROOM: 'Zimmer',
  CHECKLIST: 'Checkliste',
  PHOTO: 'Fotos',
  SERVICE_REQUEST: 'Service-Requests',
  LOST_FOUND: 'Fundsachen',
  DAMAGE: 'Schäden',
  ASSIGNMENT: 'Zuweisungen',
  INSPECTION: 'Inspektionen',
  SETTINGS: 'Einstellungen',
  ROLE: 'Rollen',
  FLOOR_PLAN: 'Grundrisse',
  TEAM_CHAT: 'Team-Chat',
  SHIFT: 'Schichtplan',
  RESERVATION: 'Reservierungen',
  EMMA: 'EMMA',
  ARRIVAL_CHECK: 'Arrival Check',
  GUIDE: 'Guides',
  SHIFT_HANDOVER: 'Schichtübergabe',
  MONITOR_MAP: 'Monitor Map',
  ROOM_MANAGEMENT: 'Zimmerverwaltung',
  INTEGRATION: 'Integrationen',
  NOTIFICATION: 'Benachrichtigungen',
  SYSTEM: 'System',
  OTHER: 'Sonstiges',
};

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString('de-CH', {
    timeZone: 'Europe/Zurich',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function todayRange(): { from: string; to: string } {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - 7);
  return {
    from: start.toISOString(),
    to: now.toISOString(),
  };
}

export default function ActivityLogPage() {
  const { user } = useAuth();
  const defaultRange = useMemo(() => todayRange(), []);
  const [from, setFrom] = useState(defaultRange.from.slice(0, 10));
  const [to, setTo] = useState(defaultRange.to.slice(0, 10));
  const [category, setCategory] = useState('');
  const [successFilter, setSuccessFilter] = useState<'all' | 'ok' | 'fail'>('all');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    if (from) p.set('from', new Date(`${from}T00:00:00.000Z`).toISOString());
    if (to) p.set('to', new Date(`${to}T23:59:59.999Z`).toISOString());
    if (category) p.set('category', category);
    if (successFilter === 'ok') p.set('success', 'true');
    if (successFilter === 'fail') p.set('success', 'false');
    if (appliedSearch.trim()) p.set('search', appliedSearch.trim());
    p.set('limit', '50');
    return p.toString();
  }, [from, to, category, successFilter, appliedSearch]);

  const { data: categories } = useQuery({
    queryKey: ['activity-log', 'categories'],
    enabled: user?.role === 'ADMIN',
    queryFn: () => api<{ categories: CategoryOption[] }>('/activity-log/categories'),
  });

  const { data: summary } = useQuery({
    queryKey: ['activity-log', 'summary', from, to],
    enabled: user?.role === 'ADMIN',
    queryFn: () => {
      const p = new URLSearchParams();
      if (from) p.set('from', new Date(`${from}T00:00:00.000Z`).toISOString());
      if (to) p.set('to', new Date(`${to}T23:59:59.999Z`).toISOString());
      return api<SummaryResponse>(`/activity-log/summary?${p}`);
    },
  });

  const listQuery = useInfiniteQuery({
    queryKey: ['activity-log', 'list', queryParams],
    enabled: user?.role === 'ADMIN',
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const p = new URLSearchParams(queryParams);
      if (pageParam) p.set('cursor', pageParam);
      return api<ListResponse>(`/activity-log?${p}`);
    },
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor ?? undefined : undefined),
  });

  const rows = listQuery.data?.pages.flatMap((p) => p.items) ?? [];

  function onSearch(e: FormEvent) {
    e.preventDefault();
    setAppliedSearch(search);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AppPageChrome
        title="Aktivitätsprotokoll"
        description="Nachvollziehbare Historie aller Änderungen und Aktionen in der Anwendung (POST, PATCH, PUT, DELETE)."
        actions={<AppChromeTools />}
      />
      <AppPageBody>
        <div className="space-y-6 p-4 md:p-6">
      {summary && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className={APP_DARK_CARD + ' p-4'}>
            <p className="text-xs font-semibold uppercase tracking-wider text-sidebar-muted">Einträge (Zeitraum)</p>
            <p className="mt-1 text-2xl font-semibold text-white">{summary.total}</p>
          </div>
          <div className={APP_DARK_CARD + ' p-4'}>
            <p className="text-xs font-semibold uppercase tracking-wider text-sidebar-muted">Fehlgeschlagen</p>
            <p className="mt-1 text-2xl font-semibold text-red-400">{summary.failed}</p>
          </div>
          <div className={APP_DARK_CARD + ' p-4 sm:col-span-2'}>
            <p className="text-xs font-semibold uppercase tracking-wider text-sidebar-muted">Top-Aktionen</p>
            <ul className="mt-2 space-y-1 text-sm text-white">
              {summary.topActions.slice(0, 5).map((a) => (
                <li key={a.action} className="flex justify-between gap-2">
                  <span className="truncate">{a.label}</span>
                  <span className="shrink-0 font-mono text-xs text-sidebar-muted">{a.count}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className={APP_DARK_CARD + ' space-y-4 p-4'}>
        <form onSubmit={onSearch} className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
          <label className="block text-sm">
            <span className="font-medium text-white">Von</span>
            <div className="mt-1">
              <DateInput value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-white">Bis</span>
            <div className="mt-1">
              <DateInput value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-white">Kategorie</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={clsx(APP_DARK_INPUT, 'mt-1 w-full min-h-[40px]')}
            >
              <option value="">Alle</option>
              {(categories?.categories ?? []).map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-white">Status</span>
            <select
              value={successFilter}
              onChange={(e) => setSuccessFilter(e.target.value as 'all' | 'ok' | 'fail')}
              className={clsx(APP_DARK_INPUT, 'mt-1 w-full min-h-[40px]')}
            >
              <option value="all">Alle</option>
              <option value="ok">Erfolgreich</option>
              <option value="fail">Fehlgeschlagen</option>
            </select>
          </label>
          <label className="block text-sm lg:col-span-1">
            <span className="font-medium text-white">Suche</span>
            <div className="mt-1 flex gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Benutzer, Aktion, Pfad…"
                className={clsx(APP_DARK_INPUT, 'min-h-[40px] flex-1')}
              />
              <Button
                type="submit"
                variant="secondary"
                className="min-h-[40px] shrink-0 border border-sidebar-border bg-transparent px-3 text-white hover:bg-white/10"
              >
                Suchen
              </Button>
            </div>
          </label>
        </form>
      </div>

      {listQuery.isLoading && <p className="text-sm text-sidebar-muted">Lade Protokoll…</p>}

      <div className="space-y-2">
        {rows.map((row) => {
          const expanded = expandedId === row.id;
          return (
            <div key={row.id} className={APP_DARK_CARD + ' overflow-hidden p-0'}>
              <button
                type="button"
                className="flex w-full flex-col gap-2 p-4 text-left hover:bg-white/5 sm:flex-row sm:items-center sm:justify-between"
                onClick={() => setExpandedId(expanded ? null : row.id)}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-white">{row.label}</span>
                    <span
                      className={clsx(
                        'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                        row.success ? 'bg-emerald-400/15 text-emerald-300' : 'bg-red-400/15 text-red-300',
                      )}
                    >
                      {row.success ? 'OK' : 'Fehler'}
                    </span>
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-sidebar-muted">
                      {CATEGORY_LABELS[row.category] ?? row.category}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-sidebar-muted">
                    {row.actorName || row.actorEmail || 'Unbekannt'}
                    {row.actorEmail && row.actorName && row.actorName !== row.actorEmail && (
                      <span className="text-sidebar-muted/70"> · {row.actorEmail}</span>
                    )}
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-sidebar-muted/80">
                    {row.method} {row.path}
                    {row.resourceId && ` · ${row.resourceType ?? 'resource'}:${row.resourceId}`}
                  </p>
                </div>
                <div className="shrink-0 text-right text-xs text-sidebar-muted">
                  <p>{formatWhen(row.createdAt)}</p>
                  {row.durationMs != null && <p>{row.durationMs} ms</p>}
                </div>
              </button>

              {expanded && (
                <div className="border-t border-sidebar-border/60 bg-white/5 px-4 py-3 text-sm">
                  <dl className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <dt className="text-xs font-semibold uppercase text-sidebar-muted">Aktion</dt>
                      <dd className="font-mono text-xs text-white">{row.action}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase text-sidebar-muted">HTTP</dt>
                      <dd className="text-white">
                        {row.statusCode ?? '—'} · {row.method}
                      </dd>
                    </div>
                    {row.ipAddress && (
                      <div>
                        <dt className="text-xs font-semibold uppercase text-sidebar-muted">IP</dt>
                        <dd className="font-mono text-xs text-white">{row.ipAddress}</dd>
                      </div>
                    )}
                    {row.errorMessage && (
                      <div className="sm:col-span-2">
                        <dt className="text-xs font-semibold uppercase text-sidebar-muted">Fehler</dt>
                        <dd className="text-red-400">{row.errorMessage}</dd>
                      </div>
                    )}
                  </dl>
                  {row.metadata && Object.keys(row.metadata).length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs font-semibold uppercase text-sidebar-muted">Details</p>
                      <pre className="mt-1 max-h-64 overflow-auto rounded-lg bg-black/20 p-3 font-mono text-[11px] text-white">
                        {JSON.stringify(row.metadata, null, 2)}
                      </pre>
                    </div>
                  )}
                  {row.userAgent && (
                    <p className="mt-2 truncate text-[11px] text-sidebar-muted" title={row.userAgent}>
                      {row.userAgent}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {listQuery.hasNextPage && (
        <div className="flex justify-center pb-8">
          <Button
            type="button"
            variant="secondary"
            className="min-h-[44px] border border-sidebar-border bg-transparent text-white hover:bg-white/10"
            disabled={listQuery.isFetchingNextPage}
            onClick={() => listQuery.fetchNextPage()}
          >
            {listQuery.isFetchingNextPage ? 'Lade…' : 'Mehr laden'}
          </Button>
        </div>
      )}

      {!listQuery.isLoading && rows.length === 0 && (
        <p className="text-center text-sm text-sidebar-muted">Keine Einträge für die gewählten Filter.</p>
      )}
        </div>
      </AppPageBody>
    </div>
  );
}
