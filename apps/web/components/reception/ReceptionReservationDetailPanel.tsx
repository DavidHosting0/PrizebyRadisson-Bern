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

function ListSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-surface-muted/30 p-4">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-muted">{title}</h3>
      {children}
    </section>
  );
}

function reservationStatus(data: ReservationDetail) {
  if (data.checkOut) return { label: 'Ausgecheckt', className: 'bg-surface-muted text-ink-muted' };
  if (data.checkIn) return { label: 'Im Haus', className: 'bg-emerald-100 text-emerald-900' };
  if (data.checkInQueue) return { label: 'Check-in Queue', className: 'bg-amber-100 text-amber-900' };
  return { label: 'Anreise offen', className: 'bg-sky-100 text-sky-900' };
}

function formatEmmaValue(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value === 'boolean') return value ? 'Ja' : 'Nein';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    const m = /\/Date\((-?\d+)\)\//.exec(value);
    if (m) return new Date(parseInt(m[1], 10)).toLocaleString('de-CH');
    return value.trim() || null;
  }
  return JSON.stringify(value);
}

function RecordGrid({ rows }: { rows: Record<string, unknown>[] }) {
  if (rows.length === 0) return <p className="text-sm text-ink-muted">Keine Einträge</p>;
  return (
    <div className="space-y-3">
      {rows.map((row, i) => (
        <div key={i} className="rounded-lg border border-border/60 bg-surface p-3">
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {Object.entries(row).map(([key, value]) => {
              const formatted = formatEmmaValue(value);
              if (!formatted) return null;
              return (
                <div key={key}>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{key}</dt>
                  <dd className="mt-0.5 text-sm text-ink">{formatted}</dd>
                </div>
              );
            })}
          </dl>
        </div>
      ))}
    </div>
  );
}

function EmmaDetailSections({ emmaDetail }: { emmaDetail: NonNullable<import('@housekeeping/shared').ReservationDetail['emmaDetail']> }) {
  const r = emmaDetail.reservation;
  return (
    <>
      <Section title="EMMA Reservierung (vollständig)">
        <Field label="Status" value={formatEmmaValue(r.StatusDesc ?? r.Status)} />
        <Field label="Rate" value={formatEmmaValue(r.RateDesc ?? r.Rate)} />
        <Field label="Kontakt" value={formatEmmaValue(r.ContactPerson)} />
        <Field label="Telefon" value={formatEmmaValue(r.ContactPhone)} />
        <Field label="E-Mail" value={formatEmmaValue(r.Email)} />
        <Field label="Land" value={formatEmmaValue(r.Country)} />
        <Field label="Währung" value={formatEmmaValue(r.Currency)} />
        <Field label="Garantie" value={formatEmmaValue(r.Guarantee)} />
        <Field label="Channel" value={formatEmmaValue(r.ChannelId)} />
        <Field label="Subchannel" value={formatEmmaValue(r.SubchannelId)} />
        <Field label="Externe Referenz" value={formatEmmaValue(r.ExternalReference)} />
        <Field label="Voucher" value={formatEmmaValue(r.Voucher)} />
        <Field label="Storno-Policy" value={formatEmmaValue(r.CancelPolicyDesc ?? r.CancellationPolicy)} />
        <Field label="TMS Remark" value={formatEmmaValue(r.TMS4CRemark)} />
        <Field label="Zimmertyp Beschreibung" value={formatEmmaValue(r.RoomTypeDesc)} />
        <Field label="Total Folio" value={formatEmmaValue(r.TotalAmountDueFolios ?? r.TotalAmountFolios)} />
      </Section>

      {emmaDetail.guests.length > 0 && (
        <ListSection title={`Gäste (${emmaDetail.guests.length})`}>
          <RecordGrid rows={emmaDetail.guests} />
        </ListSection>
      )}

      {emmaDetail.creditCards.length > 0 && (
        <ListSection title={`Kreditkarten (${emmaDetail.creditCards.length})`}>
          <RecordGrid rows={emmaDetail.creditCards} />
        </ListSection>
      )}

      {emmaDetail.preauthorizations.length > 0 && (
        <ListSection title={`Pre-Authorizations (${emmaDetail.preauthorizations.length})`}>
          <RecordGrid rows={emmaDetail.preauthorizations} />
        </ListSection>
      )}

      {emmaDetail.roomList.length > 0 && (
        <ListSection title={`Zimmerliste (${emmaDetail.roomList.length})`}>
          <RecordGrid rows={emmaDetail.roomList} />
        </ListSection>
      )}

      {emmaDetail.loyaltyBenefits.length > 0 && (
        <ListSection title={`Loyalty Benefits (${emmaDetail.loyaltyBenefits.length})`}>
          <RecordGrid rows={emmaDetail.loyaltyBenefits} />
        </ListSection>
      )}

      {emmaDetail.policeRecords.length > 0 && (
        <ListSection title={`Police Records (${emmaDetail.policeRecords.length})`}>
          <RecordGrid rows={emmaDetail.policeRecords} />
        </ListSection>
      )}
    </>
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
                {data.detailFetchedAt && (
                  <Field
                    label="EMMA Detail geladen"
                    value={new Date(data.detailFetchedAt).toLocaleString('de-CH')}
                  />
                )}
              </Section>

              {data.emmaDetail && <EmmaDetailSections emmaDetail={data.emmaDetail} />}
            </>
          )}
        </div>
      </aside>
    </>
  );
}
