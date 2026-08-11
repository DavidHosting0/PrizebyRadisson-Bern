import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DerivedRoomStatus } from '@housekeeping/shared';
import {
  applyEmmaSnapshotsToRooms,
  applyRackDaysOutOfOrder,
  isOoRackStatus,
  isRackDayActiveOnDate,
  mapEmmaToDerivedStatus,
  roomHasActiveOutOfOrderRackDay,
  type EmmaRoomStatusSnapshot,
} from './emma-room-status-sync';

/** Fixture from EMMA HAR: room 0104 out of order via RoomRackDays.Status = OO. */
const ROOM_104_RACK_HAR = {
  HotelId: 'CHBRNPR',
  Room: '0104',
  RoomRackDays: {
    results: [
      {
        Day: '20260622',
        ArrivalDate: '/Date(1775141416000)/',
        DepartureDate: '/Date(1783216800000)/',
        Status: 'OO',
        Incident: '0012316308',
      },
    ],
  },
};

describe('emma room rack-day out of order', () => {
  it('recognizes OO rack status codes', () => {
    assert.equal(isOoRackStatus('OO'), true);
    assert.equal(isOoRackStatus('OOO'), true);
    assert.equal(isOoRackStatus('DI'), false);
  });

  it('detects active OOO incident for room 104 on 2026-06-29', () => {
    const rackDay = ROOM_104_RACK_HAR.RoomRackDays.results[0];
    assert.equal(isRackDayActiveOnDate(rackDay, '2026-06-29'), true);
    assert.equal(roomHasActiveOutOfOrderRackDay(ROOM_104_RACK_HAR, '2026-06-29'), true);
  });

  it('does not mark room 104 OOO outside the incident window', () => {
    assert.equal(roomHasActiveOutOfOrderRackDay(ROOM_104_RACK_HAR, '2025-01-01'), false);
  });

  it('maps snapshots with rack-day OOO to OUT_OF_ORDER derived status', () => {
    const base: EmmaRoomStatusSnapshot = {
      emmaRoomId: '0104',
      roomNumber: '104',
      statusCode: 'DI',
      statusLabel: 'Dirty',
      outOfOrder: false,
      floorId: '01',
      buildingId: '01',
      raw: {},
    };
    const patched = applyRackDaysOutOfOrder([base], new Set(['104']));
    assert.equal(patched[0]?.outOfOrder, true);
    assert.equal(mapEmmaToDerivedStatus(patched[0]!), DerivedRoomStatus.OUT_OF_ORDER);
  });
});

describe('applyEmmaSnapshotsToRooms syncedAt refresh', () => {
  it('refreshes syncedAt even when status is unchanged', async () => {
    const oldSyncedAt = '2026-08-01T10:00:00.000Z';
    const room = {
      id: 'r1',
      roomNumber: '104',
      outOfOrder: false,
      metadata: {
        emma: {
          roomId: '0104',
          statusCode: 'DI',
          statusLabel: 'Dirty',
          derivedStatus: DerivedRoomStatus.DIRTY,
          outOfOrder: false,
          floorId: '01',
          buildingId: '01',
          syncedAt: oldSyncedAt,
        },
      },
    };
    const writes: Array<{ statusChanged: boolean; syncedAt: string }> = [];
    const snap: EmmaRoomStatusSnapshot = {
      emmaRoomId: '0104',
      roomNumber: '104',
      statusCode: 'DI',
      statusLabel: 'Dirty',
      outOfOrder: false,
      floorId: '01',
      buildingId: '01',
      raw: {},
    };

    const result = await applyEmmaSnapshotsToRooms(
      {
        findRooms: async () => [room],
        updateRoom: async (_id, data, meta) => {
          const emma = (data.metadata as { emma: { syncedAt: string } }).emma;
          writes.push({ statusChanged: meta.statusChanged, syncedAt: emma.syncedAt });
          room.metadata = data.metadata as typeof room.metadata;
          room.outOfOrder = data.outOfOrder;
        },
      },
      [snap],
      'CHBRNPR',
    );

    assert.equal(result.updated, 0);
    assert.equal(result.matched, 1);
    assert.equal(writes.length, 1);
    assert.equal(writes[0]?.statusChanged, false);
    assert.notEqual(writes[0]?.syncedAt, oldSyncedAt);
    assert.equal(writes[0]?.syncedAt, result.syncedAt);
  });
});
