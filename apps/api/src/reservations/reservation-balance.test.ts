import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  outstandingFromFolio,
  resolveOutstandingBalance,
} from '@housekeeping/shared';

describe('resolveOutstandingBalance', () => {
  it('prefers folio TotalAmountDueFolios over list balance', () => {
    const folio = {
      fetchedAt: '2026-01-01T00:00:00.000Z',
      reservation: { TotalAmountDueFolios: 240.5, Currency: 'CHF' },
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
    const result = resolveOutstandingBalance({
      sensitiveBalance: '100',
      folio,
      detail: null,
    });
    assert.equal(result.balance, '240.5 CHF');
    assert.equal(result.source, 'folio');
  });

  it('sums folio header AmountDue when reservation totals are missing', () => {
    const folio = {
      fetchedAt: '2026-01-01T00:00:00.000Z',
      reservation: { Currency: 'CHF' },
      folios: [
        { Id: '01', AmountDue: 120, Currency: 'CHF' },
        { Id: '02', AmountDue: 45.5, Currency: 'CHF' },
      ],
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
    assert.equal(outstandingFromFolio(folio), '165.5 CHF');
  });

  it('falls back to list balance when no folio/detail', () => {
    const result = resolveOutstandingBalance({
      sensitiveBalance: '88.00',
      folio: null,
      detail: null,
    });
    assert.equal(result.balance, '88');
    assert.equal(result.source, 'list');
  });
});
