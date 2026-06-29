import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildEmmaCountWarnings,
  matchesDepartureDateQuery,
  type SnapshotDepartureRow,
} from './departure-query';

function row(partial: Partial<SnapshotDepartureRow> & Pick<SnapshotDepartureRow, 'reservationId'>): SnapshotDepartureRow {
  return {
    roomId: '101',
    departureDate: new Date('2026-06-29T00:00:00.000Z'),
    checkIn: true,
    checkOut: false,
    ...partial,
  };
}

describe('matchesDepartureDateQuery', () => {
  const today = '2026-06-29';

  it('includes in-house guest departing today', () => {
    assert.equal(matchesDepartureDateQuery(row({ reservationId: 'a' }), today, today), true);
  });

  it('includes guest who checked out today', () => {
    assert.equal(
      matchesDepartureDateQuery(row({ reservationId: 'a', checkOut: true }), today, today),
      true,
    );
  });

  it('excludes checked-out guest for a past date', () => {
    assert.equal(
      matchesDepartureDateQuery(row({ reservationId: 'a', checkOut: true }), '2026-06-28', today),
      false,
    );
  });

  it('excludes wrong departure date', () => {
    assert.equal(
      matchesDepartureDateQuery(
        row({ reservationId: 'a', departureDate: new Date('2026-06-30T00:00:00.000Z') }),
        today,
        today,
      ),
      false,
    );
  });

  it('excludes not checked in', () => {
    assert.equal(matchesDepartureDateQuery(row({ reservationId: 'a', checkIn: false }), today, today), false);
  });

  it('excludes missing room', () => {
    assert.equal(matchesDepartureDateQuery(row({ reservationId: 'a', roomId: null }), today, today), false);
  });
});

describe('buildEmmaCountWarnings', () => {
  const today = '2026-06-29';

  it('warns when counts differ for today', () => {
    const warnings = buildEmmaCountWarnings(8, 1, 10, today, today);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /Expected 10/);
  });

  it('is silent when counts match', () => {
    assert.deepEqual(buildEmmaCountWarnings(9, 1, 10, today, today), []);
  });

  it('skips validation for non-today dates', () => {
    assert.deepEqual(buildEmmaCountWarnings(5, 0, 10, '2026-06-28', today), []);
  });
});
