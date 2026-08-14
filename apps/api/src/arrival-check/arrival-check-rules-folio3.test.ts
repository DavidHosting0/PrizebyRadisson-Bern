import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ReservationEmmaFolioBundle } from '@housekeeping/shared';
import type { ReservationSensitivePayload } from '../reservations/reservation-sensitive';
import { findCompanyFolioId } from './arrival-check-charge-assign';
import { buildArrivalCheckDecision, detectSource } from './arrival-check-rules';

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
  folios: { Id: string; NameHolder?: string; AmountDue?: number | string }[];
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

describe('Folio 3 is never moved in arrival check', () => {
  it('findCompanyFolioId skips Folio 3 even when it is the only named non-guest folio', () => {
    const id = findCompanyFolioId([
      { Id: '01', NameHolder: 'Guest' },
      { Id: '03', NameHolder: 'Company GmbH' },
    ]);
    assert.equal(id, null);
  });

  it('findCompanyFolioId prefers Folio 2 over Folio 3', () => {
    const id = findCompanyFolioId([
      { Id: '01', NameHolder: 'Guest' },
      { Id: '02', NameHolder: 'Booking.com' },
      { Id: '03', NameHolder: 'Other' },
    ]);
    assert.equal(id, '02');
  });

  it('Radisson goes manual and plans no moves when Folio 3 has charges', () => {
    const folio = folioBundle({
      folios: [
        { Id: '01', NameHolder: 'Guest' },
        { Id: '03', NameHolder: 'Third' },
      ],
      charges: [
        charge({ id: '1', folioId: '01', concept: 'RO', amount: '100' }),
        charge({ id: '2', folioId: '03', concept: 'RO', amount: '50' }),
        charge({ id: '3', folioId: '03', concept: 'BB', amount: '20' }),
      ],
    });
    const decision = buildArrivalCheckDecision({
      sensitive: sensitive({ mainClientName: 'Radisson Direct Guest' }),
      detail: null,
      folio,
    });
    assert.equal(decision.requiresManual, true);
    assert.equal(decision.scenario, 'MANUAL');
    assert.equal(decision.moves.length, 0);
    assert.match(decision.manualReason ?? '', /Folio 3/);
  });

  it('VCC goes manual and plans no moves when tax sits on Folio 3', () => {
    const folio = folioBundle({
      folios: [
        { Id: '01', NameHolder: 'Guest' },
        { Id: '02', NameHolder: 'Booking.com' },
        { Id: '03', NameHolder: 'Extra' },
      ],
      charges: [
        charge({ id: '1', folioId: '01', concept: 'RO', amount: '100' }),
        charge({ id: '2', folioId: '03', concept: 'CTAX', amount: '5', description: 'City Tax' }),
        charge({ id: '3', folioId: '02', concept: 'CTAX', amount: '5', description: 'City Tax' }),
      ],
    });
    const decision = buildArrivalCheckDecision({
      sensitive: sensitive({ mainClientName: 'Booking.com' }),
      detail: {
        fetchedAt: '2026-07-14T00:00:00.000Z',
        reservation: {},
        creditCards: [{ IsVCC: true, Token: 'tok', Holder: 'BOOKINGCOM VCC' }],
        guests: [],
        notices: [],
        documents: [],
        profiles: [],
      },
      folio,
    });
    assert.equal(decision.requiresManual, true);
    assert.equal(decision.scenario, 'MANUAL');
    assert.equal(decision.moves.length, 0);
    assert.match(decision.manualReason ?? '', /Folio 3/);
  });

  it('CTrip consolidate never targets Folio 3', () => {
    const folio = folioBundle({
      folios: [
        { Id: '01', NameHolder: 'Guest' },
        { Id: '03', NameHolder: 'CTrip Agent' },
      ],
      charges: [charge({ id: '1', folioId: '01', concept: 'RO', amount: '100' })],
    });
    const decision = buildArrivalCheckDecision({
      sensitive: sensitive({ mainClientName: 'CTrip' }),
      detail: null,
      folio,
    });
    assert.equal(decision.requiresManual, true);
    assert.equal(decision.moves.length, 0);
  });
});

describe('detectSource', () => {
  it('treats APPSMEDIA - ANDROID ADS like REZIDOR BIGMOUTHMEDIA (Radisson / Folio 1)', () => {
    assert.equal(detectSource(sensitive({ mainClientName: 'APPSMEDIA - ANDROID ADS' })), 'RADISSON');
    assert.equal(detectSource(sensitive({ mainClientName: 'REZIDOR BIGMOUTHMEDIA' })), 'RADISSON');
  });

  it('keeps APPSMEDIA - IOS as its own source', () => {
    assert.equal(detectSource(sensitive({ mainClientName: 'APPSMEDIA - IOS' })), 'APPSMEDIA_IOS');
  });
});

describe('APPSMEDIA Android follows Radisson direct routing', () => {
  it('consolidates charges onto Folio 1 and does not charge VCC', () => {
    const folio = folioBundle({
      folios: [
        { Id: '01', NameHolder: 'Guest' },
        { Id: '02', NameHolder: 'Appsmedia' },
      ],
      charges: [charge({ id: '1', folioId: '02', concept: 'RO', amount: '180' })],
    });
    const decision = buildArrivalCheckDecision({
      sensitive: sensitive({ mainClientName: 'APPSMEDIA - ANDROID ADS' }),
      detail: {
        fetchedAt: '2026-07-14T00:00:00.000Z',
        reservation: {},
        creditCards: [{ IsVCC: true, Token: 'tok', Holder: 'VCC' }],
        guests: [],
        notices: [],
        documents: [],
        profiles: [],
      },
      folio,
    });
    assert.equal(decision.source, 'RADISSON');
    assert.equal(decision.scenario, 'DIRECT');
    assert.equal(decision.requiresManual, false);
    assert.equal(decision.moves.length, 1);
    assert.equal(decision.moves[0]?.destinationFolioId, '01');
  });
});

describe('Folio 3 activity blocks every client immediately', () => {
  it('does not treat an empty Folio 3 header as activity', () => {
    const folio = folioBundle({
      folios: [
        { Id: '01', NameHolder: 'Guest' },
        { Id: '02', NameHolder: 'Company' },
        { Id: '03', NameHolder: '' },
      ],
      charges: [charge({ id: '1', folioId: '02', concept: 'RO', amount: '80' })],
    });
    const decision = buildArrivalCheckDecision({
      sensitive: sensitive({ mainClientName: 'REZIDOR BIGMOUTHMEDIA' }),
      detail: null,
      folio,
    });
    assert.equal(decision.requiresManual, false);
    assert.equal(decision.source, 'RADISSON');
    assert.ok(decision.moves.some((m) => m.chargeRowId === '1' && m.destinationFolioId === '01'));
  });

  it('goes manual for CTrip when Folio 3 has a charge', () => {
    const folio = folioBundle({
      folios: [
        { Id: '01', NameHolder: 'Guest' },
        { Id: '02', NameHolder: 'CTrip' },
        { Id: '03', NameHolder: 'Other' },
      ],
      charges: [
        charge({ id: '1', folioId: '01', concept: 'RO', amount: '100' }),
        charge({ id: '2', folioId: '03', concept: 'RO', amount: '10' }),
      ],
    });
    const decision = buildArrivalCheckDecision({
      sensitive: sensitive({ mainClientName: 'CTrip' }),
      detail: null,
      folio,
    });
    assert.equal(decision.source, 'CTRIP');
    assert.equal(decision.requiresManual, true);
    assert.equal(decision.moves.length, 0);
  });

  it('goes manual for APPSMEDIA Android when Folio 3 has a charge', () => {
    const folio = folioBundle({
      folios: [
        { Id: '01', NameHolder: 'Guest' },
        { Id: '03', NameHolder: 'Third' },
      ],
      charges: [charge({ id: '1', folioId: '03', concept: 'RO', amount: '40' })],
    });
    const decision = buildArrivalCheckDecision({
      sensitive: sensitive({ mainClientName: 'APPSMEDIA - ANDROID ADS' }),
      detail: null,
      folio,
    });
    assert.equal(decision.source, 'RADISSON');
    assert.equal(decision.requiresManual, true);
    assert.equal(decision.moves.length, 0);
  });

  it('goes manual when Folio 3 has a non-zero AmountDue even without line items', () => {
    const folio = folioBundle({
      folios: [
        { Id: '01', NameHolder: 'Guest' },
        { Id: '02', NameHolder: 'Booking.com' },
        { Id: '03', NameHolder: 'Extra', AmountDue: 12.5 },
      ],
      charges: [charge({ id: '1', folioId: '01', concept: 'RO', amount: '100' })],
    });
    const decision = buildArrivalCheckDecision({
      sensitive: sensitive({ mainClientName: 'Booking.com' }),
      detail: {
        fetchedAt: '2026-07-14T00:00:00.000Z',
        reservation: {},
        creditCards: [{ IsVCC: true, Token: 'tok', Holder: 'BOOKINGCOM VCC' }],
        guests: [],
        notices: [],
        documents: [],
        profiles: [],
      },
      folio,
    });
    assert.equal(decision.requiresManual, true);
    assert.equal(decision.moves.length, 0);
  });
});
