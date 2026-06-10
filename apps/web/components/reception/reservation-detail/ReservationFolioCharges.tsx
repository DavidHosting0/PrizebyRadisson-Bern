import type { ReservationDetail, ReservationFolioCharge } from '@housekeeping/shared';
import { chargesForFolio, rehydrateFolioBundle } from '@housekeeping/shared';
import { useMemo } from 'react';
import {
  Field,
  formatEmmaValue,
  ListSection,
  RecordGrid,
  Section,
} from './ReservationDetailFields';
import { formatEmmaAmount, folioCurrency, folioTitle } from './folioFormat';

function chargeAmount(c: ReservationFolioCharge): string {
  const amount = c.amount ?? c.priceWithTax ?? c.price;
  return formatEmmaAmount(amount, c.currency) ?? '—';
}

function chargeDate(c: ReservationFolioCharge): string {
  if (!c.productionDate) return '—';
  const d = c.productionDate.slice(0, 10);
  const [y, m, day] = d.split('-');
  if (y && m && day) return `${day}.${m}.${y}`;
  return d;
}

function chargePosition(c: ReservationFolioCharge): string {
  const pos = c.position ?? c.id;
  if (!pos) return '—';
  const n = parseInt(pos, 10);
  return Number.isFinite(n) ? String(n) : pos;
}

export function FolioChargeTable({ charges }: { charges: ReservationFolioCharge[] }) {
  if (charges.length === 0) {
    return <p className="py-4 text-center text-sm text-ink-muted">Keine Posten vorhanden.</p>;
  }
  return (
    <div className="max-h-[360px] overflow-auto">
      <table className="w-full min-w-[680px] text-left text-xs">
        <thead className="sticky top-0 z-10 bg-surface-muted/95 text-ink-muted backdrop-blur">
          <tr>
            <th className="px-2 py-2 font-semibold">Pos.</th>
            <th className="px-2 py-2 font-semibold">Datum</th>
            <th className="px-2 py-2 font-semibold">Concept</th>
            <th className="px-2 py-2 font-semibold">Beschreibung</th>
            <th className="px-2 py-2 font-semibold">Gast</th>
            <th className="px-2 py-2 font-semibold">Menge</th>
            <th className="px-2 py-2 font-semibold">Betrag</th>
            <th className="px-2 py-2 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {charges.map((c) => (
            <tr key={c.id} className="border-t border-border/50">
              <td className="px-2 py-2 tabular-nums text-ink-muted">{chargePosition(c)}</td>
              <td className="px-2 py-2 text-ink-muted">{chargeDate(c)}</td>
              <td className="px-2 py-2 text-ink-muted">{c.concept ?? '—'}</td>
              <td className="px-2 py-2 text-ink">{c.description ?? '—'}</td>
              <td className="px-2 py-2 text-ink-muted">{c.guestName ?? '—'}</td>
              <td className="px-2 py-2 tabular-nums">{formatEmmaAmount(c.quantity) ?? '—'}</td>
              <td className="px-2 py-2 tabular-nums font-medium text-ink">{chargeAmount(c)}</td>
              <td className="px-2 py-2">{c.status ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FolioCard({
  folio,
  charges,
}: {
  folio: Record<string, unknown>;
  charges: ReservationFolioCharge[];
}) {
  const currency = folioCurrency(folio);
  return (
    <article className="flex min-h-[280px] flex-col rounded-xl border border-border bg-surface">
      <header className="border-b border-border bg-surface-muted/40 px-4 py-3">
        <h4 className="text-sm font-semibold text-ink">{folioTitle(folio)}</h4>
        <p className="mt-0.5 text-xs text-ink-muted">
          {charges.length} {charges.length === 1 ? 'Posten' : 'Posten'}
        </p>
      </header>
      <div className="flex-1 px-2 py-1">
        <FolioChargeTable charges={charges} />
      </div>
      <footer className="space-y-1 border-t border-border bg-surface-muted/20 px-4 py-3 text-xs">
        <div className="flex justify-between gap-4">
          <span className="text-ink-muted">Total ohne Steuern</span>
          <span className="tabular-nums font-medium text-ink">
            {formatEmmaAmount(folio.AmountTotalWot, currency) ?? '—'}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-ink-muted">Total mit Steuern</span>
          <span className="tabular-nums font-medium text-ink">
            {formatEmmaAmount(folio.AmountTotal, currency) ?? '—'}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-ink-muted">Bezahlt</span>
          <span className="tabular-nums text-ink">
            {formatEmmaAmount(folio.AmountPaid, currency) ?? '—'}
          </span>
        </div>
        <div className="flex justify-between gap-4 border-t border-border/60 pt-2">
          <span className="font-semibold text-ink">Offen</span>
          <span className="tabular-nums font-semibold text-rose-700">
            {formatEmmaAmount(folio.AmountDue, currency) ?? '—'}
          </span>
        </div>
      </footer>
    </article>
  );
}

function FolioGrid({
  folios,
  allCharges,
  chargesByFolio,
}: {
  folios: Record<string, unknown>[];
  allCharges: ReservationFolioCharge[];
  chargesByFolio?: Record<string, ReservationFolioCharge[]>;
}) {
  const sorted = [...folios].sort((a, b) =>
    String(a.Id ?? '').localeCompare(String(b.Id ?? ''), undefined, { numeric: true }),
  );

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {sorted.map((folio) => {
        const folioId = String(folio.Id ?? '');
        const charges = chargesForFolio(folioId, allCharges, chargesByFolio);
        return <FolioCard key={folioId} folio={folio} charges={charges} />;
      })}
    </div>
  );
}

export function EmmaFolioSections({
  emmaFolio: rawFolio,
}: {
  emmaFolio: NonNullable<ReservationDetail['emmaFolio']>;
}) {
  const emmaFolio = useMemo(() => rehydrateFolioBundle(rawFolio), [rawFolio]);
  const r = emmaFolio.reservation;
  const currency = String(r.Currency ?? 'CHF').trim();

  return (
    <div className="space-y-4">
      <Section title="Folio Management — Summen">
        <Field
          label="Total Folios"
          value={formatEmmaAmount(r.TotalAmountFolios ?? r.TotalAmountDueFolios, currency)}
        />
        <Field label="Offen" value={formatEmmaAmount(r.TotalAmountDueFolios, currency)} />
        <Field label="Bezahlt" value={formatEmmaAmount(r.AmountPaid, currency)} />
        <Field label="Währung" value={formatEmmaValue(r.Currency)} />
        {emmaFolio.amount && (
          <>
            <Field label="Total (Amount)" value={formatEmmaAmount(emmaFolio.amount.Total, currency)} />
            <Field label="Steuern" value={formatEmmaAmount(emmaFolio.amount.Taxes, currency)} />
            <Field
              label="Taxable Base"
              value={formatEmmaAmount(emmaFolio.amount.TaxableBase, currency)}
            />
          </>
        )}
      </Section>

      {emmaFolio.folios.length > 0 ? (
        <ListSection
          title={`Folios (${emmaFolio.folios.length})`}
          subtitle={
            emmaFolio.fetchedAt
              ? `Stand: ${new Date(emmaFolio.fetchedAt).toLocaleString('de-CH')}`
              : undefined
          }
        >
          <FolioGrid
            folios={emmaFolio.folios}
            allCharges={emmaFolio.charges}
            chargesByFolio={emmaFolio.chargesByFolio}
          />
        </ListSection>
      ) : (
        <ListSection title="Charges">
          <FolioChargeTable charges={emmaFolio.charges} />
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
