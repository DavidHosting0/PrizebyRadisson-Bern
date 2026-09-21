import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isOtaPlaceholderGuestEmail,
  pickMainGuestMail,
  shouldClearGuestEmailForArrivalCheck,
} from '@housekeeping/shared';

describe('isOtaPlaceholderGuestEmail', () => {
  it('detects Booking guest mailboxes', () => {
    assert.equal(isOtaPlaceholderGuestEmail('SMAIA.158498@GUEST.BOOKING.COM'), true);
    assert.equal(isOtaPlaceholderGuestEmail('smaia.158498@guest.booking.com'), true);
  });

  it('detects other known OTA guest domains', () => {
    assert.equal(isOtaPlaceholderGuestEmail('x@guest.agoda.com'), true);
    assert.equal(isOtaPlaceholderGuestEmail('x@guest.expedia.com'), true);
    assert.equal(isOtaPlaceholderGuestEmail('x@guest.ctrip.com'), true);
    assert.equal(isOtaPlaceholderGuestEmail('x@guest.trip.com'), true);
  });

  it('keeps real and non-allowlisted emails', () => {
    assert.equal(isOtaPlaceholderGuestEmail('guest@gmail.com'), false);
    assert.equal(isOtaPlaceholderGuestEmail('anna.mueller@bluewin.ch'), false);
    assert.equal(isOtaPlaceholderGuestEmail('NOEMAILONPROFILE@RADISSONHOTELS.COM'), false);
    assert.equal(isOtaPlaceholderGuestEmail(''), false);
    assert.equal(isOtaPlaceholderGuestEmail(null), false);
    assert.equal(isOtaPlaceholderGuestEmail('not-an-email'), false);
  });
});

describe('shouldClearGuestEmailForArrivalCheck', () => {
  const bookingMail = 'SMAIA.158498@GUEST.BOOKING.COM';

  it('clears for Booking / Expedia / Agoda / CTrip / Trivago when placeholder', () => {
    for (const source of ['BOOKING', 'EXPEDIA', 'AGODA', 'CTRIP', 'TRIVAGO'] as const) {
      assert.equal(shouldClearGuestEmailForArrivalCheck(source, bookingMail), true, source);
    }
  });

  it('clears OTHER only when email is an allowlisted OTA placeholder', () => {
    assert.equal(shouldClearGuestEmailForArrivalCheck('OTHER', bookingMail), true);
    assert.equal(shouldClearGuestEmailForArrivalCheck('OTHER', 'real@gmail.com'), false);
  });

  it('never clears protected clients', () => {
    for (const source of [
      'RADISSON',
      'DIRECT_GUEST',
      'DAYUSE',
      'BCD_TRAVEL',
      'ATG_TRAVEL',
      'APPSMEDIA_IOS',
    ] as const) {
      assert.equal(shouldClearGuestEmailForArrivalCheck(source, bookingMail), false, source);
    }
  });

  it('keeps real guest emails even on Booking', () => {
    assert.equal(shouldClearGuestEmailForArrivalCheck('BOOKING', 'anna@gmail.com'), false);
  });
});

describe('pickMainGuestMail', () => {
  it('prefers MainGuest then GuestId 01', () => {
    const fromFlag = pickMainGuestMail([
      { GuestId: '02', Mail: 'a@guest.booking.com', MainGuest: false },
      { GuestId: '01', Mail: 'SMAIA.158498@GUEST.BOOKING.COM', MainGuest: true },
    ]);
    assert.equal(fromFlag?.guestId, '01');
    assert.equal(fromFlag?.mail, 'SMAIA.158498@GUEST.BOOKING.COM');

    const fromId = pickMainGuestMail([
      { GuestId: '02', Mail: 'other@guest.booking.com' },
      { GuestId: '01', Mail: 'main@guest.booking.com' },
    ]);
    assert.equal(fromId?.guestId, '01');
    assert.equal(fromId?.mail, 'main@guest.booking.com');
  });
});
