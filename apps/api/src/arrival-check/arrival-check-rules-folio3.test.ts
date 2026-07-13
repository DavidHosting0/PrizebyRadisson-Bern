import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ReservationEmmaFolioBundle } from '@housekeeping/shared';
import type { ReservationSensitivePayload } from '../reservations/reservation-sensitive';
import { findCompanyFolioId } from './arrival-check-charge-assign';
import { buildArrivalCheckDecision } from './arrival-check-rules';

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

  it('Radisson consolidate never pulls charges off Folio 3', () => {
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
    assert.equal(decision.scenario, 'DIRECT');
    assert.ok(decision.moves.every((m) => m.sourceFolioId !== '03' && m.destinationFolioId !== '03'));
    assert.ok(!decision.moves.some((m) => m.chargeRowId === '2' || m.chargeRowId === '3'));
  });

  it('VCC tax consolidation never moves tax from Folio 3 to Folio 1', () => {
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
    assert.equal(decision.scenario, 'VCC');
    assert.ok(decision.moves.every((m) => m.sourceFolioId !== '03' && m.destinationFolioId !== '03'));
    assert.ok(!decision.moves.some((m) => m.chargeRowId === '2'));
    assert.ok(decision.moves.some((m) => m.chargeRowId === '3' && m.destinationFolioId === '01'));
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
