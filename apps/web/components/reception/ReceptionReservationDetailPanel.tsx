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

function BoolField({ label, value }: { label: string; value: boolean }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink">{value ? 'Ja' : 'Nein'}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-surface-muted/30 p-4">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-muted">{title}</h3>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

function reservationStatus(data: ReservationDetail) {
  if (data.checkOut) return { label: 'Ausgecheckt', className: 'bg-surface-muted text-ink-muted' };
  if (data.checkIn) return { label: 'Im Haus', className: 'bg-emerald-100 text-emerald-900' };
  if (data.checkInQueue) return { label: 'Check-in Queue', className: 'bg-amber-100 text-amber-900' };
  return { label: 'Anreise offen', className: 'bg-sky-100 text-sky-900' };
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
  const { data, isLoading, isError } = useQuery({
    queryKey: ['reservation', reservationId],
    queryFn: () => api<ReservationDetail>(`/reservations/${reservationId}`),
    enabled: open && !!reservationId,
  });

  if (!open || !reservationId) return null;

  const status = data ? reservationStatus(data) : null;

  return (
    <>
      <button type="button" className="fixed inset-0 z-40 bg-ink/25" aria-label="Schliessen" onClick={onClose} />
      <aside className="fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-2xl flex-col border-l border-border bg-surface shadow-lift">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-xl font-semibold text-ink">
              {data?.mainGuestName ?? 'Reservierung'}
            </h2>
            <p className="text-sm text-ink-muted">Res.-Nr. {reservationId}</p>
            {status && (
              <span className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${status.className}`}>
                {status.label}
              </span>
            )}
          </div>
          <button
            type="button"
            className="shrink-0 rounded-full p-2 text-ink-muted hover:bg-surface-muted"
            onClick={onClose}
            aria-label="Panel schliessen"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {isLoading && <p className="text-sm text-ink-muted">Lädt…</p>}
          {isError && (
            <p className="text-sm text-rose-700">Reservierung konnte nicht geladen werden.</p>
          )}
          {data && (
            <>
              <Section title="Gast">
                <Field label="Hauptgast" value={data.mainGuestName} />
                <Field label="Gast-ID" value={data.mainGuestId} />
                <Field label="Kundenname" value={data.mainClientName} />
                <Field label="VIP / Tier" value={[data.tier, data.vipDesc].filter(Boolean).join(' · ') || null} />
                <Field label="Gäste gesamt" value={data.numPax != null ? String(data.numPax) : null} />
                <Field label="Gäste (Detail)" value={data.guests} />
              </Section>

              <Section title="Aufenthalt">
                <Field label="Anreise" value={data.arrivalDate} />
                <Field label="Abreise" value={data.departureDate} />
                <Field label="Nächte" value={data.nightsStay != null ? String(data.nightsStay) : null} />
                <Field label="Verpflegung" value={data.mealPlan} />
                <Field label="Aufenthalte" value={data.stays} />
                <Field label="Stayover" value={data.stayover ? 'Ja' : null} />
              </Section>

              <Section title="Zimmer">
                <Field label="Zimmer" value={data.roomId} />
                <Field label="Zimmertyp" value={data.roomType} />
                <Field label="Original-Typ" value={data.originalRoomType} />
                <Field label="Upgrade-Typ" value={data.roomTypeUpg} />
                <BoolField label="No Move" value={data.noMove} />
              </Section>

              <Section title="Gruppe & Firma">
                <Field label="Gruppe" value={data.groupName} />
                <Field label="Gruppen-ID" value={data.groupId} />
                <Field label="Firma" value={data.companyName} />
                <Field label="Reisebüro" value={data.travelAgent} />
                <Field label="Booking File" value={data.bookingFileId} />
              </Section>

              <Section title="Tarif & Quelle">
                <Field label="Rate Code" value={data.rateCode} />
                <Field label="Source Code" value={data.sourceCode} />
                <Field label="Market Code" value={data.marketCode} />
                <Field label="Balance" value={data.balance} />
              </Section>

              <Section title="Zahlung">
                <Field label="Karte" value={data.creditCard} />
                <Field label="Karteninhaber" value={data.cardHolder} />
                <Field label="Ablauf" value={data.cardExpiry} />
                <Field label="Pre-Auth" value={data.preAuthAmount} />
              </Section>

              <Section title="Check-in Status">
                <Field label="Queue-Datum" value={data.checkInQDate} />
                <BoolField label="Eingecheckt" value={data.checkIn} />
                <BoolField label="Ausgecheckt" value={data.checkOut} />
                <BoolField label="In Queue" value={data.checkInQueue} />
                <BoolField label="CI Status signiert" value={data.ciStatusSigned} />
                <Field label="Draft Status" value={data.draftStatus} />
                <Field label="Draft gesperrt von" value={data.draftLockedBy} />
              </Section>

              {(data.comments || data.inTodayArrivals != null) && (
                <Section title="Notizen & Sichtbarkeit">
                  <Field label="Kommentar" value={data.comments} />
                  {data.inTodayArrivals != null && (
                    <BoolField label="Heute in Anreisen" value={data.inTodayArrivals} />
                  )}
                </Section>
              )}

              <Section title="System">
                <Field label="Hotel" value={data.hotelId} />
                <Field label="Zuletzt synchronisiert" value={new Date(data.syncedAt).toLocaleString('de-CH')} />
              </Section>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
