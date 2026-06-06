import type { ReservationDetail, ReservationFolioCharge } from '@housekeeping/shared';
import {
  Field,
  formatEmmaValue,
  ListSection,
  RecordGrid,
  Section,
} from './ReservationDetailFields';

export function FolioChargeTable({ charges }: { charges: ReservationFolioCharge[] }) {
  if (charges.length === 0) {
    return <p className="text-sm text-ink-muted">Keine Charges gefunden.</p>;
  }
  return (
    <div className="max-h-[480px] overflow-auto rounded-lg border border-border/60">
      <table className="w-full min-w-[720px] text-left text-xs">
        <thead className="sticky top-0 z-10 bg-surface-muted/95 text-ink-muted backdrop-blur">
          <tr>
            <th className="px-2 py-2 font-semibold">Beschreibung</th>
            <th className="px-2 py-2 font-semibold">Concept</th>
            <th className="px-2 py-2 font-semibold">Typ</th>
            <th className="px-2 py-2 font-semibold">Datum</th>
            <th className="px-2 py-2 font-semibold">Menge</th>
            <th className="px-2 py-2 font-semibold">Betrag</th>
            <th className="px-2 py-2 font-semibold">Status</th>
            <th className="px-2 py-2 font-semibold">Folio</th>
          </tr>
        </thead>
        <tbody>
          {charges.map((c) => (
            <tr key={c.id} className="border-t border-border/50">
              <td className="px-2 py-2 text-ink">{c.description ?? '—'}</td>
              <td className="px-2 py-2 text-ink-muted">{c.concept ?? '—'}</td>
              <td className="px-2 py-2 text-ink-muted">{c.chargeType ?? c.conceptNature ?? '—'}</td>
              <td className="px-2 py-2 text-ink-muted">{c.productionDate?.slice(0, 10) ?? '—'}</td>
              <td className="px-2 py-2 tabular-nums">{c.quantity ?? '—'}</td>
              <td className="px-2 py-2 tabular-nums font-medium text-ink">
                {c.amount ?? c.priceWithTax ?? '—'} {c.currency ?? ''}
              </td>
              <td className="px-2 py-2">{c.status ?? '—'}</td>
              <td className="px-2 py-2 tabular-nums">{c.folioId ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EmmaFolioSections({
  emmaFolio,
}: {
  emmaFolio: NonNullable<ReservationDetail['emmaFolio']>;
}) {
  const r = emmaFolio.reservation;
  return (
    <div className="space-y-4">
      <Section title="Folio Management — Summen">
        <Field label="Total Folios" value={formatEmmaValue(r.TotalAmountFolios ?? r.TotalAmountDueFolios)} />
        <Field label="Offen" value={formatEmmaValue(r.TotalAmountDueFolios)} />
        <Field label="Bezahlt" value={formatEmmaValue(r.AmountPaid)} />
        <Field label="Währung" value={formatEmmaValue(r.Currency)} />
        {emmaFolio.amount && (
          <>
            <Field label="Total (Amount)" value={formatEmmaValue(emmaFolio.amount.Total)} />
            <Field label="Steuern" value={formatEmmaValue(emmaFolio.amount.Taxes)} />
            <Field label="Taxable Base" value={formatEmmaValue(emmaFolio.amount.TaxableBase)} />
          </>
        )}
      </Section>

      <ListSection title={`Charges (${emmaFolio.charges.length})`}>
        <FolioChargeTable charges={emmaFolio.charges} />
      </ListSection>

      {emmaFolio.folios.length > 0 && (
        <ListSection title={`Folios (${emmaFolio.folios.length})`}>
          <RecordGrid rows={emmaFolio.folios} />
        </ListSection>
      )}

      {emmaFolio.remarks && (
        <Section title="Remarks">
          <Field label="Text" value={formatEmmaValue(emmaFolio.remarks.Text)} />
        </Section>
      )}

      {emmaFolio.loanedItems.length > 0 && (
        <ListSection title={`Loaned Items (${emmaFolio.loanedItems.length})`}>
          <RecordGrid rows={emmaFolio.loanedItems} />
        </ListSection>
      )}

      {emmaFolio.notices.length > 0 && (
        <ListSection title={`Notices (${emmaFolio.notices.length})`}>
          <RecordGrid rows={emmaFolio.notices} />
        </ListSection>
      )}
    </div>
  );
}
