'use client';

import { useQuery } from '@tanstack/react-query';
import type { ReservationDetail } from '@housekeeping/shared';
import { api } from '@/lib/api';

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value?.trim()) return null;
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink">{value}</dd>
    </div>
  );
}

export function ReceptionReservationDetailPanel({
  reservationId,
  open,
  onClose,
}: {
  reservationId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['reservation', reservationId],
    queryFn: () => api<ReservationDetail>(`/reservations/${reservationId}`),
    enabled: open && !!reservationId,
  });

  if (!open || !reservationId) return null;

  return (
    <>
      <button type="button" className="fixed inset-0 z-40 bg-ink/25" aria-label="Close" onClick={onClose} />
      <aside className="fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-surface shadow-lift">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-xl font-semibold text-ink">
              {data?.mainGuestName ?? 'Reservation'}
            </h2>
            <p className="text-sm text-ink-muted">#{reservationId}</p>
          </div>
          <button
            type="button"
            className="rounded-full p-2 text-ink-muted hover:bg-surface-muted"
            onClick={onClose}
            aria-label="Close panel"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isLoading && <p className="text-sm text-ink-muted">Lädt…</p>}
          {data && (
            <dl className="grid grid-cols-1 gap-4">
              <Field label="Zimmer" value={data.roomId} />
              <Field label="Anreise" value={data.arrivalDate} />
              <Field label="Abreise" value={data.departureDate} />
              <Field label="Nächte" value={data.nightsStay != null ? String(data.nightsStay) : null} />
              <Field label="Zimmertyp" value={data.roomType} />
              <Field label="Verpflegung" value={data.mealPlan} />
              <Field label="Tier / VIP" value={[data.tier, data.vipDesc].filter(Boolean).join(' · ') || null} />
              <Field label="Gäste" value={data.numPax != null ? String(data.numPax) : null} />
              <Field label="Gruppe" value={data.groupName} />
              <Field label="Firma" value={data.companyName} />
              <Field label="Rate" value={data.rateCode} />
              <Field label="Balance" value={data.balance} />
              <Field label="Karte" value={data.creditCard} />
              <Field label="Karteninhaber" value={data.cardHolder} />
              <Field label="Ablauf" value={data.cardExpiry} />
              <Field label="Pre-Auth" value={data.preAuthAmount} />
              <Field label="Kommentar" value={data.comments} />
              <Field
                label="Status"
                value={
                  data.checkIn
                    ? 'Eingecheckt'
                    : data.checkInQueue
                      ? 'Warteschlange'
                      : 'Anreise offen'
                }
              />
              <Field label="Zuletzt synchronisiert" value={new Date(data.syncedAt).toLocaleString('de-CH')} />
            </dl>
          )}
        </div>
      </aside>
    </>
  );
}
