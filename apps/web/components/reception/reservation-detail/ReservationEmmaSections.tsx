import type { ReservationDetail } from '@housekeeping/shared';
import {
  Field,
  formatEmmaValue,
  ListSection,
  RecordGrid,
  Section,
} from './ReservationDetailFields';

export function EmmaDetailSections({
  emmaDetail,
}: {
  emmaDetail: NonNullable<ReservationDetail['emmaDetail']>;
}) {
  const r = emmaDetail.reservation;
  return (
    <div className="space-y-4">
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
    </div>
  );
}
