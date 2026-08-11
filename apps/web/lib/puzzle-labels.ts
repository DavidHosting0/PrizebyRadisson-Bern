import { useMemo } from 'react';
import { useTranslations } from 'next-intl';

export type PuzzelTicketPrizeCategory =
  | 'SPAM'
  | 'RECHNUNG_ANGEFRAGT'
  | 'RECHNUNGSKORREKTUR'
  | 'MEHRERE_RECHNUNGSANFRAGEN'
  | 'SONSTIGES';

export type PuzzelTicketAnalysisRequestType =
  | 'invoice_correction'
  | 'invoice_resend'
  | 'invoice_other'
  | 'unknown';

export type PuzzelTicketUrgency = 'critical' | 'high' | 'normal' | 'low';

export type PuzzelInvoiceAction =
  | 'resend_only'
  | 'correct_and_reissue'
  | 'new_or_additional_invoice'
  | 'vat_tax_legal'
  | 'payment_refund'
  | 'invoice_question'
  | 'other_billing'
  | 'unclear';

export type CompanyBillingOnInvoiceIntent = 'yes' | 'no' | 'unclear' | 'not_mentioned';

export type CompanyBillingFieldKey =
  | 'companyName'
  | 'street'
  | 'houseNumber'
  | 'postalCode'
  | 'city'
  | 'country'
  | 'vatNumber';

/** Label maps for Puzzle ticket UI — API enum keys unchanged. */
export function usePuzzleLabels() {
  const t = useTranslations('puzzle');

  return useMemo(
    () => ({
      prizeCategory: (key: PuzzelTicketPrizeCategory) => t(`category.${key}`),
      invoiceAction: (key: PuzzelInvoiceAction) => t(`invoiceAction.${key}`),
      requestType: (key: PuzzelTicketAnalysisRequestType) => t(`requestType.${key}`),
      confidence: (key: 'high' | 'medium' | 'low') => t(`confidence.${key}`),
      urgency: (key: PuzzelTicketUrgency) => t(`urgency.${key}`),
      companyBillingIntent: (key: CompanyBillingOnInvoiceIntent) => t(`companyBillingIntent.${key}`),
      companyBillingField: (key: CompanyBillingFieldKey) => t(`companyBillingField.${key}`),
      analysisField: (
        key:
          | 'invoiceRequest'
          | 'guestName'
          | 'reservationNumber'
          | 'checkInDate'
          | 'checkOutDate'
          | 'bookingPlatform'
          | 'issueType'
          | 'urgency'
          | 'invoiceNumber'
          | 'room'
          | 'puzzelCategory'
          | 'requestType'
          | 'extractionConfidence',
      ) => t(`analysisField.${key}`),
      missingField: t('missingField'),
      prizeCategoryLabel: {
        SPAM: t('category.SPAM'),
        RECHNUNG_ANGEFRAGT: t('category.RECHNUNG_ANGEFRAGT'),
        RECHNUNGSKORREKTUR: t('category.RECHNUNGSKORREKTUR'),
        MEHRERE_RECHNUNGSANFRAGEN: t('category.MEHRERE_RECHNUNGSANFRAGEN'),
        SONSTIGES: t('category.SONSTIGES'),
      } satisfies Record<PuzzelTicketPrizeCategory, string>,
      invoiceActionLabel: {
        resend_only: t('invoiceAction.resend_only'),
        correct_and_reissue: t('invoiceAction.correct_and_reissue'),
        new_or_additional_invoice: t('invoiceAction.new_or_additional_invoice'),
        vat_tax_legal: t('invoiceAction.vat_tax_legal'),
        payment_refund: t('invoiceAction.payment_refund'),
        invoice_question: t('invoiceAction.invoice_question'),
        other_billing: t('invoiceAction.other_billing'),
        unclear: t('invoiceAction.unclear'),
      } satisfies Record<PuzzelInvoiceAction, string>,
      requestTypeLabel: {
        invoice_correction: t('requestType.invoice_correction'),
        invoice_resend: t('requestType.invoice_resend'),
        invoice_other: t('requestType.invoice_other'),
        unknown: t('requestType.unknown'),
      } satisfies Record<PuzzelTicketAnalysisRequestType, string>,
      confidenceLabel: {
        high: t('confidence.high'),
        medium: t('confidence.medium'),
        low: t('confidence.low'),
      },
      urgencyLabel: {
        critical: t('urgency.critical'),
        high: t('urgency.high'),
        normal: t('urgency.normal'),
        low: t('urgency.low'),
      },
      companyBillingIntentLabel: {
        yes: t('companyBillingIntent.yes'),
        no: t('companyBillingIntent.no'),
        unclear: t('companyBillingIntent.unclear'),
        not_mentioned: t('companyBillingIntent.not_mentioned'),
      } satisfies Record<CompanyBillingOnInvoiceIntent, string>,
      companyBillingFieldLabel: {
        companyName: t('companyBillingField.companyName'),
        street: t('companyBillingField.street'),
        houseNumber: t('companyBillingField.houseNumber'),
        postalCode: t('companyBillingField.postalCode'),
        city: t('companyBillingField.city'),
        country: t('companyBillingField.country'),
        vatNumber: t('companyBillingField.vatNumber'),
      } satisfies Record<CompanyBillingFieldKey, string>,
    }),
    [t],
  );
}
