import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  clampReservationSearchLimit,
  collectPagedMatches,
  reservationListItemMatchesQuery,
  type ReservationSearchCursor,
} from './reservation-search';

describe('clampReservationSearchLimit', () => {
  it('defaults to 500 and never exceeds it', () => {
    assert.equal(clampReservationSearchLimit(undefined), 500);
    assert.equal(clampReservationSearchLimit(Number.NaN), 500);
    assert.equal(clampReservationSearchLimit(5000), 500);
    assert.equal(clampReservationSearchLimit(12), 12);
    assert.equal(clampReservationSearchLimit(0), 1);
  });
});

describe('reservationListItemMatchesQuery', () => {
  const row = {
    mainGuestName: 'Anna Berger',
    reservationId: 'R100',
    roomId: '214',
    groupName: null,
    roomType: 'STD',
    vipDesc: null,
    tier: null,
  };

  it('matches a guest name regardless of case', () => {
    assert.equal(reservationListItemMatchesQuery(row, 'berger'), true);
    assert.equal(reservationListItemMatchesQuery(row, 'other'), false);
  });
});

describe('collectPagedMatches', () => {
  type Row = { cursor: ReservationSearchCursor; name: string };

  function page(names: string[], startDay: number): Row[] {
    return names.map((name, index) => ({
      name,
      cursor: {
        arrivalDate: new Date(Date.UTC(2026, 0, startDay - index)),
        id: `${startDay}-${index}`,
      },
    }));
  }

  it('keeps scanning older pages until the name matches', async () => {
    const pages = [
      page(['Mia Kurz', 'Leo Kurz'], 20),
      page(['Anna Berger'], 10),
    ];
    let calls = 0;
    const found = await collectPagedMatches({
      batchSize: 2,
      limit: 500,
      fetchPage: async () => pages[calls++] ?? [],
      matches: (row) => reservationListItemMatchesQuery(
        {
          mainGuestName: row.name,
          reservationId: row.cursor.id,
          roomId: null,
          groupName: null,
          roomType: null,
          vipDesc: null,
          tier: null,
        },
        'berger',
      ),
      cursorOf: (row) => row.cursor,
    });

    assert.equal(found.length, 1);
    assert.equal(found[0]?.name, 'Anna Berger');
    assert.equal(calls, 2);
  });

  it('stops at the result cap without reading further pages', async () => {
    let calls = 0;
    const found = await collectPagedMatches({
      batchSize: 2,
      limit: 2,
      fetchPage: async () => {
        calls += 1;
        if (calls > 1) return [];
        return page(['Anna Berger', 'Anna Berger'], 30);
      },
      matches: () => true,
      cursorOf: (row) => row.cursor,
    });

    assert.equal(found.length, 2);
    assert.equal(calls, 1);
  });
});
