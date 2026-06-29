import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  decideGuestStaySyncAction,
  shouldBackfillGuestStay,
} from './room-guest-stay-logic';

describe('decideGuestStaySyncAction', () => {
  it('creates a stay for check-in with room assignment', () => {
    const action = decideGuestStaySyncAction(
      { roomId: '021', checkIn: true, checkOut: false, inCheckInDone: false },
      null,
    );
    assert.deepEqual(action, { kind: 'create', roomNumber: '21' });
  });

  it('creates a stay for check-ins-done with room assignment', () => {
    const action = decideGuestStaySyncAction(
      { roomId: '305', checkIn: false, checkOut: false, inCheckInDone: true },
      null,
    );
    assert.deepEqual(action, { kind: 'create', roomNumber: '305' });
  });

  it('skips rows without room or check-in signals', () => {
    assert.deepEqual(
      decideGuestStaySyncAction(
        { roomId: null, checkIn: true, checkOut: false, inCheckInDone: false },
        null,
      ),
      { kind: 'skip' },
    );
    assert.deepEqual(
      decideGuestStaySyncAction(
        { roomId: '21', checkIn: false, checkOut: false, inCheckInDone: false },
        null,
      ),
      { kind: 'skip' },
    );
  });

  it('checks out when EMMA reports checkout', () => {
    const action = decideGuestStaySyncAction(
      { roomId: '21', checkIn: true, checkOut: true, inCheckInDone: false },
      { roomNumber: '21', checkedOut: false },
    );
    assert.deepEqual(action, { kind: 'checkout' });
  });

  it('updates an existing open stay in the same room', () => {
    const action = decideGuestStaySyncAction(
      { roomId: '021', checkIn: true, checkOut: false, inCheckInDone: false },
      { roomNumber: '21', checkedOut: false },
    );
    assert.deepEqual(action, { kind: 'update', roomNumber: '21' });
  });

  it('closes and recreates when the room changes', () => {
    const action = decideGuestStaySyncAction(
      { roomId: '305', checkIn: true, checkOut: false, inCheckInDone: false },
      { roomNumber: '21', checkedOut: false },
    );
    assert.deepEqual(action, {
      kind: 'room_change',
      previousRoomNumber: '21',
      roomNumber: '305',
    });
  });

  it('creates a new segment after a prior stay was checked out', () => {
    const action = decideGuestStaySyncAction(
      { roomId: '21', checkIn: true, checkOut: false, inCheckInDone: false },
      { roomNumber: '21', checkedOut: true },
    );
    assert.deepEqual(action, { kind: 'create', roomNumber: '21' });
  });
});

describe('shouldBackfillGuestStay', () => {
  it('accepts snapshots with room and guest signals', () => {
    assert.equal(
      shouldBackfillGuestStay({
        roomId: '21',
        checkIn: false,
        inCheckInDone: true,
        checkOut: false,
      }),
      true,
    );
    assert.equal(
      shouldBackfillGuestStay({
        roomId: '21',
        checkIn: false,
        inCheckInDone: false,
        checkOut: true,
      }),
      true,
    );
  });

  it('rejects snapshots without room or guest signals', () => {
    assert.equal(
      shouldBackfillGuestStay({
        roomId: null,
        checkIn: true,
        inCheckInDone: true,
        checkOut: true,
      }),
      false,
    );
    assert.equal(
      shouldBackfillGuestStay({
        roomId: '21',
        checkIn: false,
        inCheckInDone: false,
        checkOut: false,
      }),
      false,
    );
  });
});
