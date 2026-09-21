import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  EXTENSIVE_RESTANT_MIN_NIGHTS,
  calendarDaysBetween,
  deriveGuestStaySignals,
} from '@housekeeping/shared';

describe('calendarDaysBetween', () => {
  it('returns 0 for the same day', () => {
    assert.equal(calendarDaysBetween('2026-09-01', '2026-09-01'), 0);
  });

  it('counts calendar nights between dates', () => {
    assert.equal(calendarDaysBetween('2026-09-01', '2026-09-06'), 5);
    assert.equal(calendarDaysBetween('2026-09-01', '2026-09-05'), 4);
  });
});

describe('deriveGuestStaySignals extensive restant', () => {
  const base = {
    arrivalDate: '2026-09-01',
    departureDate: '2026-09-20',
    inHouse: true,
    checkOut: false,
  };

  it('is not extensive after 4 nights in house', () => {
    const s = deriveGuestStaySignals({ ...base, today: '2026-09-05' });
    assert.equal(s.isRestant, true);
    assert.equal(s.nightsInHouse, 4);
    assert.equal(s.isExtensiveRestant, false);
  });

  it('is extensive from 5 nights in house', () => {
    const s = deriveGuestStaySignals({ ...base, today: '2026-09-06' });
    assert.equal(s.isRestant, true);
    assert.equal(s.nightsInHouse, EXTENSIVE_RESTANT_MIN_NIGHTS);
    assert.equal(s.isExtensiveRestant, true);
  });

  it('is not extensive on departure day even after 5+ nights', () => {
    const s = deriveGuestStaySignals({
      ...base,
      departureDate: '2026-09-10',
      today: '2026-09-10',
    });
    assert.equal(s.isDepartureToday, true);
    assert.equal(s.isRestant, false);
    assert.equal(s.nightsInHouse, 9);
    assert.equal(s.isExtensiveRestant, false);
  });

  it('is not extensive on arrival day', () => {
    const s = deriveGuestStaySignals({ ...base, today: '2026-09-01' });
    assert.equal(s.isArrivalToday, true);
    assert.equal(s.isRestant, false);
    assert.equal(s.nightsInHouse, 0);
    assert.equal(s.isExtensiveRestant, false);
  });
});
