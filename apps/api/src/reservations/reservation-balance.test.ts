import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { balanceFromFolio, resolveReservationBalance } from './reservation-balance';

describe('resolveReservationBalance', () => {
  it('prefers folio TotalAmountDueFolios over list balance', () => {
    const folio = {
      fetchedAt: '2026-01-01T00:00:00.000Z',
      reservation: { TotalAmountDueFolios: 240.5 },
      folios: [],
      charges: [],
      amount: null,
      mainCustomer: null,
      mainGuest: null,
      loanedItems: [],
      notices: [],
      messages: [],
      remarks: null,
      depositConcepts: [],
    };
    const result = resolveReservationBalance({
      sensitive: { balance: '100' } as never,
      folio,
      detail: null,
    });
    assert.deepEqual(result, { balance: '240.5', source: 'folio' });
  });

  it('falls back to list balance when no folio/detail', () => {
    const result = resolveReservationBalance({
      sensitive: { balance: '88.00' } as never,
      folio: null,
      detail: null,
    });
    assert.deepEqual(result, { balance: '88.00', source: 'list' });
  });
});

describe('balanceFromFolio', () => {
  it('reads TotalAmountFolios when due is missing', () => {
    assert.equal(
      balanceFromFolio({
        fetchedAt: '2026-01-01T00:00:00.000Z',
        reservation: { TotalAmountFolios: 50 },
        folios: [],
        charges: [],
        amount: null,
        mainCustomer: null,
        mainGuest: null,
        loanedItems: [],
        notices: [],
        messages: [],
        remarks: null,
        depositConcepts: [],
      }),
      '50',
    );
  });
});
