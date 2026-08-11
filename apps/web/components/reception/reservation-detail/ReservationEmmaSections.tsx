'use client';

import type { ReservationDetail } from '@housekeeping/shared';
import { useTranslations } from 'next-intl';
import {
  Field,
  ListSection,
  RecordGrid,
  Section,
  useEmmaValueFormatter,
} from './ReservationDetailFields';

export function EmmaDetailSections({
  emmaDetail,
}: {
  emmaDetail: NonNullable<ReservationDetail['emmaDetail']>;
}) {
  const t = useTranslations('reception.reservationDetail');
  const formatEmmaValue = useEmmaValueFormatter();
  const r = emmaDetail.reservation;
  return (
    <div className="space-y-4">
      <Section title={t('emmaReservationFull')}>
        <Field label={t('status')} value={formatEmmaValue(r.StatusDesc ?? r.Status)} />
        <Field label={t('rate')} value={formatEmmaValue(r.RateDesc ?? r.Rate)} />
        <Field label={t('contact')} value={formatEmmaValue(r.ContactPerson)} />
        <Field label={t('phone')} value={formatEmmaValue(r.ContactPhone)} />
        <Field label={t('email')} value={formatEmmaValue(r.Email)} />
        <Field label={t('country')} value={formatEmmaValue(r.Country)} />
        <Field label={t('currency')} value={formatEmmaValue(r.Currency)} />
        <Field label={t('guarantee')} value={formatEmmaValue(r.Guarantee)} />
        <Field label={t('channel')} value={formatEmmaValue(r.ChannelId)} />
        <Field label={t('subchannel')} value={formatEmmaValue(r.SubchannelId)} />
        <Field label={t('externalReference')} value={formatEmmaValue(r.ExternalReference)} />
        <Field label={t('voucher')} value={formatEmmaValue(r.Voucher)} />
        <Field
          label={t('cancelPolicy')}
          value={formatEmmaValue(r.CancelPolicyDesc ?? r.CancellationPolicy)}
        />
        <Field label={t('tmsRemark')} value={formatEmmaValue(r.TMS4CRemark)} />
        <Field label={t('roomTypeDesc')} value={formatEmmaValue(r.RoomTypeDesc)} />
        <Field
          label={t('totalFolio')}
          value={formatEmmaValue(r.TotalAmountDueFolios ?? r.TotalAmountFolios)}
        />
      </Section>

      {emmaDetail.guests.length > 0 && (
        <ListSection title={t('guestsCount', { count: emmaDetail.guests.length })}>
          <RecordGrid rows={emmaDetail.guests} />
        </ListSection>
      )}

      {emmaDetail.creditCards.length > 0 && (
        <ListSection title={t('creditCardsCount', { count: emmaDetail.creditCards.length })}>
          <RecordGrid rows={emmaDetail.creditCards} />
        </ListSection>
      )}

      {emmaDetail.preauthorizations.length > 0 && (
        <ListSection title={t('preAuthCount', { count: emmaDetail.preauthorizations.length })}>
          <RecordGrid rows={emmaDetail.preauthorizations} />
        </ListSection>
      )}

      {emmaDetail.roomList.length > 0 && (
        <ListSection title={t('roomListCount', { count: emmaDetail.roomList.length })}>
          <RecordGrid rows={emmaDetail.roomList} />
        </ListSection>
      )}

      {emmaDetail.loyaltyBenefits.length > 0 && (
        <ListSection title={t('loyaltyBenefitsCount', { count: emmaDetail.loyaltyBenefits.length })}>
          <RecordGrid rows={emmaDetail.loyaltyBenefits} />
        </ListSection>
      )}

      {emmaDetail.policeRecords.length > 0 && (
        <ListSection title={t('policeRecordsCount', { count: emmaDetail.policeRecords.length })}>
          <RecordGrid rows={emmaDetail.policeRecords} />
        </ListSection>
      )}
    </div>
  );
}
