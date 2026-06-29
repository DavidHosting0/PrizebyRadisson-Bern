import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  guestStayPresence,
  matchesGuestStayDateRange,
  matchesGuestStayForRoom,
} from './guest-stay-query';

describe('matchesGuestStayForRoom', () => {
  it('matches normalized room numbers', () => {
    assert.equal(matchesGuestStayForRoom('021', '21'), true);
    assert.equal(matchesGuestStayForRoom('21', '21'), true);
    assert.equal(matchesGuestStayForRoom('305', '21'), false);
  });

  it('rejects empty room id', () => {
    assert.equal(matchesGuestStayForRoom(null, '21'), false);
    assert.equal(matchesGuestStayForRoom('  ', '21'), false);
  });
});

describe('matchesGuestStayDateRange', () => {
  const arrival = new Date('2026-06-01T00:00:00.000Z');
  const departure = new Date('2026-06-05T00:00:00.000Z');

  it('matches when range overlaps stay', () => {
    assert.equal(matchesGuestStayDateRange(arrival, departure, '2026-06-03', '2026-06-10'), true);
    assert.equal(matchesGuestStayDateRange(arrival, departure, '2026-05-01', '2026-06-02'), true);
  });

  it('rejects when range is before or after stay', () => {
    assert.equal(matchesGuestStayDateRange(arrival, departure, '2026-06-06', '2026-06-10'), false);
    assert.equal(matchesGuestStayDateRange(arrival, departure, '2026-05-01', '2026-05-31'), false);
  });

  it('matches all when no range given', () => {
    assert.equal(matchesGuestStayDateRange(arrival, departure), true);
  });
});

describe('guestStayPresence', () => {
  it('marks checked-out guests as departed', () => {
    assert.equal(
      guestStayPresence(new Date('2026-06-10T00:00:00.000Z'), true, '2026-06-09'),
      'departed',
    );
  });

  it('marks future departures as in house', () => {
    assert.equal(
      guestStayPresence(new Date('2026-06-10T00:00:00.000Z'), false, '2026-06-09'),
      'in_house',
    );
  });

  it('marks past departures without checkout as departed', () => {
    assert.equal(
      guestStayPresence(new Date('2026-06-01T00:00:00.000Z'), false, '2026-06-09'),
      'departed',
    );
  });
});
