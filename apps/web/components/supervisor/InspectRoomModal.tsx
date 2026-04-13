'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';

type Props = {
  open: boolean;
  onClose: () => void;
  roomId: string;
  roomNumber: string;
};

export function InspectRoomModal({ open, onClose, roomId, roomNumber }: Props) {
  const qc = useQueryClient();
  const [passed, setPassed] = useState(true);
  const [notes, setNotes] = useState('');

  const submit = useMutation({
    mutationFn: () =>
      api('/inspections', {
        method: 'POST',
        body: JSON.stringify({
          roomId,
          passed,
          notes: notes.trim() || undefined,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rooms'] });
      qc.invalidateQueries({ queryKey: ['room', roomId] });
      setNotes('');
      setPassed(true);
      onClose();
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    submit.mutate();
  }

  if (!open) return null;

  const field =
    'mt-1.5 w-full rounded-btn border border-border bg-surface px-3 py-2.5 text-sm text-ink shadow-card focus:border-action/40 focus:outline-none focus:ring-2 focus:ring-action/15';

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/40 p-4 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-card border border-border bg-surface shadow-lift sm:rounded-card">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold text-ink">Inspect room</h2>
          <p className="mt-1 text-sm text-ink-muted">Room {roomNumber}</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4 p-5">
          <label className="flex cursor-pointer items-center gap-3 text-sm font-medium text-ink">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border text-action focus:ring-action/30"
              checked={passed}
              onChange={(e) => setPassed(e.target.checked)}
            />
            Passed inspection
          </label>
          <div>
            <label className="text-sm font-medium text-ink">Notes (optional)</label>
            <textarea
              className={`${field} min-h-[80px] resize-y`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Issues, praise, follow-up…"
              rows={3}
            />
          </div>
          {submit.isError && (
            <p className="text-sm text-danger">{submit.error instanceof Error ? submit.error.message : 'Failed'}</p>
          )}
          <div className="flex flex-wrap gap-3 pt-2">
            <Button type="submit" variant="action" className="min-h-[48px]" disabled={submit.isPending}>
              {submit.isPending ? 'Saving…' : 'Save inspection'}
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
