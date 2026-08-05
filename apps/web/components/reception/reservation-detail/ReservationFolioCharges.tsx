import type { ReservationDetail, ReservationFolioCharge } from '@housekeeping/shared';
import { chargesForFolio, normalizeFolioId, rehydrateFolioBundle } from '@housekeeping/shared';
import { useMemo, useState } from 'react';
import { APP_DARK_CARD, APP_DARK_INPUT } from '@/components/nav/AppPageChrome';
import {
  Field,
  formatEmmaValue,
  ListSection,
  RecordGrid,
  Section,
} from './ReservationDetailFields';
import { formatEmmaAmount, folioCurrency, folioDisplayNumber, folioTitle } from './folioFormat';

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

function chargeRowId(c: ReservationFolioCharge): string {
  return String(c.position ?? c.id).trim();
}

type MoveFolioChargeHandler = (
  sourceFolioId: string,
  chargeRowId: string,
  destinationFolioId: string,
) => Promise<void>;

function ChargeMoveControl({
  charge,
  sourceFolioId,
  destinationFolios,
  canMove,
  moving,
  onMove,
}: {
  charge: ReservationFolioCharge;
  sourceFolioId: string;
  destinationFolios: { id: string; label: string }[];
  canMove: boolean;
  moving: boolean;
  onMove: MoveFolioChargeHandler;
}) {
  const [target, setTarget] = useState(destinationFolios[0]?.id ?? '');
  const [busy, setBusy] = useState(false);

  if (!canMove || destinationFolios.length === 0) return null;

  const disabled = moving || busy || !target;

  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      <select
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        disabled={disabled}
        className={`${APP_DARK_INPUT} max-w-[120px] py-1 text-xs`}
        aria-label={`Ziel-Folio für Posten ${chargeRowId(charge)}`}
      >
        {destinationFolios.map((f) => (
          <option key={f.id} value={f.id}>
            Folio {folioDisplayNumber(f.id)}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!target) return;
          setBusy(true);
          void onMove(sourceFolioId, chargeRowId(charge), target).finally(() => setBusy(false));
        }}
        className="rounded border border-sidebar-border bg-transparent px-2 py-1 text-xs font-medium text-white hover:bg-white/10 disabled:opacity-50"
      >
        {busy || moving ? '…' : 'Verschieben'}
      </button>
    </div>
  );
}

export function FolioChargeTable({
  charges,
  sourceFolioId,
  allFolios,
  canMove,
  moving,
  onMove,
}: {
  charges: ReservationFolioCharge[];
  sourceFolioId?: string;
  allFolios?: Record<string, unknown>[];
  canMove?: boolean;
  moving?: boolean;
  onMove?: MoveFolioChargeHandler;
}) {
  const destinationFolios = useMemo(() => {
    if (!sourceFolioId || !allFolios) return [];
    const src = normalizeFolioId(sourceFolioId);
    return [...allFolios]
      .map((f) => normalizeFolioId(f.Id))
      .filter((id) => id && id !== src)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map((id) => {
        const folio = allFolios.find((f) => normalizeFolioId(f.Id) === id);
        return { id, label: folio ? folioTitle(folio) : `Folio ${id}` };
      });
  }, [allFolios, sourceFolioId]);

  const showMove = Boolean(canMove && onMove && sourceFolioId);

  if (charges.length === 0) {
    return <p className="py-4 text-center text-sm text-sidebar-muted">Keine Posten vorhanden.</p>;
  }
  return (
    <div className="max-h-[360px] overflow-auto">
      <table className="w-full min-w-[760px] text-left text-xs">
        <thead className="sticky top-0 z-10 bg-[#1A2332] text-sidebar-muted backdrop-blur">
          <tr>
            <th className="px-2 py-2 font-semibold">Pos.</th>
            <th className="px-2 py-2 font-semibold">Datum</th>
            <th className="px-2 py-2 font-semibold">Concept</th>
            <th className="px-2 py-2 font-semibold">Beschreibung</th>
            <th className="px-2 py-2 font-semibold">Gast</th>
            <th className="px-2 py-2 font-semibold">Menge</th>
            <th className="px-2 py-2 font-semibold">Betrag</th>
            <th className="px-2 py-2 font-semibold">Status</th>
            {showMove && <th className="px-2 py-2 text-right font-semibold">Move</th>}
          </tr>
        </thead>
        <tbody>
          {charges.map((c) => (
            <tr key={c.id} className="border-t border-sidebar-border/40">
              <td className="px-2 py-2 tabular-nums text-sidebar-muted">{chargePosition(c)}</td>
              <td className="px-2 py-2 text-sidebar-muted">{chargeDate(c)}</td>
              <td className="px-2 py-2 text-sidebar-muted">{c.concept ?? '—'}</td>
              <td className="px-2 py-2 text-white">{c.description ?? '—'}</td>
              <td className="px-2 py-2 text-sidebar-muted">{c.guestName ?? '—'}</td>
              <td className="px-2 py-2 tabular-nums text-white">{formatEmmaAmount(c.quantity) ?? '—'}</td>
              <td className="px-2 py-2 tabular-nums font-medium text-white">{chargeAmount(c)}</td>
              <td className="px-2 py-2 text-sidebar-muted">{c.status ?? '—'}</td>
              {showMove && sourceFolioId && onMove && (
                <td className="px-2 py-2">
                  <ChargeMoveControl
                    charge={c}
                    sourceFolioId={sourceFolioId}
                    destinationFolios={destinationFolios}
                    canMove={!!canMove}
                    moving={!!moving}
                    onMove={onMove}
                  />
                </td>
              )}
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
  allFolios,
  canMove,
  moving,
  onMove,
}: {
  folio: Record<string, unknown>;
  charges: ReservationFolioCharge[];
  allFolios: Record<string, unknown>[];
  canMove?: boolean;
  moving?: boolean;
  onMove?: MoveFolioChargeHandler;
}) {
  const currency = folioCurrency(folio);
  const folioId = String(folio.Id ?? '');
  return (
    <article className={`${APP_DARK_CARD} flex min-h-[280px] flex-col overflow-hidden`}>
      <header className="border-b border-sidebar-border/60 bg-white/5 px-4 py-3">
        <h4 className="text-sm font-semibold text-white">{folioTitle(folio)}</h4>
        <p className="mt-0.5 text-xs text-sidebar-muted">
          {charges.length} {charges.length === 1 ? 'Posten' : 'Posten'}
        </p>
      </header>
      <div className="flex-1 px-2 py-1">
        <FolioChargeTable
          charges={charges}
          sourceFolioId={folioId}
          allFolios={allFolios}
          canMove={canMove}
          moving={moving}
          onMove={onMove}
        />
      </div>
      <footer className="space-y-1 border-t border-sidebar-border/60 bg-white/5 px-4 py-3 text-xs">
        <div className="flex justify-between gap-4">
          <span className="text-sidebar-muted">Total ohne Steuern</span>
          <span className="tabular-nums font-medium text-white">
            {formatEmmaAmount(folio.AmountTotalWot, currency) ?? '—'}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-sidebar-muted">Total mit Steuern</span>
          <span className="tabular-nums font-medium text-white">
            {formatEmmaAmount(folio.AmountTotal, currency) ?? '—'}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-sidebar-muted">Bezahlt</span>
          <span className="tabular-nums text-white">
            {formatEmmaAmount(folio.AmountPaid, currency) ?? '—'}
          </span>
        </div>
        <div className="flex justify-between gap-4 border-t border-sidebar-border/60 pt-2">
          <span className="font-semibold text-white">Offen</span>
          <span className="tabular-nums font-semibold text-rose-300">
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
  canMove,
  moving,
  onMove,
}: {
  folios: Record<string, unknown>[];
  allCharges: ReservationFolioCharge[];
  chargesByFolio?: Record<string, ReservationFolioCharge[]>;
  canMove?: boolean;
  moving?: boolean;
  onMove?: MoveFolioChargeHandler;
}) {
  const sorted = [...folios].sort((a, b) =>
    String(a.Id ?? '').localeCompare(String(b.Id ?? ''), undefined, { numeric: true }),
  );

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {sorted.map((folio) => {
        const folioId = String(folio.Id ?? '');
        const charges = chargesForFolio(folioId, allCharges, chargesByFolio);
        return (
          <FolioCard
            key={folioId}
            folio={folio}
            charges={charges}
            allFolios={folios}
            canMove={canMove}
            moving={moving}
            onMove={onMove}
          />
        );
      })}
    </div>
  );
}

export function EmmaFolioSections({
  emmaFolio: rawFolio,
  canMove,
  moving,
  onMoveCharge,
}: {
  emmaFolio: NonNullable<ReservationDetail['emmaFolio']>;
  canMove?: boolean;
  moving?: boolean;
  onMoveCharge?: MoveFolioChargeHandler;
}) {
  const emmaFolio = useMemo(() => rehydrateFolioBundle(rawFolio), [rawFolio]);
  const r = emmaFolio.reservation;
  const currency = String(r.Currency ?? 'CHF').trim();

  return (
    <div className="space-y-4">
      {canMove && onMoveCharge && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/15 px-3 py-2 text-sm text-amber-200">
          Test: Einzelne Posten per «Verschieben» in EMMA auf ein anderes Folio moven (Operator-Login
          erforderlich). Nach dem Move wird das Folio automatisch neu geladen.
        </p>
      )}

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
            canMove={canMove}
            moving={moving}
            onMove={onMoveCharge}
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
