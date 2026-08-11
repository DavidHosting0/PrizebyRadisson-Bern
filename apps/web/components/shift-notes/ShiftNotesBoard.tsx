'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import type {
  ShiftHandoverStateDto,
  ShiftNoteDaySummaryDto,
  ShiftNoteDto,
} from '@housekeeping/shared';
import { api } from '@/lib/api';
import { useAuth, usePermission } from '@/lib/auth-context';
import { Button } from '@/components/ui/Button';
import { DateInput } from '@/components/ui/DateInput';
import { APP_DARK_INPUT } from '@/components/nav/AppPageChrome';

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
  const t = useTranslations('shiftNotes');
  const tCommon = useTranslations('common');
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

  const toggleCompleteMut = useMutation({
    mutationFn: (payload: { id: string; completed: boolean }) =>
      api<ShiftNoteDto>(`/shift-notes/${payload.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ completed: payload.completed }),
      }),
    onMutate: async ({ id, completed }) => {
      await qc.cancelQueries({ queryKey: ['shift-notes', 'day', viewingDate] });
      const key = ['shift-notes', 'day', viewingDate] as const;
      const prev = qc.getQueryData<ShiftNoteDto[]>(key);
      if (prev) {
        qc.setQueryData<ShiftNoteDto[]>(
          key,
          prev
            .map((n) =>
              n.id === id
                ? {
                    ...n,
                    completed,
                    completedAt: completed ? new Date().toISOString() : null,
                    completedBy: completed
                      ? { id: user?.id ?? '', name: user?.name ?? '' }
                      : null,
                  }
                : n,
            )
            .sort((a, b) => {
              if (a.completed !== b.completed) return a.completed ? 1 : -1;
              return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            }),
        );
      }
      return { prev, key };
    },
    onError: (e: Error, _vars, ctx) => {
      if (ctx?.prev && ctx.key) qc.setQueryData(ctx.key, ctx.prev);
      setErr(e.message);
    },
    onSuccess: (note) => {
      const key = ['shift-notes', 'day', note.forDate] as const;
      const prev = qc.getQueryData<ShiftNoteDto[]>(key);
      if (prev) {
        qc.setQueryData(
          key,
          prev
            .map((n) => (n.id === note.id ? note : n))
            .sort((a, b) => {
              if (a.completed !== b.completed) return a.completed ? 1 : -1;
              return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            }),
        );
      } else {
        qc.invalidateQueries({ queryKey: ['shift-notes'] });
      }
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api(`/shift-notes/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shift-notes'] }),
  });

  function send() {
    const text = body.trim();
    if (!text) return;
    createMut.mutate({ text, date: forDate || operatingDay });
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    send();
  }

  const isFuture = forDate > operatingDay;
  const showComposer = canWrite && mode === 'today';
  const showDayList = mode === 'browse' && !browseDate;
  const loading = showDayList ? daysQ.isLoading : notesQ.isLoading;

  return (
    <div className="flex h-[calc(100dvh-5.5rem)] min-h-[420px] flex-col md:h-[calc(100dvh-4rem)]">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-sidebar-border/60 px-4 py-2.5">
        <div className="min-w-0">
          <h1 className="text-base font-semibold tracking-tight text-white">{t('title')}</h1>
          <p className="truncate text-xs text-sidebar-muted">
            {mode === 'today'
              ? handoverQ.data
                ? t('subtitleTodayShift', {
                    shiftLabel: handoverQ.data.activeShiftLabel,
                    day: formatDayShort(operatingDay),
                  })
                : formatDayShort(operatingDay)
              : browseDate
                ? formatDayShort(browseDate)
                : t('subtitleDaysWithNotes')}
          </p>
        </div>
        <div className="flex shrink-0 rounded-btn border border-sidebar-border bg-sidebar p-0.5">
          {(
            [
              ['today', t('modeToday')],
              ['browse', t('modeBrowse')],
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
                mode === id ? 'bg-action text-white shadow-sm' : 'text-sidebar-muted hover:text-white',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 md:px-6">
        {showDayList && (
          <>
            {loading && <p className="py-8 text-center text-sm text-sidebar-muted">{t('loading')}</p>}
            {!loading && (daysQ.data?.length ?? 0) === 0 && (
              <p className="py-10 text-center text-sm text-sidebar-muted">{t('emptyDays')}</p>
            )}
            <ul className="mx-auto flex max-w-2xl flex-col gap-2">
              {(daysQ.data ?? []).map((day) => (
                <li key={day.date}>
                  <button
                    type="button"
                    onClick={() => setBrowseDate(day.date)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-sidebar-border/60 bg-[#1A2332] px-4 py-3 text-left transition hover:border-action/40 hover:bg-white/5"
                  >
                    <span className="text-sm font-medium text-white">{formatDayLabel(day.date)}</span>
                    <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-sidebar-muted">
                      {t('noteCount', { count: day.count })}
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
                  {t('backToAllDays')}
                </button>
                <span className="text-xs text-sidebar-muted">{formatDayLabel(browseDate)}</span>
              </div>
            )}
            {loading && <p className="py-8 text-center text-sm text-sidebar-muted">{t('loading')}</p>}
            {!loading && notes.length === 0 && (
              <p className="py-10 text-center text-sm text-sidebar-muted">{t('emptyNotes')}</p>
            )}
            <ul className="mx-auto flex max-w-2xl flex-col gap-3">
              {notes.map((n) => {
                const mine = user?.id === n.createdBy.id;
                const editing = editingId === n.id;
                const toggling =
                  toggleCompleteMut.isPending && toggleCompleteMut.variables?.id === n.id;
                return (
                  <li
                    key={n.id}
                    className={clsx(
                      'overflow-hidden rounded-xl border transition-colors',
                      n.completed
                        ? 'border-success/25 bg-success/10'
                        : 'border-sidebar-border/60 bg-[#1A2332]',
                    )}
                  >
                    <div className="flex">
                      <div
                        className={clsx(
                          'w-1 shrink-0',
                          n.completed ? 'bg-success' : 'bg-action',
                        )}
                        aria-hidden
                      />
                      <div className="flex min-w-0 flex-1 gap-3 px-4 py-3">
                        {canWrite && (
                          <label className="mt-0.5 flex shrink-0 cursor-pointer items-start">
                            <input
                              type="checkbox"
                              className="h-5 w-5 rounded border-sidebar-border accent-action"
                              checked={n.completed}
                              disabled={toggling}
                              aria-label={n.completed ? t('markOpen') : t('markDone')}
                              onChange={(e) =>
                                toggleCompleteMut.mutate({
                                  id: n.id,
                                  completed: e.target.checked,
                                })
                              }
                            />
                          </label>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={clsx(
                                  'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                                  n.completed
                                    ? 'bg-success/15 text-success'
                                    : 'bg-action/15 text-action',
                                )}
                              >
                                {n.completed ? t('badgeDone') : t('badgeInfo')}
                              </span>
                              <span className="text-sm font-semibold text-white">{n.createdBy.name}</span>
                            </div>
                            <span className="text-[11px] text-sidebar-muted">
                              {formatTime(n.createdAt)}
                              {n.updatedAt !== n.createdAt && !n.completed ? t('edited') : ''}
                              {n.completed && n.completedBy
                                ? t('completedBy', { name: n.completedBy.name })
                                : ''}
                            </span>
                          </div>
                          {editing ? (
                            <div className="space-y-2">
                              <textarea
                                rows={3}
                                value={editBody}
                                onChange={(e) => setEditBody(e.target.value)}
                                className={clsx(APP_DARK_INPUT, 'w-full resize-y py-2')}
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
                                  {tCommon('save')}
                                </Button>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  className="border-sidebar-border bg-transparent text-white hover:bg-white/10"
                                  onClick={() => {
                                    setEditingId(null);
                                    setEditBody('');
                                  }}
                                >
                                  {tCommon('cancel')}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <p
                              className={clsx(
                                'whitespace-pre-wrap text-sm leading-relaxed',
                                n.completed ? 'text-sidebar-muted line-through' : 'text-slate-100',
                              )}
                            >
                              {n.body}
                            </p>
                          )}
                          {canWrite && mine && !editing && (
                            <div className="mt-2.5 flex gap-3 border-t border-sidebar-border/50 pt-2">
                              <button
                                type="button"
                                className="text-xs font-medium text-sidebar-muted hover:text-action"
                                onClick={() => {
                                  setEditingId(n.id);
                                  setEditBody(n.body);
                                }}
                              >
                                {tCommon('edit')}
                              </button>
                              <button
                                type="button"
                                className="text-xs font-medium text-sidebar-muted hover:text-rose-300"
                                onClick={() => deleteMut.mutate(n.id)}
                              >
                                {tCommon('delete')}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
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
          className="shrink-0 border-t border-sidebar-border/60 px-3 py-2.5 md:px-6"
        >
          <div className="mx-auto max-w-2xl space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowSchedule((v) => !v)}
                className={clsx(
                  'group inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition',
                  showSchedule || isFuture
                    ? 'bg-warning text-white shadow-sm shadow-warning/25 ring-2 ring-warning/30'
                    : 'bg-warning/15 text-amber-300 ring-1 ring-warning/30 hover:bg-warning/25',
                )}
              >
                <svg
                  viewBox="0 0 20 20"
                  fill="none"
                  className="h-3.5 w-3.5 shrink-0 opacity-90"
                  aria-hidden
                >
                  <rect
                    x="3"
                    y="4.5"
                    width="14"
                    height="12"
                    rx="2"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                  <path
                    d="M3 8.5h14M7 3v3M13 3v3"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
                {isFuture ? (
                  <span>{t('scheduledFor', { day: formatDayShort(forDate) })}</span>
                ) : (
                  t('reserve')
                )}
                <span
                  className={clsx(
                    'text-[10px] transition',
                    showSchedule ? 'rotate-180 opacity-80' : 'opacity-60 group-hover:opacity-90',
                  )}
                >
                  ▾
                </span>
              </button>
              {isFuture && (
                <button
                  type="button"
                  className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium text-sidebar-muted ring-1 ring-sidebar-border transition hover:bg-white/10 hover:text-white"
                  onClick={() => {
                    setForDate(operatingDay);
                    setShowSchedule(false);
                  }}
                >
                  {t('today')}
                </button>
              )}
            </div>

            {showSchedule && (
              <div className="rounded-2xl border border-warning/30 bg-warning/10 px-3.5 py-3">
                <label className="block text-xs">
                  <span className="font-semibold text-amber-300">{t('pickTargetDay')}</span>
                  <div className="mt-1.5 max-w-xs">
                    <DateInput
                      min={operatingDay}
                      value={forDate}
                      onChange={(e) => setForDate(e.target.value || operatingDay)}
                    />
                  </div>
                </label>
                <p className="mt-2 text-[11px] text-amber-300/80">
                  {t('scheduleHint')}
                </p>
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder={
                  isFuture
                    ? t('placeholderForDay', { day: formatDayShort(forDate) })
                    : t('placeholderWrite')
                }
                className="h-11 flex-1 rounded-full border border-sidebar-border bg-sidebar px-4 text-sm text-white placeholder:text-sidebar-muted focus:border-action focus:outline-none focus:ring-1 focus:ring-action"
              />
              <Button
                type="submit"
                variant="action"
                disabled={createMut.isPending || !body.trim()}
                className="h-11 shrink-0 rounded-full px-5"
              >
                {isFuture ? t('plan') : t('send')}
              </Button>
            </div>
            {err && <p className="text-xs text-rose-300">{err}</p>}
          </div>
        </form>
      )}
    </div>
  );
}
