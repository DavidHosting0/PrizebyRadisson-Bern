'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LoanCatalogItemDto, RoomLoanDto } from '@housekeeping/shared';
import { api } from '@/lib/api';
import { interpolate, useI18n } from '@/i18n';
import { usePermission } from '@/lib/auth-context';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { DarkSelect } from './ui/DarkSelect';

type RoomOpt = { id: string; roomNumber: string };

function formatChf(cents: number, intl: string) {
  return new Intl.NumberFormat(intl, { style: 'currency', currency: 'CHF' }).format(cents / 100);
}

export function LoansBoard() {
  const { m, intl } = useI18n();
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

  const roomOptions = useMemo(
    () =>
      [...(roomsQ.data ?? [])]
        .sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, 'de', { numeric: true }))
        .map((r) => ({ value: r.id, label: r.roomNumber })),
    [roomsQ.data],
  );

  const catalogOptions = useMemo(
    () =>
      (catalogQ.data ?? []).map((i) => ({
        value: i.id,
        label: i.name,
        hint: formatChf(i.depositCents, intl),
      })),
    [catalogQ.data, intl],
  );

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
      setErr(m.loans.selectRequired);
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
          className="min-h-[28px] w-full text-xs"
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? m.common.cancel : m.loans.lend}
        </Button>
      )}

      {showForm && canWrite && (
        <Card padding>
          <form className="space-y-2" onSubmit={onSubmit}>
            <DarkSelect
              value={roomId}
              onChange={setRoomId}
              options={roomOptions}
              placeholder={m.loans.roomPlaceholder}
            />
            <DarkSelect
              value={catalogItemId}
              onChange={setCatalogItemId}
              options={catalogOptions}
              placeholder={m.loans.itemPlaceholder}
              maxListHeight={140}
            />
            {selected && (
              <p className="text-[10px] text-sidebar-muted">
                {interpolate(m.loans.deposit, { amount: formatChf(selected.depositCents, intl) })}
              </p>
            )}
            {err && <p className="text-[10px] text-red-300">{err}</p>}
            <Button type="submit" variant="action" className="min-h-[28px] text-xs" disabled={createMut.isPending}>
              {m.loans.save}
            </Button>
          </form>
        </Card>
      )}

      {loansQ.isLoading && <p className="text-[11px] text-sidebar-muted">{m.loans.loading}</p>}
      <ul className="space-y-1.5">
        {(loansQ.data ?? []).map((loan) => (
          <li key={loan.id}>
            <Card padding>
              <div className="flex items-start justify-between gap-1">
                <div>
                  <p className="text-[10px] font-semibold text-slate-100">
                    {interpolate(m.loans.itemLine, {
                      room: loan.room.roomNumber,
                      item: loan.catalogItem.name,
                    })}
                  </p>
                  <p className="text-[9px] text-sidebar-muted">
                    {formatChf(loan.depositCents, intl)} ·{' '}
                    {new Date(loan.loanedAt).toLocaleDateString(intl)}
                  </p>
                </div>
                {canWrite && (
                  <button
                    type="button"
                    className="text-[9px] text-sky-300"
                    onClick={() => returnMut.mutate(loan.id)}
                  >
                    {m.loans.returnItem}
                  </button>
                )}
              </div>
            </Card>
          </li>
        ))}
        {!loansQ.isLoading && !(loansQ.data ?? []).length && (
          <p className="text-[11px] text-sidebar-muted">{m.loans.empty}</p>
        )}
      </ul>
    </div>
  );
}
