import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BERN_TICKET_MAX_PAX,
  BERN_TICKET_MAX_STAY_DAYS,
  bernTicketStayDays,
  prepareBernTicketForArrival,
} from '@housekeeping/shared';
import { BERN_TICKET_2FA_REQUIRED, BtApiError } from '../bernticket/bernticket.types';

describe('bernTicketStayDays', () => {
  it('counts calendar days between arrival and departure', () => {
    assert.equal(bernTicketStayDays('2026-06-01', '2026-06-03'), 2);
    assert.equal(bernTicketStayDays('2026-06-01', '2026-06-01'), 0);
  });

  it('returns null for invalid dates', () => {
    assert.equal(bernTicketStayDays('bad', '2026-06-01'), null);
  });
});

describe('prepareBernTicketForArrival', () => {
  const base = {
    guestName: 'Anna Müller',
    bookingNumber: '123456',
    arrivalDate: '2026-06-29',
    departureDate: '2026-07-01',
    numPax: 2,
  };

  it('builds a valid create body with dates and pax', () => {
    const result = prepareBernTicketForArrival(base);
    assert.deepEqual(result, {
      ok: true,
      body: {
        guestName: 'Anna Müller',
        bookingNumber: '123456',
        validFrom: '2026-06-29',
        validTo: '2026-07-01',
        ticketsAmount: 2,
      },
    });
  });

  it('fails when guest name is missing', () => {
    const result = prepareBernTicketForArrival({ ...base, guestName: '  ' });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /Gastname/);
  });

  it('fails when booking number is missing', () => {
    const result = prepareBernTicketForArrival({ ...base, bookingNumber: '' });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /Buchungsnummer/);
  });

  it('fails when numPax is 0', () => {
    const result = prepareBernTicketForArrival({ ...base, numPax: 0 });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /Personenanzahl/);
  });

  it('fails when numPax exceeds max', () => {
    const result = prepareBernTicketForArrival({
      ...base,
      numPax: BERN_TICKET_MAX_PAX + 1,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /Personen/);
  });

  it('fails when stay exceeds max days', () => {
    assert.equal(bernTicketStayDays('2026-01-01', '2026-02-01'), BERN_TICKET_MAX_STAY_DAYS + 1);
    const result = prepareBernTicketForArrival({
      ...base,
      arrivalDate: '2026-01-01',
      departureDate: '2026-02-01',
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /Aufenthalt/);
  });

  it('allows exactly max stay days and max pax', () => {
    const result = prepareBernTicketForArrival({
      ...base,
      arrivalDate: '2026-01-01',
      departureDate: '2026-01-31',
      numPax: 3,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.body.ticketsAmount, 3);
      assert.equal(result.body.validFrom, '2026-01-01');
      assert.equal(result.body.validTo, '2026-01-31');
    }
  });

  it('fails when departure is before arrival', () => {
    const result = prepareBernTicketForArrival({
      ...base,
      arrivalDate: '2026-07-02',
      departureDate: '2026-07-01',
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /Abreise/);
  });
});

describe('BtApiError 2FA', () => {
  it('carries BERN_TICKET_2FA_REQUIRED code for non-blocking failure mapping', () => {
    const err = new BtApiError(
      'BernTicket verlangt 2FA — Ticket nicht erstellt.',
      403,
      BERN_TICKET_2FA_REQUIRED,
    );
    assert.equal(err.code, BERN_TICKET_2FA_REQUIRED);
    assert.match(err.message, /2FA/);
  });
});
