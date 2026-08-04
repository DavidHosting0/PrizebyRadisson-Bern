'use client';

import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  SHIFT_HANDOVER_LABELS_DE,
  type ReceptionHandoverShift,
  type ShiftHandoverStateDto,
  type ShiftNoteDto,
} from '@housekeeping/shared';
import { api } from '@/lib/api';
import { useAuth, usePermission } from '@/lib/auth-context';
import { Button } from '@/components/ui/Button';

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
}

function formatDayLabel(dateIso: string) {
  const [y, m, d] = dateIso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('de-CH', {
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
    queryFn: () => api<{ items: ShiftNoteDto[]; nextCursor: string | null }>('/shift-notes/browse?limit=80'),
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
    <div className="flex h-[calc(100dvh-5.5rem)] min-h-[420px] flex-col bg-surface-muted md:h-[calc(100dvh-4rem)]">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-surface px-4 py-2.5">
        <div className="min-w-0">
          <h1 className="text-base font-semibold tracking-tight text-ink">Schichtübergabe</h1>
          <p className="truncate text-xs text-ink-muted">
            {handoverQ.data
              ? `${handoverQ.data.activeShiftLabel} · ${formatDayLabel(today)}`
              : formatDayLabel(today)}
          </p>
        </div>
        <div className="flex shrink-0 rounded-btn border border-border bg-surface-muted p-0.5">
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
                'rounded-[6px] px-2.5 py-1 text-xs font-medium transition',
                feed === id ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3 md:px-6">
        {loading && <p className="py-8 text-center text-sm text-ink-muted">Laden…</p>}
        {!loading && notesChrono.length === 0 && (
          <p className="py-10 text-center text-sm text-ink-muted">
            Noch keine Nachrichten. Schreib die erste Übergabe-Notiz.
          </p>
        )}
        <ul className="mx-auto flex max-w-2xl flex-col gap-3">
          {notesChrono.map((n) => {
            const mine = user?.id === n.createdBy.id;
            const showDay = n.forDate !== lastDay;
            lastDay = n.forDate;
            return (
              <li key={n.id}>
                {showDay && feed === 'all' && (
                  <div className="mb-3 flex items-center gap-2">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
                      {formatDayLabel(n.forDate)}
                    </span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                )}
                <div className={clsx('flex gap-2.5', mine ? 'flex-row-reverse' : 'flex-row')}>
                  <div
                    className={clsx(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                      mine ? 'bg-action text-white' : 'bg-sidebar text-white',
                    )}
                    title={n.createdBy.name}
                  >
                    {initials(n.createdBy.name)}
                  </div>
                  <div className={clsx('min-w-0 max-w-[min(100%,28rem)]', mine ? 'items-end' : 'items-start')}>
                    <div
                      className={clsx(
                        'mb-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5',
                        mine ? 'justify-end' : 'justify-start',
                      )}
                    >
                      <span className="text-xs font-semibold text-ink">{n.createdBy.name}</span>
                      <span className="text-[10px] text-ink-muted">{formatTime(n.createdAt)}</span>
                      <span className="text-[10px] text-ink-muted">
                        {n.shifts.map((s) => SHIFT_HANDOVER_LABELS_DE[s]).join(' · ')}
                      </span>
                    </div>
                    <div
                      className={clsx(
                        'rounded-2xl px-3.5 py-2 text-sm leading-snug shadow-sm',
                        mine
                          ? 'rounded-tr-md bg-action text-white'
                          : 'rounded-tl-md border border-border bg-surface text-ink',
                      )}
                    >
                      <p className="whitespace-pre-wrap">{n.body}</p>
                    </div>
                    {canWrite && mine && (
                      <button
                        type="button"
                        className="mt-0.5 text-[10px] text-ink-muted hover:text-danger"
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
        <form
          onSubmit={onSubmit}
          className="shrink-0 border-t border-border bg-surface px-3 py-2.5 md:px-6"
        >
          <div className="mx-auto flex max-w-2xl items-end gap-2">
            <textarea
              rows={1}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Nachricht schreiben… (Enter senden)"
              className="max-h-28 min-h-[40px] flex-1 resize-none rounded-xl border border-border bg-surface-muted px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-action focus:outline-none focus:ring-1 focus:ring-action"
            />
            <Button
              type="submit"
              variant="action"
              disabled={createMut.isPending || !body.trim()}
              className="min-h-[40px] shrink-0 px-4"
            >
              Senden
            </Button>
          </div>
          {err && <p className="mx-auto mt-1.5 max-w-2xl text-xs text-danger">{err}</p>}
        </form>
      )}
    </div>
  );
}
