'use client';

import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LoanCatalogItemDto, RoomLoanDto } from '@housekeeping/shared';
import { api } from '@/lib/api';
import { usePermission } from '@/lib/auth-context';
import { roomsListQueryOptions } from '@/lib/rooms-query';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

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
    ...roomsListQueryOptions<RoomOpt>(),
    enabled: showForm,
  });

  const selectedItem = (catalogQ.data ?? []).find((i) => i.id === catalogItemId);

  const createMut = useMutation({
    mutationFn: () =>
      api<RoomLoanDto>('/loans', {
        method: 'POST',
        body: JSON.stringify({ roomId, catalogItemId }),
      }),
    onSuccess: () => {
      setErr(null);
      setShowForm(false);
      setRoomId('');
      setCatalogItemId('');
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
    <div className="space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Leihartikel</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Aktive Ausleihen an Zimmer — Pfand aus dem Katalog.
          </p>
        </div>
        {canWrite && (
          <Button type="button" variant="action" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Abbrechen' : 'Ausleihen'}
          </Button>
        )}
      </div>

      {showForm && canWrite && (
        <Card>
          <form className="space-y-4" onSubmit={onSubmit}>
            <label className="block text-sm">
              <span className="font-medium text-ink">Zimmer</span>
              <select
                className="mt-1 w-full rounded-btn border border-border px-3 py-2 text-sm"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                required
              >
                <option value="">— wählen —</option>
                {(roomsQ.data ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.roomNumber}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium text-ink">Artikel</span>
              <select
                className="mt-1 w-full rounded-btn border border-border px-3 py-2 text-sm"
                value={catalogItemId}
                onChange={(e) => setCatalogItemId(e.target.value)}
                required
              >
                <option value="">— wählen —</option>
                {(catalogQ.data ?? []).map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({formatChf(i.depositCents)})
                  </option>
                ))}
              </select>
            </label>
            {selectedItem && (
              <p className="text-sm text-ink-muted">
                Pfand: <span className="font-semibold text-ink">{formatChf(selectedItem.depositCents)}</span>
              </p>
            )}
            {err && <p className="text-sm text-danger">{err}</p>}
            <Button type="submit" variant="action" disabled={createMut.isPending}>
              {createMut.isPending ? 'Speichern…' : 'Speichern'}
            </Button>
          </form>
        </Card>
      )}

      {loansQ.isLoading && <p className="text-sm text-ink-muted">Laden…</p>}
      <ul className="space-y-3">
        {(loansQ.data ?? []).map((loan) => (
          <li key={loan.id}>
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-ink">
                    Zimmer {loan.room.roomNumber} · {loan.catalogItem.name}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    Pfand {formatChf(loan.depositCents)} · seit{' '}
                    {new Date(loan.loanedAt).toLocaleString('de-CH')} · {loan.loanedBy.name}
                  </p>
                </div>
                {canWrite && (
                  <Button
                    type="button"
                    variant="secondary"
                    className="min-h-0 px-2 py-1 text-xs"
                    onClick={() => returnMut.mutate(loan.id)}
                    disabled={returnMut.isPending}
                  >
                    Zurückgeben
                  </Button>
                )}
              </div>
            </Card>
          </li>
        ))}
        {!loansQ.isLoading && !(loansQ.data ?? []).length && (
          <p className="text-sm text-ink-muted">Keine aktiven Ausleihen.</p>
        )}
      </ul>
    </div>
  );
}
