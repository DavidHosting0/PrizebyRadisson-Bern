'use client';

import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LoanCatalogItemDto } from '@housekeeping/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

function formatChf(cents: number) {
  return new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF' }).format(cents / 100);
}

export default function AdminLoansCatalogPage() {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [depositChf, setDepositChf] = useState('20');
  const [err, setErr] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDeposit, setEditDeposit] = useState('');
  const [editActive, setEditActive] = useState(true);

  const catalogQ = useQuery({
    queryKey: ['loans', 'catalog', 'all'],
    queryFn: () => api<LoanCatalogItemDto[]>('/loans/catalog?all=1'),
  });

  const createMut = useMutation({
    mutationFn: () => {
      const depositCents = Math.round(parseFloat(depositChf.replace(',', '.')) * 100);
      if (!Number.isFinite(depositCents) || depositCents < 0) throw new Error('Ungültiger Pfand');
      return api('/loans/catalog', {
        method: 'POST',
        body: JSON.stringify({ name, depositCents, active: true }),
      });
    },
    onSuccess: () => {
      setName('');
      setDepositChf('20');
      setErr(null);
      qc.invalidateQueries({ queryKey: ['loans', 'catalog'] });
    },
    onError: (e: Error) => setErr(e.message),
  });

  const updateMut = useMutation({
    mutationFn: () => {
      if (!editId) throw new Error('Kein Eintrag');
      const depositCents = Math.round(parseFloat(editDeposit.replace(',', '.')) * 100);
      if (!Number.isFinite(depositCents) || depositCents < 0) throw new Error('Ungültiger Pfand');
      return api(`/loans/catalog/${editId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editName,
          depositCents,
          active: editActive,
        }),
      });
    },
    onSuccess: () => {
      setEditId(null);
      qc.invalidateQueries({ queryKey: ['loans', 'catalog'] });
    },
    onError: (e: Error) => setErr(e.message),
  });

  function startEdit(item: LoanCatalogItemDto) {
    setEditId(item.id);
    setEditName(item.name);
    setEditDeposit(String(item.depositCents / 100));
    setEditActive(item.active);
    setErr(null);
  }

  function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setErr('Name nötig.');
      return;
    }
    createMut.mutate();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Leihartikel-Katalog</h1>
        <p className="mt-1 text-sm text-ink-muted">Name und Pfand für die Rezeption / Extension.</p>
      </div>

      <Card>
        <form className="flex flex-wrap items-end gap-3" onSubmit={onCreate}>
          <label className="min-w-[160px] flex-1 text-sm">
            <span className="font-medium text-ink">Name</span>
            <input
              className="mt-1 w-full rounded-btn border border-border px-3 py-2 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <label className="w-28 text-sm">
            <span className="font-medium text-ink">Pfand CHF</span>
            <input
              className="mt-1 w-full rounded-btn border border-border px-3 py-2 text-sm"
              value={depositChf}
              onChange={(e) => setDepositChf(e.target.value)}
              inputMode="decimal"
              required
            />
          </label>
          <Button type="submit" variant="action" disabled={createMut.isPending}>
            Hinzufügen
          </Button>
        </form>
        {err && <p className="mt-2 text-sm text-danger">{err}</p>}
      </Card>

      {catalogQ.isLoading && <p className="text-sm text-ink-muted">Laden…</p>}
      <ul className="space-y-2">
        {(catalogQ.data ?? []).map((item) => (
          <li key={item.id}>
            <Card>
              {editId === item.id ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-3">
                    <input
                      className="min-w-[140px] flex-1 rounded-btn border border-border px-3 py-2 text-sm"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                    />
                    <input
                      className="w-24 rounded-btn border border-border px-3 py-2 text-sm"
                      value={editDeposit}
                      onChange={(e) => setEditDeposit(e.target.value)}
                      inputMode="decimal"
                    />
                    <label className="inline-flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={editActive}
                        onChange={(e) => setEditActive(e.target.checked)}
                      />
                      Aktiv
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="action"
                      onClick={() => updateMut.mutate()}
                      disabled={updateMut.isPending}
                    >
                      Speichern
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => setEditId(null)}>
                      Abbrechen
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-ink">
                      {item.name}{' '}
                      {!item.active && (
                        <span className="text-xs font-normal text-ink-muted">(inaktiv)</span>
                      )}
                    </p>
                    <p className="text-xs text-ink-muted">Pfand {formatChf(item.depositCents)}</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-0 px-2 py-1 text-xs"
                    onClick={() => startEdit(item)}
                  >
                    Bearbeiten
                  </Button>
                </div>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
