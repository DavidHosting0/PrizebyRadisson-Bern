'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  RECEPTION_HANDOVER_SHIFTS,
  SHIFT_HANDOVER_LABELS_DE,
  type ReceptionHandoverShift,
  type ShiftNoteDto,
} from '@housekeeping/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { usePermission } from '@/lib/auth-context';

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
    queryFn: () => api<{ items: ShiftNoteDto[]; nextCursor: string | null }>('/shift-notes/browse?limit=50'),
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
      setErr('Text und mindestens eine Schicht nötig.');
      return;
    }
    createMut.mutate();
  }

  const notes = useMemo(
    () => (tab === 'current' ? currentQ.data ?? [] : browseQ.data?.items ?? []),
    [tab, currentQ.data, browseQ.data],
  );

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Schichtübergabe</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Notizbuch für die Rezeption — aktuelle Schicht und Verlauf.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['current', 'Aktuell'],
            ['browse', 'Browser'],
            ['create', 'Neue Notiz'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={
              tab === id
                ? 'rounded-btn bg-action px-3 py-2 text-sm font-medium text-white'
                : 'rounded-btn border border-border bg-surface px-3 py-2 text-sm text-ink-muted hover:bg-surface-muted'
            }
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'create' && canWrite && (
        <Card>
          <form className="space-y-4" onSubmit={onSubmit}>
            <label className="block text-sm">
              <span className="font-medium text-ink">Datum</span>
              <input
                type="date"
                className="mt-1 w-full rounded-btn border border-border px-3 py-2 text-sm"
                value={forDate}
                onChange={(e) => setForDate(e.target.value)}
                required
              />
            </label>
            <div>
              <p className="text-sm font-medium text-ink">Schichten</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {RECEPTION_HANDOVER_SHIFTS.map((s) => (
                  <label
                    key={s}
                    className="inline-flex cursor-pointer items-center gap-2 rounded-btn border border-border px-3 py-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={shifts.includes(s)}
                      onChange={() => toggleShift(s)}
                    />
                    {SHIFT_HANDOVER_LABELS_DE[s]}
                  </label>
                ))}
              </div>
            </div>
            <label className="block text-sm">
              <span className="font-medium text-ink">Notiz</span>
              <textarea
                className="mt-1 min-h-[120px] w-full rounded-btn border border-border px-3 py-2 text-sm"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                required
              />
            </label>
            {err && <p className="text-sm text-danger">{err}</p>}
            <Button type="submit" variant="action" disabled={createMut.isPending}>
              {createMut.isPending ? 'Speichern…' : 'Speichern'}
            </Button>
          </form>
        </Card>
      )}

      {tab !== 'create' && (
        <ul className="space-y-3">
          {(tab === 'current' ? currentQ.isLoading : browseQ.isLoading) && (
            <p className="text-sm text-ink-muted">Laden…</p>
          )}
          {notes.map((n) => (
            <li key={n.id}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-ink">
                      {n.forDate} · {n.shifts.map((s) => SHIFT_HANDOVER_LABELS_DE[s]).join(', ')}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {n.createdBy.name} · {new Date(n.createdAt).toLocaleString('de-CH')}
                    </p>
                  </div>
                  {canWrite && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="min-h-0 px-2 py-1 text-xs"
                      onClick={() => deleteMut.mutate(n.id)}
                    >
                      Löschen
                    </Button>
                  )}
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm text-ink">{n.body}</p>
              </Card>
            </li>
          ))}
          {!notes.length && !(tab === 'current' ? currentQ.isLoading : browseQ.isLoading) && (
            <p className="text-sm text-ink-muted">Keine Notizen.</p>
          )}
        </ul>
      )}
    </div>
  );
}
