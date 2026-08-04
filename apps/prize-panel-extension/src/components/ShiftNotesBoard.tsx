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
import { Button } from './ui/Button';

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
    weekday: 'long',
    day: 'numeric',
    month: 'long',
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
    <div className="flex h-full min-h-0 flex-col bg-sidebar">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-sidebar-border px-2.5 py-1.5">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold text-white">Schichtübergabe</p>
          <p className="truncate text-[9px] text-sidebar-muted">
            {mode === 'today'
              ? `${handoverQ.data?.activeShiftLabel ?? '…'} · ${formatDayShort(operatingDay)}`
              : browseDate
                ? formatDayShort(browseDate)
                : 'Tage mit Notizen'}
          </p>
        </div>
        <div className="flex shrink-0 rounded-md border border-white/10 bg-white/5 p-0.5">
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
                'rounded px-1.5 py-0.5 text-[9px] font-semibold',
                mode === id ? 'bg-white/15 text-white' : 'text-sidebar-muted',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {showDayList && (
          <>
            {loading && <p className="py-4 text-center text-[11px] text-sidebar-muted">Laden…</p>}
            {!loading && (daysQ.data?.length ?? 0) === 0 && (
              <p className="py-6 text-center text-[11px] text-sidebar-muted">Noch keine Tage.</p>
            )}
            <ul className="flex flex-col gap-1.5">
              {(daysQ.data ?? []).map((day) => (
                <li key={day.date}>
                  <button
                    type="button"
                    onClick={() => setBrowseDate(day.date)}
                    className="flex w-full items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.06] px-2.5 py-2 text-left transition hover:bg-white/[0.1]"
                  >
                    <span className="text-[11px] font-medium text-slate-100">
                      {formatDayLabel(day.date)}
                    </span>
                    <span className="shrink-0 rounded-md bg-white/10 px-1.5 py-0.5 text-[9px] font-semibold text-sidebar-muted">
                      {day.count}
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
              <div className="mb-2 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setBrowseDate(null)}
                  className="text-[10px] font-semibold text-sky-300 hover:underline"
                >
                  ← Tage
                </button>
                <span className="text-[9px] text-sidebar-muted">{formatDayShort(browseDate)}</span>
              </div>
            )}
            {loading && <p className="py-4 text-center text-[11px] text-sidebar-muted">Laden…</p>}
            {!loading && notes.length === 0 && (
              <p className="py-6 text-center text-[11px] text-sidebar-muted">
                Keine Notizen für diesen Tag.
              </p>
            )}
            <ul className="flex flex-col gap-2">
              {notes.map((n) => {
                const mine = user?.id === n.createdBy.id;
                const editing = editingId === n.id;
                return (
                  <li
                    key={n.id}
                    className="rounded-lg border border-white/10 bg-white/[0.07] px-2.5 py-2"
                  >
                    <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-2">
                      <span className="text-[10px] font-semibold text-slate-100">
                        {n.createdBy.name}
                      </span>
                      <span className="text-[8px] text-sidebar-muted">
                        {formatTime(n.createdAt)}
                        {n.updatedAt !== n.createdAt ? ' · bearb.' : ''}
                      </span>
                    </div>
                    {editing ? (
                      <div className="space-y-1.5">
                        <textarea
                          rows={3}
                          value={editBody}
                          onChange={(e) => setEditBody(e.target.value)}
                          className="w-full resize-y rounded-md border border-white/15 bg-white/5 px-2 py-1.5 text-[11px] text-white focus:border-action focus:outline-none"
                          autoFocus
                        />
                        <div className="flex gap-1.5">
                          <Button
                            type="button"
                            variant="action"
                            disabled={updateMut.isPending || !editBody.trim()}
                            className="min-h-[24px] px-2 text-[10px]"
                            onClick={() =>
                              updateMut.mutate({ id: n.id, body: editBody.trim() })
                            }
                          >
                            Speichern
                          </Button>
                          <button
                            type="button"
                            className="text-[9px] text-sidebar-muted hover:text-white"
                            onClick={() => {
                              setEditingId(null);
                              setEditBody('');
                            }}
                          >
                            Abbrechen
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap text-[11px] leading-snug text-slate-100">
                        {n.body}
                      </p>
                    )}
                    {canWrite && mine && !editing && (
                      <div className="mt-1.5 flex gap-2.5 border-t border-white/10 pt-1.5">
                        <button
                          type="button"
                          className="text-[9px] font-medium text-sidebar-muted hover:text-sky-300"
                          onClick={() => {
                            setEditingId(n.id);
                            setEditBody(n.body);
                          }}
                        >
                          Bearbeiten
                        </button>
                        <button
                          type="button"
                          className="text-[9px] font-medium text-sidebar-muted hover:text-red-300"
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
        <form onSubmit={onSubmit} className="shrink-0 border-t border-sidebar-border px-2 py-1.5">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowSchedule((v) => !v)}
              className={clsx(
                'rounded-md border px-1.5 py-0.5 text-[9px] font-semibold',
                showSchedule || isFuture
                  ? 'border-sky-400/40 bg-sky-500/15 text-sky-200'
                  : 'border-white/15 text-sidebar-muted',
              )}
            >
              {isFuture ? formatDayShort(forDate) : 'Für später…'}
            </button>
            {isFuture && (
              <button
                type="button"
                className="text-[9px] text-sidebar-muted underline"
                onClick={() => {
                  setForDate(operatingDay);
                  setShowSchedule(false);
                }}
              >
                Heute
              </button>
            )}
          </div>

          {showSchedule && (
            <div className="mb-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5">
              <input
                type="date"
                min={operatingDay}
                className="w-full rounded-md border border-white/15 bg-white/5 px-1.5 py-1 text-[10px] text-white"
                value={forDate}
                onChange={(e) => setForDate(e.target.value || operatingDay)}
              />
            </div>
          )}

          <div className="flex items-end gap-1.5">
            <textarea
              rows={2}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={isFuture ? `Für ${formatDayShort(forDate)}…` : 'Notiz…'}
              className="max-h-20 min-h-[36px] flex-1 resize-none rounded-lg border border-white/15 bg-white/5 px-2 py-1.5 text-[11px] text-white placeholder:text-sidebar-muted focus:border-action focus:outline-none"
            />
            <Button
              type="submit"
              variant="action"
              disabled={createMut.isPending || !body.trim()}
              className="min-h-[36px] shrink-0 px-2.5 text-[11px]"
            >
              {isFuture ? '✓' : '→'}
            </Button>
          </div>
          {err && <p className="mt-1 text-[9px] text-red-300">{err}</p>}
        </form>
      )}
    </div>
  );
}
