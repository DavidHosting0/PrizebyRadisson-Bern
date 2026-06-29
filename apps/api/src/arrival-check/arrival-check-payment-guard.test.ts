import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ReservationEmmaFolioBundle } from '@housekeeping/shared';
import {
  amountsMatch,
  assertPaymentContextSafe,
  canReuseInvoice,
  computeExpectedVccChargeAmount,
  crossCheckFolioAmount,
  filterCreditCardsForReservation,
} from './arrival-check-payment-guard';
import type { ArrivalCheckDecision } from './arrival-check-rules';
import type { EmmaCreditCardRow } from './arrival-check-vcc';

function otaVccDecision(): ArrivalCheckDecision {
  return {
    source: 'BOOKING',
    scenario: 'VCC',
    moves: [],
    requiresManual: false,
    manualReason: null,
    vcc: true,
  };
}

function ctripDecision(): ArrivalCheckDecision {
  return {
    source: 'CTRIP',
    scenario: 'VCC',
    moves: [],
    requiresManual: false,
    manualReason: null,
    vcc: true,
  };
}

function folioWithCharges(
  charges: ReservationEmmaFolioBundle['charges'],
  folios: ReservationEmmaFolioBundle['folios'] = [],
): ReservationEmmaFolioBundle {
  return {
    reservation: {},
    folios,
    charges,
    chargesByFolio: {
      '01': charges.filter((c) => c.folioId === '01'),
      '02': charges.filter((c) => c.folioId === '02'),
    },
    fetchedAt: new Date().toISOString(),
  };
}

describe('amountsMatch', () => {
  it('accepts equal amounts within tolerance', () => {
    assert.equal(amountsMatch('120.50', 120.5), true);
    assert.equal(amountsMatch('120.50', '120.51'), true);
  });

  it('rejects large differences', () => {
    assert.equal(amountsMatch('120.50', '130.00'), false);
  });
});

function charge(
  partial: Partial<ReservationEmmaFolioBundle['charges'][number]> &
    Pick<ReservationEmmaFolioBundle['charges'][number], 'id' | 'folioId' | 'amount'>,
): ReservationEmmaFolioBundle['charges'][number] {
  return {
    position: null,
    concept: null,
    conceptNature: null,
    description: null,
    guestName: null,
    productionDate: null,
    chargeType: null,
    status: null,
    quantity: null,
    price: null,
    priceWithTax: null,
    taxAmount: null,
    currency: 'CHF',
    ...partial,
  };
}

describe('computeExpectedVccChargeAmount', () => {
  it('sums RO/BB on OTA company folio only', () => {
    const folio = folioWithCharges([
      charge({ id: '1', folioId: '02', concept: 'RO', amount: '100.00' }),
      charge({ id: '2', folioId: '02', concept: 'BB', amount: '20.00' }),
      charge({ id: '3', folioId: '02', concept: 'CTAX', amount: '5.00' }),
      charge({
        id: '4',
        folioId: '02',
        concept: 'PPWO',
        amount: '-50.00',
        description: 'Pre-payment',
      }),
    ]);
    const result = computeExpectedVccChargeAmount(otaVccDecision(), folio, '02');
    assert.deepEqual(result, { amount: 120, currency: 'CHF' });
  });

  it('sums all non-prepayment charges on CTrip folio 02', () => {
    const folio = folioWithCharges([
      charge({ id: '1', folioId: '02', concept: 'RO', amount: '80.00' }),
      charge({ id: '2', folioId: '02', concept: 'CTAX', amount: '4.50' }),
      charge({
        id: '3',
        folioId: '02',
        concept: 'PPWO',
        amount: '-10.00',
        description: 'Anzahlung',
      }),
    ]);
    const result = computeExpectedVccChargeAmount(ctripDecision(), folio, '02');
    assert.deepEqual(result, { amount: 84.5, currency: 'CHF' });
  });
});

describe('filterCreditCardsForReservation', () => {
  it('keeps only cards with matching ReservaId', () => {
    const cards: EmmaCreditCardRow[] = [
      { ReservaId: '0161111111', Token: '111', IsVCC: true },
      { ReservaId: '0162222222', Token: '222', IsVCC: true },
    ];
    const filtered = filterCreditCardsForReservation(cards, '0161111111');
    assert.equal(filtered.length, 1);
    assert.equal(String(filtered[0].Token), '111');
  });
});

describe('assertPaymentContextSafe', () => {
  it('rejects card without ReservaId (no fallback allowed)', () => {
    const result = assertPaymentContextSafe({
      reservationId: '0161111111',
      folioId: '02',
      expectedAmount: '120.00',
      card: { token: 'tok', mask: null, reservaId: null },
      invoice: { ReservationId: '0161111111', FolioId: '02', TotalPay: '120.00' },
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.reason, /ReservaId/);
    }
  });

  it('rejects card from another reservation', () => {
    const result = assertPaymentContextSafe({
      reservationId: '0161111111',
      folioId: '02',
      expectedAmount: '120.00',
      card: { token: 'tok', mask: null, reservaId: '0162222222' },
      invoice: { ReservationId: '0161111111', FolioId: '02', TotalPay: '120.00' },
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.reason, /0162222222/);
    }
  });

  it('rejects invoice from another reservation', () => {
    const result = assertPaymentContextSafe({
      reservationId: '0161111111',
      folioId: '02',
      expectedAmount: '120.00',
      card: { token: 'tok', mask: '****1111', reservaId: '0161111111' },
      invoice: { ReservationId: '0169999999', FolioId: '02', TotalPay: '120.00' },
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.reason, /0169999999/);
    }
  });

  it('rejects invoice amount mismatch', () => {
    const result = assertPaymentContextSafe({
      reservationId: '0161111111',
      folioId: '02',
      expectedAmount: '120.00',
      card: { token: 'tok', mask: null, reservaId: '0161111111' },
      invoice: { ReservationId: '0161111111', FolioId: '02', TotalPay: '99.00' },
    });
    assert.equal(result.ok, false);
  });

  it('rejects zero or missing expected amount', () => {
    const result = assertPaymentContextSafe({
      reservationId: '0161111111',
      folioId: '02',
      expectedAmount: '0.00',
      card: { token: 'tok', mask: null, reservaId: '0161111111' },
      invoice: { ReservationId: '0161111111', FolioId: '02', TotalPay: '0.00' },
    });
    assert.equal(result.ok, false);
  });

  it('accepts matching context', () => {
    const result = assertPaymentContextSafe({
      reservationId: '0161111111',
      folioId: '02',
      expectedAmount: '120.00',
      card: { token: 'tok', mask: null, reservaId: '0161111111' },
      invoice: { ReservationId: '0161111111', FolioId: '02', TotalPay: '120.00' },
    });
    assert.equal(result.ok, true);
  });
});

describe('crossCheckFolioAmount', () => {
  it('accepts when AmountDue matches the planned charge exactly', () => {
    const folio = folioWithCharges(
      [charge({ id: '1', folioId: '02', concept: 'RO', amount: '120.00' })],
      [{ Id: '02', AmountTotal: 120.0, AmountPaid: 0, AmountDue: 120.0 }],
    );
    const result = crossCheckFolioAmount(folio, '02', '120.00');
    assert.equal(result.ok, true);
  });

  it('blocks when EMMA AmountDue diverges from the planned charge', () => {
    const folio = folioWithCharges(
      [charge({ id: '1', folioId: '02', concept: 'RO', amount: '120.00' })],
      [{ Id: '02', AmountTotal: 240.0, AmountPaid: 0, AmountDue: 240.0 }],
    );
    const result = crossCheckFolioAmount(folio, '02', '120.00');
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.reason, /weicht.*ab/);
  });

  it('blocks when the folio already shows AmountPaid (double-charge guard)', () => {
    const folio = folioWithCharges(
      [charge({ id: '1', folioId: '02', concept: 'RO', amount: '120.00' })],
      [{ Id: '02', AmountTotal: 120.0, AmountPaid: 120.0, AmountDue: 0 }],
    );
    const result = crossCheckFolioAmount(folio, '02', '120.00');
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.reason, /AmountPaid/);
  });

  it('blocks when the folio entity does not expose AmountDue', () => {
    const folio = folioWithCharges(
      [charge({ id: '1', folioId: '02', concept: 'RO', amount: '120.00' })],
      [{ Id: '02' }],
    );
    const result = crossCheckFolioAmount(folio, '02', '120.00');
    assert.equal(result.ok, false);
  });
});

describe('canReuseInvoice', () => {
  it('allows reuse when reservation, folio and amount match', () => {
    assert.equal(
      canReuseInvoice(
        {
          ReservationId: '0161111111',
          FolioId: '02',
          Status: 'Open',
          TotalPay: '120.00',
          TotalPaid: '0',
        },
        { reservationId: '0161111111', folioId: '02', expectedAmount: '120.00' },
      ),
      true,
    );
  });

  it('rejects reuse when amount differs', () => {
    assert.equal(
      canReuseInvoice(
        {
          ReservationId: '0161111111',
          FolioId: '02',
          Status: 'Open',
          TotalPay: '99.00',
          TotalPaid: '0',
        },
        { reservationId: '0161111111', folioId: '02', expectedAmount: '120.00' },
      ),
      false,
    );
  });
});
