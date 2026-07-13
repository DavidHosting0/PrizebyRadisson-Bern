import type {
  ArrivalCheckScenario,
  ArrivalCheckSource,
  ReservationEmmaDetailBundle,
  ReservationEmmaFolioBundle,
} from '@housekeeping/shared';
import {
  involvesArrivalCheckForbiddenFolio,
  isArrivalCheckForbiddenFolio,
  isArrivalCheckPrepaymentCharge,
  isArrivalCheckRoomBoardConcept,
  isArrivalCheckTaxCharge,
  normalizeFolioId,
} from '@housekeeping/shared';
import type { ReservationSensitivePayload } from '../reservations/reservation-sensitive';
import { findCompanyFolioId, type FolioChargeMovePlan } from './arrival-check-charge-assign';
import { isVccCard, type EmmaCreditCardRow } from './arrival-check-vcc';

export type ArrivalCheckDecision = {
  source: ArrivalCheckSource;
  scenario: ArrivalCheckScenario;
  moves: FolioChargeMovePlan[];
  requiresManual: boolean;
  manualReason: string | null;
  /** Whether a VCC was detected (used for status messaging). */
  vcc: boolean;
};

const GUEST_FOLIO_ID = '01';

const RADISSON_DIRECT_RX =
  /desktopmedia|loyalty\s*guest|search\s*engine\s*optimisation|\bseo\b|bigmouthmedia|rezidor|direct\s*guest|radisson/i;

/** Client name e.g. "APPSMEDIA - IOS" (Radisson app bookings). */
const APPSMEDIA_IOS_RX = /appsmedia\s*-\s*ios/i;

function sourceText(sensitive: ReservationSensitivePayload | null): string {
  if (!sensitive) return '';
  return [
    sensitive.mainClientName,
    sensitive.companyName,
    sensitive.travelAgent,
    sensitive.sourceCode,
    sensitive.marketCode,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/** Detect the booking source / client group from the reservation's client fields. */
export function detectSource(sensitive: ReservationSensitivePayload | null): ArrivalCheckSource {
  const text = sourceText(sensitive);
  if (!text) return 'OTHER';
  if (/booking/.test(text)) return 'BOOKING';
  if (/expedia/.test(text)) return 'EXPEDIA';
  if (/agoda|priceline/.test(text)) return 'AGODA';
  if (/ctrip/.test(text)) return 'CTRIP';
  if (APPSMEDIA_IOS_RX.test(text)) return 'APPSMEDIA_IOS';
  if (RADISSON_DIRECT_RX.test(text)) return 'RADISSON';
  return 'OTHER';
}

/** Virtual credit card present: EMMA IsVCC flag (primary) or holder-name keyword (fallback). */
export function hasVcc(detail: ReservationEmmaDetailBundle | null): boolean {
  const cards = (detail?.creditCards ?? []) as EmmaCreditCardRow[];
  return cards.some((card) => isVccCard(card));
}

function rateText(
  sensitive: ReservationSensitivePayload | null,
  detail: ReservationEmmaDetailBundle | null,
): string {
  const parts: string[] = [];
  if (sensitive?.rateCode) parts.push(sensitive.rateCode);
  const res = detail?.reservation;
  if (res) {
    for (const key of ['Rate', 'RateDescription', 'RateDesc', 'PriceCode', 'PriceCodeDesc']) {
      const v = res[key];
      if (v != null && v !== '') parts.push(String(v));
    }
  }
  return parts.join(' ').toLowerCase();
}

/** Rate is a prepaid rate (e.g. "Prepaid - Level 01 IO"). */
export function isPrepaid(
  sensitive: ReservationSensitivePayload | null,
  detail: ReservationEmmaDetailBundle | null,
): boolean {
  return /prepaid/.test(rateText(sensitive, detail));
}

function chargeRowId(charge: ReservationEmmaFolioBundle['charges'][number]): string {
  return String(charge.position ?? charge.id).trim();
}

/** VCC: room/board Folio 1 → company folio; city/hotel tax → Folio 1. Folio 3 is never touched. */
function planVccMoves(
  bundle: ReservationEmmaFolioBundle,
  companyFolioId: string,
): FolioChargeMovePlan[] {
  if (isArrivalCheckForbiddenFolio(companyFolioId)) return [];
  const moves: FolioChargeMovePlan[] = [];

  for (const charge of bundle.charges ?? []) {
    if (normalizeFolioId(charge.folioId) !== GUEST_FOLIO_ID) continue;
    if (isArrivalCheckPrepaymentCharge(charge)) continue;
    if (!isArrivalCheckRoomBoardConcept(charge.concept)) continue;
    const rowId = chargeRowId(charge);
    if (!rowId) continue;
    if (involvesArrivalCheckForbiddenFolio(GUEST_FOLIO_ID, companyFolioId)) continue;
    moves.push({
      chargeRowId: rowId,
      sourceFolioId: GUEST_FOLIO_ID,
      destinationFolioId: companyFolioId,
      concept: charge.concept,
      description: charge.description,
      amount: charge.amount,
    });
  }

  for (const charge of bundle.charges ?? []) {
    if (isArrivalCheckPrepaymentCharge(charge)) continue;
    if (!isArrivalCheckTaxCharge(charge)) continue;
    const src = normalizeFolioId(charge.folioId);
    if (!src || src === GUEST_FOLIO_ID) continue;
    // Never pull tax (or any charge) off Folio 3.
    if (isArrivalCheckForbiddenFolio(src)) continue;
    const rowId = chargeRowId(charge);
    if (!rowId) continue;
    if (involvesArrivalCheckForbiddenFolio(src, GUEST_FOLIO_ID)) continue;
    moves.push({
      chargeRowId: rowId,
      sourceFolioId: src,
      destinationFolioId: GUEST_FOLIO_ID,
      concept: charge.concept,
      description: charge.description,
      amount: charge.amount,
    });
  }

  return moves;
}

/** Consolidate: move every non-prepayment charge onto the target folio. Folio 3 is never touched. */
function planConsolidateToFolio(
  bundle: ReservationEmmaFolioBundle,
  destinationFolioId: string,
): FolioChargeMovePlan[] {
  const dest = normalizeFolioId(destinationFolioId);
  if (!dest || isArrivalCheckForbiddenFolio(dest)) return [];
  const moves: FolioChargeMovePlan[] = [];
  for (const charge of bundle.charges ?? []) {
    const src = normalizeFolioId(charge.folioId);
    if (!src || src === dest) continue;
    if (isArrivalCheckForbiddenFolio(src)) continue;
    if (isArrivalCheckPrepaymentCharge(charge)) continue;
    const rowId = chargeRowId(charge);
    if (!rowId) continue;
    if (involvesArrivalCheckForbiddenFolio(src, dest)) continue;
    moves.push({
      chargeRowId: rowId,
      sourceFolioId: src,
      destinationFolioId: dest,
      concept: charge.concept,
      description: charge.description,
      amount: charge.amount,
    });
  }
  return moves;
}

/** Consolidate: move every charge that is not on the guest folio 01 onto folio 01. */
function planConsolidateToGuestFolio(bundle: ReservationEmmaFolioBundle): FolioChargeMovePlan[] {
  return planConsolidateToFolio(bundle, GUEST_FOLIO_ID);
}

function sortMoves(moves: FolioChargeMovePlan[]): FolioChargeMovePlan[] {
  return [...moves].sort((a, b) =>
    a.chargeRowId.localeCompare(b.chargeRowId, undefined, { numeric: true }),
  );
}

/** All non-prepayment charges → company folio (Folio 2). Used by CTrip and App Media iOS. */
function buildConsolidateToCompanyFolioDecision(
  source: ArrivalCheckSource,
  folio: ReservationEmmaFolioBundle,
  vcc: boolean,
  opts: { chargeVccOnCompanyFolio: boolean; manualLabel: string },
): ArrivalCheckDecision {
  const companyFolioId = findCompanyFolioId(folio.folios ?? []);
  const scenario = opts.chargeVccOnCompanyFolio && vcc ? 'VCC' : 'DIRECT';
  if (!companyFolioId) {
    return {
      source,
      scenario,
      moves: [],
      requiresManual: true,
      manualReason: `${opts.manualLabel}: kein Firmen-Folio (Folio 2) vorhanden – manuelle Zuordnung nötig.`,
      vcc,
    };
  }
  return {
    source,
    scenario,
    moves: sortMoves(planConsolidateToFolio(folio, companyFolioId)),
    requiresManual: false,
    manualReason: null,
    vcc,
  };
}

/**
 * Classify a reservation and build the charge-move plan according to the
 * arrival-check folio routing rules. VCC takes precedence over prepaid.
 */
export function buildArrivalCheckDecision(input: {
  sensitive: ReservationSensitivePayload | null;
  detail: ReservationEmmaDetailBundle | null;
  folio: ReservationEmmaFolioBundle;
}): ArrivalCheckDecision {
  const { sensitive, detail, folio } = input;
  const source = detectSource(sensitive);
  const vcc = hasVcc(detail);

  if (source === 'CTRIP') {
    return buildConsolidateToCompanyFolioDecision(source, folio, vcc, {
      chargeVccOnCompanyFolio: true,
      manualLabel: 'CTrip',
    });
  }

  if (source === 'APPSMEDIA_IOS') {
    return buildConsolidateToCompanyFolioDecision(source, folio, vcc, {
      chargeVccOnCompanyFolio: false,
      manualLabel: 'App Media iOS',
    });
  }

  if (source === 'RADISSON') {
    return {
      source,
      scenario: 'DIRECT',
      moves: sortMoves(planConsolidateToGuestFolio(folio)),
      requiresManual: false,
      manualReason: null,
      vcc,
    };
  }

  if (source === 'BOOKING' || source === 'EXPEDIA' || source === 'AGODA') {
    if (vcc) {
      const companyFolioId = findCompanyFolioId(folio.folios ?? []);
      if (!companyFolioId) {
        return {
          source,
          scenario: 'VCC',
          moves: [],
          requiresManual: true,
          manualReason:
            'VCC erkannt, aber kein Firmen-Folio (Folio 2) vorhanden – manuelle Zuordnung nötig.',
          vcc,
        };
      }
      return {
        source,
        scenario: 'VCC',
        moves: sortMoves(planVccMoves(folio, companyFolioId)),
        requiresManual: false,
        manualReason: null,
        vcc,
      };
    }
    if (isPrepaid(sensitive, detail)) {
      return {
        source,
        scenario: 'PREPAID',
        moves: sortMoves(planConsolidateToGuestFolio(folio)),
        requiresManual: false,
        manualReason: null,
        vcc,
      };
    }
    return {
      source,
      scenario: 'FLEXIBLE',
      moves: [],
      requiresManual: false,
      manualReason: null,
      vcc,
    };
  }

  return {
    source,
    scenario: 'MANUAL',
    moves: [],
    requiresManual: true,
    manualReason: 'Unbekannte Buchungsquelle – keine automatische Regel, manuelle Zuordnung nötig.',
    vcc,
  };
}
