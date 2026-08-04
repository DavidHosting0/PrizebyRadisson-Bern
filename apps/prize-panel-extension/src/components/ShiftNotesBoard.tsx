import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import type { ReceptionHandoverShift, ShiftHandoverStateDto, ShiftNoteDto } from '@housekeeping/shared';
import { api } from '@/lib/api';
import { useAuth, usePermission } from '@/lib/auth-context';
import { Button } from './ui/Button';

const SHIFT_LABELS: Record<ReceptionHandoverShift, string> = {
  NIGHT: 'Nacht',
  MORNING: 'Früh',
  LATE: 'Spät',
};

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
}

function formatDayLabel(dateIso: string) {
  const [y, m, d] = dateIso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('de-CH', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
}

export function ShiftNotesBoard() {
  const { user } = useAuth();
  const canWrite = usePermission('SHIFT_NOTES_WRITE');
  const qc = useQueryClient();
  const [feed, setFeed] = useState<'today' | 'all'>('today');
  const [body, setBody] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const today = todayIso();

  const handoverQ = useQuery({
    queryKey: ['shift-handover'],
    queryFn: () => api<ShiftHandoverStateDto>('/shift-handover'),
    staleTime: 60_000,
  });

  const todayQ = useQuery({
    queryKey: ['shift-notes', 'today', today],
    queryFn: () => api<ShiftNoteDto[]>(`/shift-notes?date=${today}`),
    enabled: feed === 'today',
    refetchInterval: 15_000,
  });

  const browseQ = useQuery({
    queryKey: ['shift-notes', 'browse'],
    queryFn: () => api<{ items: ShiftNoteDto[]; nextCursor: string | null }>('/shift-notes/browse?limit=60'),
    enabled: feed === 'all',
    refetchInterval: 30_000,
  });

  const activeShift = handoverQ.data?.activeShift as ReceptionHandoverShift | undefined;

  const notesChrono = useMemo(() => {
    const raw = feed === 'today' ? todayQ.data ?? [] : browseQ.data?.items ?? [];
    return [...raw].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  }, [feed, todayQ.data, browseQ.data]);

  const createMut = useMutation({
    mutationFn: (text: string) =>
      api<ShiftNoteDto>('/shift-notes', {
        method: 'POST',
        body: JSON.stringify({
          forDate: today,
          shifts: activeShift ? [activeShift] : (['NIGHT', 'MORNING', 'LATE'] as ReceptionHandoverShift[]),
          body: text,
        }),
      }),
    onSuccess: () => {
      setBody('');
      setErr(null);
      qc.invalidateQueries({ queryKey: ['shift-notes'] });
    },
    onError: (e: Error) => setErr(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api(`/shift-notes/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shift-notes'] }),
  });

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [notesChrono.length, feed]);

  function send() {
    const text = body.trim();
    if (!text) return;
    createMut.mutate(text);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    send();
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const loading = feed === 'today' ? todayQ.isLoading : browseQ.isLoading;
  let lastDay = '';

  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-sidebar-border px-2.5 py-1.5">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold text-white">Schichtübergabe</p>
          <p className="truncate text-[9px] text-sidebar-muted">
            {handoverQ.data?.activeShiftLabel ?? '…'} · {formatDayLabel(today)}
          </p>
        </div>
        <div className="flex shrink-0 rounded-md border border-white/10 bg-white/5 p-0.5">
          {(
            [
              ['today', 'Heute'],
              ['all', 'Verlauf'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFeed(id)}
              className={clsx(
                'rounded px-1.5 py-0.5 text-[9px] font-semibold',
                feed === id ? 'bg-white/15 text-white' : 'text-sidebar-muted',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {loading && <p className="py-4 text-center text-[11px] text-sidebar-muted">Laden…</p>}
        {!loading && notesChrono.length === 0 && (
          <p className="py-6 text-center text-[11px] text-sidebar-muted">Noch keine Nachrichten.</p>
        )}
        <ul className="flex flex-col gap-2">
          {notesChrono.map((n) => {
            const mine = user?.id === n.createdBy.id;
            const showDay = n.forDate !== lastDay;
            lastDay = n.forDate;
            return (
              <li key={n.id}>
                {showDay && feed === 'all' && (
                  <p className="mb-1.5 text-center text-[9px] font-semibold uppercase tracking-wide text-sidebar-muted">
                    {formatDayLabel(n.forDate)}
                  </p>
                )}
                <div className={clsx('flex gap-1.5', mine ? 'flex-row-reverse' : 'flex-row')}>
                  <div
                    className={clsx(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[8px] font-bold',
                      mine ? 'bg-action text-white' : 'bg-white/15 text-white',
                    )}
                  >
                    {initials(n.createdBy.name)}
                  </div>
                  <div className="min-w-0 max-w-[85%]">
                    <div
                      className={clsx(
                        'mb-0.5 flex flex-wrap items-baseline gap-x-1',
                        mine ? 'justify-end' : 'justify-start',
                      )}
                    >
                      <span className="text-[10px] font-semibold text-slate-100">{n.createdBy.name}</span>
                      <span className="text-[8px] text-sidebar-muted">{formatTime(n.createdAt)}</span>
                    </div>
                    <div
                      className={clsx(
                        'rounded-xl px-2.5 py-1.5 text-[11px] leading-snug',
                        mine
                          ? 'rounded-tr-sm bg-action text-white'
                          : 'rounded-tl-sm border border-white/10 bg-white/[0.08] text-slate-100',
                      )}
                    >
                      <p className="whitespace-pre-wrap">{n.body}</p>
                      <p
                        className={clsx(
                          'mt-0.5 text-[8px]',
                          mine ? 'text-white/70' : 'text-sidebar-muted',
                        )}
                      >
                        {n.shifts.map((s) => SHIFT_LABELS[s]).join(' · ')}
                      </p>
                    </div>
                    {canWrite && mine && (
                      <button
                        type="button"
                        className="mt-0.5 text-[8px] text-sidebar-muted hover:text-red-300"
                        onClick={() => deleteMut.mutate(n.id)}
                      >
                        Löschen
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {canWrite && (
        <form onSubmit={onSubmit} className="shrink-0 border-t border-sidebar-border px-2 py-1.5">
          <div className="flex items-end gap-1.5">
            <textarea
              rows={1}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Nachricht… Enter senden"
              className="max-h-20 min-h-[32px] flex-1 resize-none rounded-lg border border-white/15 bg-white/5 px-2 py-1.5 text-[11px] text-white placeholder:text-sidebar-muted focus:border-action focus:outline-none"
            />
            <Button
              type="submit"
              variant="action"
              disabled={createMut.isPending || !body.trim()}
              className="min-h-[32px] shrink-0 px-2.5 text-[11px]"
            >
              →
            </Button>
          </div>
          {err && <p className="mt-1 text-[9px] text-red-300">{err}</p>}
        </form>
      )}
    </div>
  );
}
