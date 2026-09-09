import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ReservationEmmaFolioBundle } from '@housekeeping/shared';
import type { ReservationSensitivePayload } from '../reservations/reservation-sensitive';
import { buildArrivalCheckDecision, detectSource } from './arrival-check-rules';
import { computeExpectedVccChargeAmount } from './arrival-check-payment-guard';
import { planVccPayment } from './arrival-check-vcc';

function charge(
  partial: Partial<ReservationEmmaFolioBundle['charges'][number]> & {
    id: string;
    folioId: string;
    concept: string;
  },
): ReservationEmmaFolioBundle['charges'][number] {
  return {
    description: null,
    amount: '10.00',
    date: null,
    quantity: null,
    unitPrice: null,
    currency: 'CHF',
    statusCharge: null,
    conceptNature: null,
    position: partial.id,
    ...partial,
  };
}

function folioBundle(opts: {
  folios: { Id: string; NameHolder?: string }[];
  charges: ReservationEmmaFolioBundle['charges'];
}): ReservationEmmaFolioBundle {
  return {
    fetchedAt: '2026-07-14T00:00:00.000Z',
    reservation: {},
    folios: opts.folios,
    charges: opts.charges,
    amount: null,
    mainCustomer: null,
    mainGuest: null,
    loanedItems: [],
    notices: [],
    messages: [],
    remarks: null,
    depositConcepts: [],
  };
}

function sensitive(partial: Partial<ReservationSensitivePayload>): ReservationSensitivePayload {
  return {
    mainGuestName: 'Test',
    mainGuestId: null,
    mainClientName: null,
    cardHolder: null,
    creditCard: null,
    cardExpiry: null,
    preAuthAmount: null,
    vipDesc: null,
    groupName: null,
    groupId: null,
    bookingFileId: null,
    companyName: null,
    travelAgent: null,
    rateCode: null,
    sourceCode: null,
    marketCode: null,
    balance: null,
    comments: null,
    draftStatus: null,
    draftLockedBy: null,
    stays: null,
    guests: null,
    ciStatusSigned: false,
    stayover: false,
    noMove: false,
    originalRoomType: null,
    roomTypeUpg: null,
    numPax2: null,
    numPax3: null,
    numPax4: null,
    checkInQDate: null,
    expectedDepartureTime: null,
    emmaStatus: null,
    ocoDone: false,
    ...partial,
  };
}

const companyFolio = folioBundle({
  folios: [
    { Id: '01', NameHolder: 'Guest' },
    { Id: '02', NameHolder: 'Company' },
  ],
  charges: [
    charge({ id: '1', folioId: '01', concept: 'RO', amount: '100' }),
    charge({ id: '2', folioId: '01', concept: 'CTAX', amount: '5', description: 'City Tax' }),
  ],
});

describe('BCD / ATG / Trivago arrival-check rules', () => {
  it('detects BCD TRAVEL and ATG TRAVEL DEUTSCHLAND GMBH', () => {
    assert.equal(detectSource(sensitive({ mainClientName: 'BCD TRAVEL' })), 'BCD_TRAVEL');
    assert.equal(
      detectSource(sensitive({ mainClientName: 'ATG TRAVEL DEUTSCHLAND GMBH' })),
      'ATG_TRAVEL',
    );
    assert.equal(
      detectSource(sensitive({ mainClientName: 'TRIVAGO - META SEARCH ADS' })),
      'TRIVAGO',
    );
    assert.equal(detectSource(sensitive({ mainClientName: 'DAYUSE SAS' })), 'DAYUSE');
    assert.equal(detectSource(sensitive({ mainClientName: 'DIRECT GUEST' })), 'DIRECT_GUEST');
  });

  it('leaves BCD TRAVEL unchanged and marks done', () => {
    const decision = buildArrivalCheckDecision({
      sensitive: sensitive({ mainClientName: 'BCD TRAVEL' }),
      detail: null,
      folio: companyFolio,
    });
    assert.equal(decision.source, 'BCD_TRAVEL');
    assert.equal(decision.scenario, 'FLEXIBLE');
    assert.equal(decision.requiresManual, false);
    assert.equal(decision.moves.length, 0);
  });

  it('leaves DAYUSE SAS and DIRECT GUEST unchanged', () => {
    for (const client of ['DAYUSE SAS', 'DIRECT GUEST'] as const) {
      const decision = buildArrivalCheckDecision({
        sensitive: sensitive({ mainClientName: client }),
        detail: null,
        folio: companyFolio,
      });
      assert.equal(decision.scenario, 'FLEXIBLE');
      assert.equal(decision.requiresManual, false);
      assert.equal(decision.moves.length, 0);
    }
  });

  it('does not treat DIRECT GUEST as Radisson consolidate-to-Folio-1', () => {
    const decision = buildArrivalCheckDecision({
      sensitive: sensitive({ mainClientName: 'DIRECT GUEST' }),
      detail: null,
      folio: companyFolio,
    });
    assert.equal(decision.source, 'DIRECT_GUEST');
    assert.equal(decision.scenario, 'FLEXIBLE');
    assert.equal(decision.moves.length, 0);
  });

  it('leaves ATG TRAVEL unchanged even when Folio 3 has charges', () => {
    const folio = folioBundle({
      folios: [
        { Id: '01', NameHolder: 'Guest' },
        { Id: '03', NameHolder: 'Third' },
      ],
      charges: [charge({ id: '1', folioId: '03', concept: 'RO', amount: '40' })],
    });
    const decision = buildArrivalCheckDecision({
      sensitive: sensitive({ mainClientName: 'ATG TRAVEL DEUTSCHLAND GMBH' }),
      detail: null,
      folio,
    });
    assert.equal(decision.source, 'ATG_TRAVEL');
    assert.equal(decision.scenario, 'FLEXIBLE');
    assert.equal(decision.requiresManual, false);
    assert.equal(decision.moves.length, 0);
  });

  it('Trivago prepaid consolidates all charges to Folio 2 when VCC is present', () => {
    const decision = buildArrivalCheckDecision({
      sensitive: sensitive({
        mainClientName: 'TRIVAGO - META SEARCH ADS',
        rateCode: 'Prepaid - Level 01 IO',
      }),
      detail: {
        fetchedAt: '2026-07-14T00:00:00.000Z',
        reservation: { RateDescription: 'Prepaid' },
        creditCards: [{ IsVCC: true, Token: 'tok', Holder: 'TRIVAGO VCC' }],
        guests: [],
        notices: [],
        documents: [],
        profiles: [],
      },
      folio: companyFolio,
    });
    assert.equal(decision.source, 'TRIVAGO');
    assert.equal(decision.scenario, 'PREPAID');
    assert.equal(decision.requiresManual, false);
    assert.ok(decision.moves.length >= 2);
    assert.ok(decision.moves.every((m) => m.destinationFolioId === '02'));
    assert.ok(decision.moves.every((m) => m.sourceFolioId !== '03'));
  });

  it('Trivago prepaid without VCC still consolidates to Folio 2 and completes', () => {
    const decision = buildArrivalCheckDecision({
      sensitive: sensitive({
        mainClientName: 'TRIVAGO - META SEARCH ADS',
        rateCode: 'Prepaid',
      }),
      detail: {
        fetchedAt: '2026-07-14T00:00:00.000Z',
        reservation: {},
        creditCards: [],
        guests: [],
        notices: [],
        documents: [],
        profiles: [],
      },
      folio: companyFolio,
    });
    assert.equal(decision.source, 'TRIVAGO');
    assert.equal(decision.scenario, 'PREPAID');
    assert.equal(decision.requiresManual, false);
    assert.ok(decision.moves.length >= 2);
    assert.ok(decision.moves.every((m) => m.destinationFolioId === '02'));
  });

  it('Trivago without prepaid consolidates to Folio 2 and completes', () => {
    const decision = buildArrivalCheckDecision({
      sensitive: sensitive({ mainClientName: 'TRIVAGO - META SEARCH ADS', rateCode: 'FLEX' }),
      detail: null,
      folio: companyFolio,
    });
    assert.equal(decision.source, 'TRIVAGO');
    assert.equal(decision.scenario, 'DIRECT');
    assert.equal(decision.requiresManual, false);
    assert.ok(decision.moves.length >= 2);
    assert.ok(decision.moves.every((m) => m.destinationFolioId === '02'));
  });

  it('plans VCC prepayment for full Folio 2 total on Trivago prepaid', () => {
    const afterMoves = folioBundle({
      folios: [
        { Id: '01', NameHolder: 'Guest' },
        { Id: '02', NameHolder: 'Company' },
      ],
      charges: [
        charge({ id: '1', folioId: '02', concept: 'RO', amount: '100' }),
        charge({ id: '2', folioId: '02', concept: 'CTAX', amount: '5', description: 'City Tax' }),
        charge({ id: '3', folioId: '02', concept: 'BB', amount: '20' }),
      ],
    });
    const decision = {
      source: 'TRIVAGO' as const,
      scenario: 'PREPAID' as const,
      moves: [],
      requiresManual: false,
      manualReason: null,
      vcc: true,
    };
    const expected = computeExpectedVccChargeAmount(decision, afterMoves, '02');
    assert.ok(expected);
    assert.equal(expected!.amount, 125);
    const plan = planVccPayment({ decision, detail: null, folio: afterMoves });
    assert.ok(plan);
    assert.equal(plan!.folioId, '02');
    assert.equal(plan!.amount, '125.00');
  });
});
