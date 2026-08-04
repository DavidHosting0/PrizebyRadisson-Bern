'use client';

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import type {
  ShiftHandoverStateDto,
  ShiftNoteDaySummaryDto,
  ShiftNoteDto,
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
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatDayShort(dateIso: string) {
  const [y, m, d] = dateIso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('de-CH', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export function ShiftNotesBoard() {
  const { user } = useAuth();
  const canWrite = usePermission('SHIFT_NOTES_WRITE');
  const qc = useQueryClient();
  const [mode, setMode] = useState<'today' | 'browse'>('today');
  const [browseDate, setBrowseDate] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [forDate, setForDate] = useState(todayIso);
  const [showSchedule, setShowSchedule] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const calendarToday = todayIso();

  const handoverQ = useQuery({
    queryKey: ['shift-handover'],
    queryFn: () => api<ShiftHandoverStateDto>('/shift-handover'),
    staleTime: 60_000,
  });

  const operatingDay = handoverQ.data?.activeDate ?? calendarToday;
  const viewingDate = mode === 'today' ? operatingDay : browseDate;

  useEffect(() => {
    if (handoverQ.data?.activeDate && !showSchedule) {
      setForDate(handoverQ.data.activeDate);
    }
  }, [handoverQ.data?.activeDate, showSchedule]);

  const daysQ = useQuery({
    queryKey: ['shift-notes', 'days'],
    queryFn: () => api<ShiftNoteDaySummaryDto[]>('/shift-notes/days'),
    enabled: mode === 'browse',
    refetchInterval: 30_000,
  });

  const notesQ = useQuery({
    queryKey: ['shift-notes', 'day', viewingDate],
    queryFn: () => api<ShiftNoteDto[]>(`/shift-notes?date=${viewingDate}`),
    enabled: Boolean(viewingDate),
    refetchInterval: mode === 'today' ? 15_000 : 30_000,
  });

  const notes = notesQ.data ?? [];

  const createMut = useMutation({
    mutationFn: (payload: { text: string; date: string }) =>
      api<ShiftNoteDto>('/shift-notes', {
        method: 'POST',
        body: JSON.stringify({ forDate: payload.date, body: payload.text }),
      }),
    onSuccess: (_note, vars) => {
      setBody('');
      setErr(null);
      qc.invalidateQueries({ queryKey: ['shift-notes'] });
      if (vars.date !== operatingDay) {
        setMode('browse');
        setBrowseDate(vars.date);
        setShowSchedule(false);
        setForDate(operatingDay);
      }
    },
    onError: (e: Error) => setErr(e.message),
  });

  const updateMut = useMutation({
    mutationFn: (payload: { id: string; body: string }) =>
      api<ShiftNoteDto>(`/shift-notes/${payload.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ body: payload.body }),
      }),
    onSuccess: () => {
      setEditingId(null);
      setEditBody('');
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
    if (mode !== 'today') return;
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [notes.length, mode, viewingDate]);

  function send() {
    const text = body.trim();
    if (!text) return;
    createMut.mutate({ text, date: forDate || operatingDay });
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

  const isFuture = forDate > operatingDay;
  const showComposer = canWrite && mode === 'today';
  const showDayList = mode === 'browse' && !browseDate;
  const loading = showDayList ? daysQ.isLoading : notesQ.isLoading;

  return (
    <div className="flex h-[calc(100dvh-5.5rem)] min-h-[420px] flex-col bg-surface-muted md:h-[calc(100dvh-4rem)]">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-surface px-4 py-2.5">
        <div className="min-w-0">
          <h1 className="text-base font-semibold tracking-tight text-ink">Schichtübergabe</h1>
          <p className="truncate text-xs text-ink-muted">
            {mode === 'today'
              ? handoverQ.data
                ? `${handoverQ.data.activeShiftLabel} · ${formatDayShort(operatingDay)}`
                : formatDayShort(operatingDay)
              : browseDate
                ? formatDayShort(browseDate)
                : 'Tage mit Notizen'}
          </p>
        </div>
        <div className="flex shrink-0 rounded-btn border border-border bg-surface-muted p-0.5">
          {(
            [
              ['today', 'Heute'],
              ['browse', 'Durchsuchen'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setMode(id);
                if (id === 'today') setBrowseDate(null);
              }}
              className={clsx(
                'rounded-[6px] px-2.5 py-1 text-xs font-medium transition',
                mode === id ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3 md:px-6">
        {showDayList && (
          <>
            {loading && <p className="py-8 text-center text-sm text-ink-muted">Laden…</p>}
            {!loading && (daysQ.data?.length ?? 0) === 0 && (
              <p className="py-10 text-center text-sm text-ink-muted">
                Noch keine Tage mit Notizen.
              </p>
            )}
            <ul className="mx-auto flex max-w-2xl flex-col gap-2">
              {(daysQ.data ?? []).map((day) => (
                <li key={day.date}>
                  <button
                    type="button"
                    onClick={() => setBrowseDate(day.date)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-left shadow-sm transition hover:border-action/40 hover:bg-surface-muted/40"
                  >
                    <span className="text-sm font-medium text-ink">{formatDayLabel(day.date)}</span>
                    <span className="shrink-0 rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-medium text-ink-muted">
                      {day.count} {day.count === 1 ? 'Notiz' : 'Notizen'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {!showDayList && (
          <>
            {mode === 'browse' && browseDate && (
              <div className="mx-auto mb-3 flex max-w-2xl items-center gap-2">
                <button
                  type="button"
                  onClick={() => setBrowseDate(null)}
                  className="text-xs font-medium text-action hover:underline"
                >
                  ← Alle Tage
                </button>
                <span className="text-xs text-ink-muted">{formatDayLabel(browseDate)}</span>
              </div>
            )}
            {loading && <p className="py-8 text-center text-sm text-ink-muted">Laden…</p>}
            {!loading && notes.length === 0 && (
              <p className="py-10 text-center text-sm text-ink-muted">
                Noch keine Notizen für diesen Tag.
              </p>
            )}
            <ul className="mx-auto flex max-w-2xl flex-col gap-3">
              {notes.map((n) => {
                const mine = user?.id === n.createdBy.id;
                const editing = editingId === n.id;
                return (
                  <li
                    key={n.id}
                    className="rounded-xl border border-border bg-surface px-4 py-3 shadow-sm"
                  >
                    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <span className="text-sm font-semibold text-ink">{n.createdBy.name}</span>
                      <span className="text-[11px] text-ink-muted">
                        {formatTime(n.createdAt)}
                        {n.updatedAt !== n.createdAt ? ' · bearbeitet' : ''}
                      </span>
                    </div>
                    {editing ? (
                      <div className="space-y-2">
                        <textarea
                          rows={3}
                          value={editBody}
                          onChange={(e) => setEditBody(e.target.value)}
                          className="w-full resize-y rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm text-ink focus:border-action focus:outline-none focus:ring-1 focus:ring-action"
                          autoFocus
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="action"
                            disabled={updateMut.isPending || !editBody.trim()}
                            onClick={() =>
                              updateMut.mutate({ id: n.id, body: editBody.trim() })
                            }
                          >
                            Speichern
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => {
                              setEditingId(null);
                              setEditBody('');
                            }}
                          >
                            Abbrechen
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{n.body}</p>
                    )}
                    {canWrite && mine && !editing && (
                      <div className="mt-2.5 flex gap-3 border-t border-border/70 pt-2">
                        <button
                          type="button"
                          className="text-xs font-medium text-ink-muted hover:text-action"
                          onClick={() => {
                            setEditingId(n.id);
                            setEditBody(n.body);
                          }}
                        >
                          Bearbeiten
                        </button>
                        <button
                          type="button"
                          className="text-xs font-medium text-ink-muted hover:text-danger"
                          onClick={() => deleteMut.mutate(n.id)}
                        >
                          Löschen
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      {showComposer && (
        <form
          onSubmit={onSubmit}
          className="shrink-0 border-t border-border bg-surface px-3 py-2.5 md:px-6"
        >
          <div className="mx-auto max-w-2xl space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowSchedule((v) => !v)}
                className={clsx(
                  'rounded-btn border px-2.5 py-1 text-xs font-medium transition',
                  showSchedule || isFuture
                    ? 'border-action/40 bg-action/10 text-action'
                    : 'border-border text-ink-muted hover:bg-surface-muted',
                )}
              >
                {isFuture ? `Für ${formatDayShort(forDate)}` : 'Für später…'}
              </button>
              {isFuture && (
                <button
                  type="button"
                  className="text-xs text-ink-muted underline-offset-2 hover:underline"
                  onClick={() => {
                    setForDate(operatingDay);
                    setShowSchedule(false);
                  }}
                >
                  Zurück auf heute
                </button>
              )}
            </div>

            {showSchedule && (
              <div className="rounded-xl border border-border bg-surface-muted/60 px-3 py-2.5">
                <label className="text-xs">
                  <span className="font-medium text-ink">Datum</span>
                  <input
                    type="date"
                    min={operatingDay}
                    className="mt-1 block rounded-btn border border-border bg-surface px-2 py-1.5 text-sm"
                    value={forDate}
                    onChange={(e) => setForDate(e.target.value || operatingDay)}
                  />
                </label>
              </div>
            )}

            <div className="flex items-end gap-2">
              <textarea
                rows={2}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={
                  isFuture
                    ? `Notiz für ${formatDayShort(forDate)}…`
                    : 'Informationsnotiz schreiben…'
                }
                className="max-h-28 min-h-[48px] flex-1 resize-none rounded-xl border border-border bg-surface-muted px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-action focus:outline-none focus:ring-1 focus:ring-action"
              />
              <Button
                type="submit"
                variant="action"
                disabled={createMut.isPending || !body.trim()}
                className="min-h-[48px] shrink-0 px-4"
              >
                {isFuture ? 'Planen' : 'Speichern'}
              </Button>
            </div>
            {err && <p className="text-xs text-danger">{err}</p>}
          </div>
        </form>
      )}
    </div>
  );
}
