'use client';

import { useTranslations } from 'next-intl';
import type { ArrivalCheckRunItem } from '@housekeeping/shared';

export function useArrivalCheckLabels() {
  const t = useTranslations('reception.arrivalCheck');

  return {
    stepLabel(step: ArrivalCheckRunItem['currentStep']): string {
      switch (step) {
        case 'FOLIO_LOAD':
          return t('stepFolioLoad');
        case 'CHARGE_ASSIGN':
          return t('stepChargeAssign');
        case 'PREPAID_SETTLE':
          return t('stepPrepaidSettle');
        default:
          return t('stepPrep');
      }
    },
    itemStatusLabel(status: ArrivalCheckRunItem['status']): string {
      switch (status) {
        case 'PENDING':
          return t('statusPending');
        case 'IN_PROGRESS':
          return t('statusInProgress');
        case 'COMPLETED':
          return t('statusCompleted');
        case 'SKIPPED':
          return t('statusSkipped');
        case 'NEEDS_MANUAL':
          return t('statusManual');
        case 'FAILED':
          return t('statusFailed');
        default:
          return status;
      }
    },
    manualReasonFallback: t('manualReasonFallback'),
  };
}
