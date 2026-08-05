'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  RECEPTION_HANDOVER_SHIFTS,
  SHIFT_HANDOVER_LABELS_DE,
  type PutShiftHandoverTemplatePayload,
  type ReceptionHandoverShift,
  type ShiftHandoverTemplateDto,
} from '@housekeeping/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/components/toast/ToastProvider';
import { Button } from '@/components/ui/Button';
import { AppPageChrome, AppPageBody, APP_DARK_CARD, APP_DARK_INPUT } from '@/components/nav/AppPageChrome';
import { AppChromeTools } from '@/components/nav/AppChromeTools';

type DraftTask = {
  id?: string;
  label: string;
  sortOrder: number;
  essential: boolean;
};

function reorder<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [removed] = next.splice(from, 1);
  next.splice(to, 0, removed);
  return next;
}

function parseApiError(raw: string): string {
  try {
    const j = JSON.parse(raw) as { message?: string | string[] };
    if (Array.isArray(j.message)) return j.message.join(', ');
    if (typeof j.message === 'string') return j.message;
  } catch {
    /* plain text */
  }
  return raw || 'Request failed';
}

function serializeDraft(tasks: DraftTask[]) {
  return tasks.map((t, i) => ({
    id: t.id ?? null,
    label: t.label,
    sortOrder: i,
    essential: t.essential,
  }));
}

export default function AdminShiftHandoverPage() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [shift, setShift] = useState<ReceptionHandoverShift>('NIGHT');
  const [draft, setDraft] = useState<DraftTask[]>([]);
  const [savedDraft, setSavedDraft] = useState<DraftTask[]>([]);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['shift-handover', 'templates'],
    enabled: me?.role === 'ADMIN',
    queryFn: () => api<ShiftHandoverTemplateDto[]>('/shift-handover/templates'),
  });

  const current = useMemo(
    () => templates.find((t) => t.shift === shift),
    [templates, shift],
  );

  useEffect(() => {
    if (!current) return;
    const next = current.tasks.map((t) => ({
      id: t.id,
      label: t.label,
      sortOrder: t.sortOrder,
      essential: t.essential,
    }));
    setDraft(next);
    setSavedDraft(next);
  }, [shift, current?.tasks.length, current?.tasks.map((t) => t.id).join(',')]);

  const sortedDraft = useMemo(
    () => [...draft].sort((a, b) => a.sortOrder - b.sortOrder),
    [draft],
  );

  const dirty =
    JSON.stringify(serializeDraft(sortedDraft)) !== JSON.stringify(serializeDraft(savedDraft));

  const save = useMutation({
    mutationFn: (tasks: DraftTask[]) => {
      const payload: PutShiftHandoverTemplatePayload = {
        tasks: tasks.map((t, i) => ({
          id: t.id,
          label: t.label,
          sortOrder: i,
          essential: t.essential,
        })),
      };
      return api<ShiftHandoverTemplateDto>(`/shift-handover/templates/${shift}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['shift-handover', 'templates'] });
      qc.invalidateQueries({ queryKey: ['shift-handover'] });
      const next = result.tasks.map((t) => ({
        id: t.id,
        label: t.label,
        sortOrder: t.sortOrder,
        essential: t.essential,
      }));
      setDraft(next);
      setSavedDraft(next);
      toast.push('Gespeichert', 'success');
    },
    onError: (err: Error) => toast.push(parseApiError(err.message), 'warning'),
  });

  const move = (index: number, dir: -1 | 1) => {
    const ordered = [...sortedDraft];
    const to = index + dir;
    if (to < 0 || to >= ordered.length) return;
    const reordered = reorder(ordered, index, to);
    setDraft(reordered.map((t, i) => ({ ...t, sortOrder: i })));
  };

  const addTask = () => {
    setDraft([
      ...sortedDraft,
      { label: 'Neue Aufgabe', sortOrder: sortedDraft.length, essential: false },
    ]);
  };

  const removeAt = (index: number) => {
    const ordered = [...sortedDraft];
    ordered.splice(index, 1);
    setDraft(ordered.map((t, i) => ({ ...t, sortOrder: i })));
  };

  const updateAt = (index: number, patch: Partial<Pick<DraftTask, 'label' | 'essential'>>) => {
    const ordered = [...sortedDraft];
    const row = ordered[index];
    if (!row) return;
    ordered[index] = { ...row, ...patch };
    setDraft(ordered);
  };

  const selectShift = (next: ReceptionHandoverShift) => {
    if (dirty && !window.confirm('Ungespeicherte Änderungen verwerfen?')) return;
    setShift(next);
  };

  if (me?.role !== 'ADMIN') {
    return <p className="p-4 text-sm text-sidebar-muted">Nur für Administratoren.</p>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AppPageChrome
        title="Schichtübergabe"
        description="Checklisten für Nacht-, Früh- und Spätschicht bearbeiten. Pflichtaufgaben blockieren die Übergabe an die nächste Schicht."
        actions={<AppChromeTools />}
      />
      <AppPageBody>
        <div className="space-y-8 p-4 md:p-6">
      <div className="flex flex-wrap gap-2">
        {RECEPTION_HANDOVER_SHIFTS.map((s) => (
          <Button
            key={s}
            type="button"
            variant={shift === s ? 'action' : 'secondary'}
            className={clsx(
              'min-h-[44px]',
              shift !== s && 'border border-sidebar-border bg-transparent text-white hover:bg-white/10',
            )}
            onClick={() => selectShift(s)}
          >
            {SHIFT_HANDOVER_LABELS_DE[s]}
          </Button>
        ))}
      </div>

      {isLoading && <p className="text-sm text-sidebar-muted">Laden…</p>}

      {current && (
        <div className={APP_DARK_CARD + ' space-y-4 p-5'}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium text-white">{SHIFT_HANDOVER_LABELS_DE[shift]}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                className="min-h-[44px] border border-sidebar-border bg-transparent text-white hover:bg-white/10"
                onClick={addTask}
              >
                Aufgabe hinzufügen
              </Button>
              <Button
                type="button"
                variant="action"
                className="min-h-[44px]"
                disabled={!dirty || save.isPending || sortedDraft.length === 0}
                onClick={() => save.mutate(sortedDraft)}
              >
                {save.isPending ? 'Speichern…' : 'Speichern'}
              </Button>
            </div>
          </div>

          <ul className="space-y-3">
            {sortedDraft.map((t, index) => (
              <li
                key={t.id ?? `draft-${index}`}
                className="rounded-card border border-sidebar-border/60 bg-white/5 p-3 sm:p-4"
              >
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-sidebar-muted">Aufgabe</span>
                  <input
                    className={clsx(APP_DARK_INPUT, 'min-h-[44px]')}
                    value={t.label}
                    onChange={(e) => updateAt(index, { label: e.target.value })}
                  />
                </label>
                <label className="mt-3 flex min-h-[44px] cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-5 w-5 rounded border-sidebar-border accent-action"
                    checked={t.essential}
                    onChange={(e) => updateAt(index, { essential: e.target.checked })}
                  />
                  <span className="text-sm text-white">Pflicht für Schichtübergabe</span>
                </label>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="ghostOnDark"
                    className="min-h-[40px] min-w-[40px] px-2"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    aria-label="Nach oben"
                  >
                    ↑
                  </Button>
                  <Button
                    type="button"
                    variant="ghostOnDark"
                    className="min-h-[40px] min-w-[40px] px-2"
                    disabled={index === sortedDraft.length - 1}
                    onClick={() => move(index, 1)}
                    aria-label="Nach unten"
                  >
                    ↓
                  </Button>
                  <Button
                    type="button"
                    variant="ghostOnDark"
                    className="min-h-[40px] text-red-400"
                    onClick={() => removeAt(index)}
                  >
                    Entfernen
                  </Button>
                </div>
              </li>
            ))}
          </ul>

          {sortedDraft.length === 0 && (
            <p className="text-sm text-sidebar-muted">Noch keine Aufgaben. Mindestens eine Aufgabe hinzufügen.</p>
          )}
        </div>
      )}
        </div>
      </AppPageBody>
    </div>
  );
}
