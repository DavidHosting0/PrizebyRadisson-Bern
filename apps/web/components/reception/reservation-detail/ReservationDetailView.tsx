'use client';

import type { ReservationDetail } from '@housekeeping/shared';
import { useTranslations } from 'next-intl';
import { useLocale } from '@/lib/locale-context';
import { formatDateTime } from '@/lib/format-locale';
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
import { formatEmmaAmount } from './folioFormat';

export type ReservationDetailTab = 'overview' | 'folio' | 'emma' | 'guests';

const TAB_IDS: ReservationDetailTab[] = ['overview', 'folio', 'emma', 'guests'];

function OverviewTab({ data }: { data: ReservationDetail }) {
  const t = useTranslations('reception');
  const tCommon = useTranslations('common');
  const { locale } = useLocale();
  return (
    <div className="space-y-4">
      <Section title={t('guest')}>
        <Field label={t('mainGuest')} value={data.mainGuestName} />
        <Field label={t('guestId')} value={data.mainGuestId} />
        <Field label={t('clientName')} value={data.mainClientName} />
        <Field label={t('vipTier')} value={[data.tier, data.vipDesc].filter(Boolean).join(' · ') || null} />
        <Field label={t('totalGuests')} value={data.numPax != null ? String(data.numPax) : null} />
        <Field label={t('guestsDetail')} value={data.guests} />
      </Section>

      <Section title={t('stay')}>
        <Field label={t('arrival')} value={data.arrivalDate} />
        <Field label={t('departure')} value={data.departureDate} />
        <Field label={t('nights')} value={data.nightsStay != null ? String(data.nightsStay) : null} />
        <Field label={t('mealPlan')} value={data.mealPlan} />
        <Field label={t('stays')} value={data.stays} />
        <Field label={t('stayover')} value={data.stayover ? tCommon('yes') : null} />
      </Section>

      <Section title={t('room')}>
        <Field label={t('room')} value={data.roomId} />
        <Field label={t('roomType')} value={data.roomType} />
        <Field label={t('originalType')} value={data.originalRoomType} />
        <Field label={t('upgradeType')} value={data.roomTypeUpg} />
        <BoolField label={t('noMove')} value={data.noMove} />
      </Section>

      <Section title={t('groupCompany')}>
        <Field label={t('group')} value={data.groupName} />
        <Field label={t('groupId')} value={data.groupId} />
        <Field label={t('company')} value={data.companyName} />
        <Field label={t('travelAgent')} value={data.travelAgent} />
        <Field label={t('bookingFile')} value={data.bookingFileId} />
      </Section>

      <Section title={t('rateSource')}>
        <Field label={t('rateCode')} value={data.rateCode} />
        <Field label={t('sourceCode')} value={data.sourceCode} />
        <Field label={t('marketCode')} value={data.marketCode} />
        <Field label={t('balance')} value={data.balance} />
      </Section>

      <Section title={t('checkInStatus')}>
        <Field label={t('queueDate')} value={data.checkInQDate} />
        <BoolField label={t('checkedIn')} value={data.checkIn} />
        <BoolField label={t('checkedOut')} value={data.checkOut} />
        <BoolField label={t('inQueue')} value={data.checkInQueue} />
        <BoolField label={t('ciSigned')} value={data.ciStatusSigned} />
        <Field label={t('draftStatus')} value={data.draftStatus} />
        <Field label={t('draftLockedBy')} value={data.draftLockedBy} />
      </Section>

      {(data.comments || data.inTodayArrivals != null) && (
        <Section title={t('notesVisibility')}>
          <Field label={t('comment')} value={data.comments} />
          {data.inTodayArrivals != null && (
            <BoolField label={t('inTodayArrivals')} value={data.inTodayArrivals} />
          )}
        </Section>
      )}

      <Section title={t('system')}>
        <Field label={t('hotel')} value={data.hotelId} />
        <Field label={t('lastSynced')} value={formatDateTime(data.syncedAt, locale)} />
        {data.detailFetchedAt && (
          <Field label={t('emmaDetailLoaded')} value={formatDateTime(data.detailFetchedAt, locale)} />
        )}
        {data.folioFetchedAt && (
          <Field label={t('folioLoaded')} value={formatDateTime(data.folioFetchedAt, locale)} />
        )}
      </Section>
    </div>
  );
}

function FolioTab({
  data,
  canSync,
  canMove,
  movingCharge,
  onMoveCharge,
}: {
  data: ReservationDetail;
  canSync: boolean;
  canMove?: boolean;
  movingCharge?: boolean;
  onMoveCharge?: (
    sourceFolioId: string,
    chargeRowId: string,
    destinationFolioId: string,
  ) => Promise<void>;
}) {
  const t = useTranslations('reception');
  if (!data.emmaFolio) {
    return (
      <EmptyState
        title={t('noFolio')}
        description={canSync ? t('syncFolio') : t('noFolio')}
      />
    );
  }
  return (
    <EmmaFolioSections
      emmaFolio={data.emmaFolio}
      canMove={canMove}
      moving={movingCharge}
      onMoveCharge={onMoveCharge}
    />
  );
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
  onMoveCharge,
  movingCharge,
}: {
  data: ReservationDetail;
  activeTab: ReservationDetailTab;
  onTabChange: (tab: ReservationDetailTab) => void;
  canSync: boolean;
  onMoveCharge?: (
    sourceFolioId: string,
    chargeRowId: string,
    destinationFolioId: string,
  ) => Promise<void>;
  movingCharge?: boolean;
}) {
  const t = useTranslations('reception');
  const tabLabels: Record<ReservationDetailTab, string> = {
    overview: t('tabOverview'),
    folio: t('tabFolio'),
    emma: t('tabEmma'),
    guests: t('tabGuests'),
  };

  return (
    <div>
      <div className="flex gap-1 overflow-x-auto border-b border-sidebar-border/60">
        {TAB_IDS.map((tabId) => (
          <button
            key={tabId}
            type="button"
            onClick={() => onTabChange(tabId)}
            className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
              activeTab === tabId
                ? 'border-white text-white'
                : 'border-transparent text-sidebar-muted hover:text-white'
            }`}
          >
            {tabLabels[tabId]}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {activeTab === 'overview' && <OverviewTab data={data} />}
        {activeTab === 'folio' && (
          <FolioTab
            data={data}
            canSync={canSync}
            canMove={canSync}
            movingCharge={movingCharge}
            onMoveCharge={onMoveCharge}
          />
        )}
        {activeTab === 'emma' && <EmmaTab data={data} canSync={canSync} />}
        {activeTab === 'guests' && <GuestsTab data={data} />}
      </div>
    </div>
  );
}

export function formatOpenTotal(data: ReservationDetail): string {
  const currency = data.emmaFolio?.reservation?.Currency ?? null;
  if (data.emmaFolio?.reservation) {
    const r = data.emmaFolio.reservation;
    const due = r.TotalAmountDueFolios ?? r.TotalAmountFolios;
    if (due != null) {
      return formatEmmaAmount(due, String(currency ?? '')) ?? String(due);
    }
  }
  return formatEmmaAmount(data.balance, String(currency ?? '')) ?? data.balance ?? '—';
}
