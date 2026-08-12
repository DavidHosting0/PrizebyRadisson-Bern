import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  collectPaymWoInvPath,
  createDepositBody,
  emmaSapDateLiteral,
  yesterdayHotelCalendarUtcMidnight,
} from './emma-odata-client';

describe('yesterdayHotelCalendarUtcMidnight', () => {
  it('returns UTC midnight of the hotel calendar day before the given instant', () => {
    // 12 Aug 2026 22:00 in Zurich is still 12 Aug; yesterday is 11 Aug UTC midnight.
    const now = new Date('2026-08-12T20:00:00.000Z');
    const y = yesterdayHotelCalendarUtcMidnight(now, 'Europe/Zurich');
    assert.equal(y.toISOString(), '2026-08-11T00:00:00.000Z');
    assert.equal(emmaSapDateLiteral(y), '/Date(1786406400000)/');
  });
});

describe('createDepositBody', () => {
  it('uses yesterday for RequestDate and DueDate', () => {
    const body = JSON.parse(
      createDepositBody({
        hotelId: 'CHBRNPR',
        reservationId: '0175792544',
        amount: '452.00',
        currency: 'CHF',
        requestDate: new Date('2026-08-11T00:00:00.000Z'),
      }),
    ) as { RequestDate: string; DueDate: string; DepositRequested: string };
    assert.equal(body.DepositRequested, '452.00');
    assert.equal(body.RequestDate, '/Date(1786406400000)/');
    assert.equal(body.DueDate, '/Date(1786406400000)/');
  });
});

describe('collectPaymWoInvPath', () => {
  it('uses unpadded folio 2 and empty pinpad (no invoice)', () => {
    const path = collectPaymWoInvPath({
      sapClient: '100',
      hotelId: 'CHBRNPR',
      reservationId: '0175792544',
      depositId: '0001',
      tillId: 'FD1013',
      employee: '0000047032',
      folioId: '02',
      token: 'tok',
      expiry: '0827',
    });
    assert.match(path, /Folio='2'/);
    assert.match(path, /Pinpad=''/);
    assert.match(path, /Id='0001'/);
    assert.match(path, /Payment='PG3'/);
    assert.doesNotMatch(path, /InvoiceNumber/);
  });
});
