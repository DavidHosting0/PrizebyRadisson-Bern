'use client';

import type { ReservationDetail } from '@housekeeping/shared';
import {
  BoolField,
  EmptyState,
  Field,
  ListSection,
  RecordGrid,
  Section,
} from './ReservationDetailFields';
import { EmmaDetailSections } from './ReservationEmmaSections';
import { EmmaFolioSections } from './ReservationFolioCharges';

export type ReservationDetailTab = 'overview' | 'folio' | 'emma' | 'guests';

const TABS: { id: ReservationDetailTab; label: string }[] = [
  { id: 'overview', label: 'Übersicht' },
  { id: 'folio', label: 'Folio & Charges' },
  { id: 'emma', label: 'EMMA Detail' },
  { id: 'guests', label: 'Gäste & Zahlung' },
];

function OverviewTab({ data }: { data: ReservationDetail }) {
  return (
    <div className="space-y-4">
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
          <Field label="EMMA Detail geladen" value={new Date(data.detailFetchedAt).toLocaleString('de-CH')} />
        )}
        {data.folioFetchedAt && (
          <Field label="Folio geladen" value={new Date(data.folioFetchedAt).toLocaleString('de-CH')} />
        )}
      </Section>
    </div>
  );
}

function FolioTab({ data, canSync }: { data: ReservationDetail; canSync: boolean }) {
  if (!data.emmaFolio) {
    return (
      <EmptyState
        title="Folio noch nicht geladen"
        description={
          canSync
            ? 'Nutzen Sie oben „Folio laden“, um Charges und Summen von EMMA abzurufen.'
            : 'Folio-Daten wurden noch nicht von EMMA geladen.'
        }
      />
    );
  }
  return <EmmaFolioSections emmaFolio={data.emmaFolio} />;
}

function EmmaTab({ data, canSync }: { data: ReservationDetail; canSync: boolean }) {
  if (!data.emmaDetail) {
    return (
      <EmptyState
        title="EMMA Detail noch nicht geladen"
        description={
          canSync
            ? 'Nutzen Sie oben „EMMA Detail laden“, um die vollständigen Reservierungsdaten von EMMA abzurufen.'
            : 'EMMA-Detaildaten wurden noch nicht geladen.'
        }
      />
    );
  }
  return <EmmaDetailSections emmaDetail={data.emmaDetail} />;
}

function GuestsTab({ data }: { data: ReservationDetail }) {
  const emma = data.emmaDetail;
  return (
    <div className="space-y-4">
      <Section title="Zahlung (Snapshot)">
        <Field label="Karte" value={data.creditCard} />
        <Field label="Karteninhaber" value={data.cardHolder} />
        <Field label="Ablauf" value={data.cardExpiry} />
        <Field label="Pre-Auth" value={data.preAuthAmount} />
      </Section>

      {emma && emma.guests.length > 0 && (
        <ListSection title={`Gäste (${emma.guests.length})`}>
          <RecordGrid rows={emma.guests} />
        </ListSection>
      )}

      {emma && emma.creditCards.length > 0 && (
        <ListSection title={`Kreditkarten (${emma.creditCards.length})`}>
          <RecordGrid rows={emma.creditCards} />
        </ListSection>
      )}

      {emma && emma.preauthorizations.length > 0 && (
        <ListSection title={`Pre-Authorizations (${emma.preauthorizations.length})`}>
          <RecordGrid rows={emma.preauthorizations} />
        </ListSection>
      )}

      {!emma && (
        <EmptyState
          title="Keine EMMA-Gästedaten"
          description="Laden Sie EMMA Detail, um Gäste- und Zahlungsdetails aus EMMA anzuzeigen."
        />
      )}
    </div>
  );
}

export function ReservationDetailView({
  data,
  activeTab,
  onTabChange,
  canSync,
}: {
  data: ReservationDetail;
  activeTab: ReservationDetailTab;
  onTabChange: (tab: ReservationDetailTab) => void;
  canSync: boolean;
}) {
  return (
    <div>
      <div className="flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
              activeTab === tab.id
                ? 'border-ink text-ink'
                : 'border-transparent text-ink-muted hover:text-ink'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {activeTab === 'overview' && <OverviewTab data={data} />}
        {activeTab === 'folio' && <FolioTab data={data} canSync={canSync} />}
        {activeTab === 'emma' && <EmmaTab data={data} canSync={canSync} />}
        {activeTab === 'guests' && <GuestsTab data={data} />}
      </div>
    </div>
  );
}

export function formatOpenTotal(data: ReservationDetail): string {
  if (data.emmaFolio?.reservation) {
    const r = data.emmaFolio.reservation;
    const due = r.TotalAmountDueFolios ?? r.TotalAmountFolios;
    if (due != null) return String(due);
  }
  return data.balance ?? '—';
}
