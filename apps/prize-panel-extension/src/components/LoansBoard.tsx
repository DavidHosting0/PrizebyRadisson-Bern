'use client';

import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LoanCatalogItemDto, RoomLoanDto } from '@housekeeping/shared';
import { api } from '@/lib/api';
import { usePermission } from '@/lib/auth-context';
import { Button } from './ui/Button';
import { Card } from './ui/Card';

type RoomOpt = { id: string; roomNumber: string };

function formatChf(cents: number) {
  return new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF' }).format(cents / 100);
}

export function LoansBoard() {
  const canWrite = usePermission('LOANS_WRITE');
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [catalogItemId, setCatalogItemId] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const loansQ = useQuery({
    queryKey: ['loans', 'active'],
    queryFn: () => api<RoomLoanDto[]>('/loans?active=1'),
  });

  const catalogQ = useQuery({
    queryKey: ['loans', 'catalog'],
    queryFn: () => api<LoanCatalogItemDto[]>('/loans/catalog'),
    enabled: showForm,
  });

  const roomsQ = useQuery({
    queryKey: ['rooms', 'list'],
    queryFn: () => api<RoomOpt[]>('/rooms'),
    enabled: showForm,
  });

  const selected = (catalogQ.data ?? []).find((i) => i.id === catalogItemId);

  const createMut = useMutation({
    mutationFn: () =>
      api('/loans', {
        method: 'POST',
        body: JSON.stringify({ roomId, catalogItemId }),
      }),
    onSuccess: () => {
      setShowForm(false);
      setRoomId('');
      setCatalogItemId('');
      setErr(null);
      qc.invalidateQueries({ queryKey: ['loans'] });
    },
    onError: (e: Error) => setErr(e.message),
  });

  const returnMut = useMutation({
    mutationFn: (id: string) => api(`/loans/${id}/return`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['loans'] }),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!roomId || !catalogItemId) {
      setErr('Zimmer und Artikel wählen.');
      return;
    }
    createMut.mutate();
  }

  return (
    <div className="space-y-2 bg-sidebar p-2.5 pb-3">
      {canWrite && (
        <Button
          type="button"
          variant={showForm ? 'secondary' : 'action'}
          className={`min-h-[28px] w-full text-xs${showForm ? ' border-white/15 bg-white/5 text-slate-200' : ''}`}
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? 'Abbrechen' : 'Ausleihen'}
        </Button>
      )}

      {showForm && canWrite && (
        <Card padding>
          <form className="space-y-2" onSubmit={onSubmit}>
            <select
              className="w-full rounded-md border border-white/15 bg-white/5 px-2 py-1 text-xs text-white"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              required
            >
              <option value="">Zimmer…</option>
              {(roomsQ.data ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.roomNumber}
                </option>
              ))}
            </select>
            <select
              className="w-full rounded-md border border-white/15 bg-white/5 px-2 py-1 text-xs text-white"
              value={catalogItemId}
              onChange={(e) => setCatalogItemId(e.target.value)}
              required
            >
              <option value="">Artikel…</option>
              {(catalogQ.data ?? []).map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({formatChf(i.depositCents)})
                </option>
              ))}
            </select>
            {selected && (
              <p className="text-[10px] text-sidebar-muted">Pfand {formatChf(selected.depositCents)}</p>
            )}
            {err && <p className="text-[10px] text-red-300">{err}</p>}
            <Button type="submit" variant="action" className="min-h-[28px] text-xs" disabled={createMut.isPending}>
              Speichern
            </Button>
          </form>
        </Card>
      )}

      {loansQ.isLoading && <p className="text-[11px] text-sidebar-muted">Laden…</p>}
      <ul className="space-y-1.5">
        {(loansQ.data ?? []).map((loan) => (
          <li key={loan.id}>
            <Card padding>
              <div className="flex items-start justify-between gap-1">
                <div>
                  <p className="text-[10px] font-semibold text-slate-100">
                    Zi. {loan.room.roomNumber} · {loan.catalogItem.name}
                  </p>
                  <p className="text-[9px] text-sidebar-muted">
                    {formatChf(loan.depositCents)} · {new Date(loan.loanedAt).toLocaleDateString('de-CH')}
                  </p>
                </div>
                {canWrite && (
                  <button
                    type="button"
                    className="text-[9px] text-sky-300"
                    onClick={() => returnMut.mutate(loan.id)}
                  >
                    Zurück
                  </button>
                )}
              </div>
            </Card>
          </li>
        ))}
        {!loansQ.isLoading && !(loansQ.data ?? []).length && (
          <p className="text-[11px] text-sidebar-muted">Keine aktiven Ausleihen.</p>
        )}
      </ul>
    </div>
  );
}
