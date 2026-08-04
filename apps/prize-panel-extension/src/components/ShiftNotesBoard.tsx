'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReceptionHandoverShift, ShiftNoteDto } from '@housekeeping/shared';
import { api } from '@/lib/api';
import { usePermission } from '@/lib/auth-context';
import { Button } from './ui/Button';
import { Card } from './ui/Card';

const RECEPTION_HANDOVER_SHIFTS: ReceptionHandoverShift[] = ['NIGHT', 'MORNING', 'LATE'];
const SHIFT_HANDOVER_LABELS_DE: Record<ReceptionHandoverShift, string> = {
  NIGHT: 'Nachtschicht',
  MORNING: 'Frühschicht',
  LATE: 'Spätschicht',
};

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function ShiftNotesBoard() {
  const canWrite = usePermission('SHIFT_NOTES_WRITE');
  const qc = useQueryClient();
  const [tab, setTab] = useState<'current' | 'browse' | 'create'>('current');
  const [body, setBody] = useState('');
  const [forDate, setForDate] = useState(todayIso());
  const [shifts, setShifts] = useState<ReceptionHandoverShift[]>(['MORNING']);
  const [err, setErr] = useState<string | null>(null);

  const currentQ = useQuery({
    queryKey: ['shift-notes', 'current'],
    queryFn: () => api<ShiftNoteDto[]>('/shift-notes'),
    enabled: tab === 'current',
  });

  const browseQ = useQuery({
    queryKey: ['shift-notes', 'browse'],
    queryFn: () => api<{ items: ShiftNoteDto[]; nextCursor: string | null }>('/shift-notes/browse?limit=40'),
    enabled: tab === 'browse',
  });

  const createMut = useMutation({
    mutationFn: () =>
      api<ShiftNoteDto>('/shift-notes', {
        method: 'POST',
        body: JSON.stringify({ forDate, shifts, body }),
      }),
    onSuccess: () => {
      setBody('');
      setErr(null);
      qc.invalidateQueries({ queryKey: ['shift-notes'] });
      setTab('current');
    },
    onError: (e: Error) => setErr(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api(`/shift-notes/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shift-notes'] }),
  });

  function toggleShift(s: ReceptionHandoverShift) {
    setShifts((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim() || shifts.length === 0) {
      setErr('Text und Schicht nötig.');
      return;
    }
    createMut.mutate();
  }

  const notes = useMemo(
    () => (tab === 'current' ? currentQ.data ?? [] : browseQ.data?.items ?? []),
    [tab, currentQ.data, browseQ.data],
  );

  return (
    <div className="space-y-2 p-2.5 pb-3">
      <div className="flex flex-wrap gap-1">
        {(
          [
            ['current', 'Aktuell'],
            ['browse', 'Browser'],
            ['create', 'Neu'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={
              tab === id
                ? 'rounded-md bg-action px-2 py-1 text-[10px] font-semibold text-white'
                : 'rounded-md border border-border bg-surface px-2 py-1 text-[10px] text-ink-muted'
            }
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'create' && canWrite && (
        <Card padding>
          <form className="space-y-2" onSubmit={onSubmit}>
            <input
              type="date"
              className="w-full rounded-md border border-border px-2 py-1 text-xs"
              value={forDate}
              onChange={(e) => setForDate(e.target.value)}
              required
            />
            <div className="flex flex-wrap gap-1">
              {RECEPTION_HANDOVER_SHIFTS.map((s) => (
                <label key={s} className="inline-flex items-center gap-1 text-[10px]">
                  <input type="checkbox" checked={shifts.includes(s)} onChange={() => toggleShift(s)} />
                  {SHIFT_HANDOVER_LABELS_DE[s]}
                </label>
              ))}
            </div>
            <textarea
              className="min-h-[80px] w-full rounded-md border border-border px-2 py-1 text-xs"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
            />
            {err && <p className="text-[10px] text-danger">{err}</p>}
            <Button type="submit" variant="action" className="min-h-[28px] text-xs" disabled={createMut.isPending}>
              Speichern
            </Button>
          </form>
        </Card>
      )}

      {tab !== 'create' && (
        <ul className="space-y-1.5">
          {(tab === 'current' ? currentQ.isLoading : browseQ.isLoading) && (
            <p className="text-[11px] text-ink-muted">Laden…</p>
          )}
          {notes.map((n) => (
            <li key={n.id}>
              <Card padding>
                <div className="flex items-start justify-between gap-1">
                  <p className="text-[10px] font-semibold text-ink">
                    {n.forDate} · {n.shifts.map((s) => SHIFT_HANDOVER_LABELS_DE[s]).join(', ')}
                  </p>
                  {canWrite && (
                    <button
                      type="button"
                      className="text-[9px] text-ink-muted hover:text-danger"
                      onClick={() => deleteMut.mutate(n.id)}
                    >
                      Löschen
                    </button>
                  )}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-[11px] text-ink">{n.body}</p>
              </Card>
            </li>
          ))}
          {!notes.length && !(tab === 'current' ? currentQ.isLoading : browseQ.isLoading) && (
            <p className="text-[11px] text-ink-muted">Keine Notizen.</p>
          )}
        </ul>
      )}
    </div>
  );
}
