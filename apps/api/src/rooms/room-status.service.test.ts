import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DerivedRoomStatus } from '@housekeeping/shared';
import { ChecklistTaskStatus } from '@prisma/client';
import { RoomStatusService } from './room-status.service';

const svc = new RoomStatusService();

describe('RoomStatusService.derive', () => {
  it('prefers Emma Inspected over a stale local Clean declaration', () => {
    const status = svc.derive(
      { outOfOrder: false, cleaningDeclaredAt: new Date('2026-08-11T10:00:00.000Z') },
      [],
      [],
      {
        statusCode: 'IN',
        statusLabel: 'Inspected',
        derivedStatus: DerivedRoomStatus.INSPECTED,
        outOfOrder: false,
        syncedAt: '2026-08-11T15:00:00.000Z',
      },
    );
    assert.equal(status, DerivedRoomStatus.INSPECTED);
  });

  it('shows local CLEAN when mark-clean is newer than Emma sync', () => {
    const cleanAt = new Date('2026-08-11T16:00:00.000Z');
    const status = svc.derive(
      { outOfOrder: false, cleaningDeclaredAt: cleanAt },
      [],
      [],
      {
        statusCode: 'DI',
        statusLabel: 'Dirty',
        derivedStatus: DerivedRoomStatus.DIRTY,
        outOfOrder: false,
        syncedAt: '2026-08-11T12:00:00.000Z',
      },
    );
    assert.equal(status, DerivedRoomStatus.CLEAN);
  });

  it('follows Emma Dirty when Emma sync is newer than last local activity', () => {
    const status = svc.derive(
      { outOfOrder: false, cleaningDeclaredAt: new Date('2026-08-10T18:00:00.000Z') },
      [],
      [{ passed: true, inspectedAt: new Date('2026-08-10T19:00:00.000Z') }],
      {
        statusCode: 'DI',
        statusLabel: 'Dirty',
        derivedStatus: DerivedRoomStatus.DIRTY,
        outOfOrder: false,
        syncedAt: '2026-08-11T08:00:00.000Z',
      },
    );
    assert.equal(status, DerivedRoomStatus.DIRTY);
  });

  it('shows INSPECTED from local inspection when newer than Emma', () => {
    const at = new Date('2026-08-11T16:00:00.000Z');
    const status = svc.derive(
      { outOfOrder: false, cleaningDeclaredAt: at },
      [],
      [{ passed: true, inspectedAt: at }],
      {
        statusCode: 'CL',
        statusLabel: 'Clean',
        derivedStatus: DerivedRoomStatus.CLEAN,
        outOfOrder: false,
        syncedAt: '2026-08-11T12:00:00.000Z',
      },
    );
    assert.equal(status, DerivedRoomStatus.INSPECTED);
  });

  it('falls back to checklist when no EMMA and no clean/inspect', () => {
    const status = svc.derive(
      { outOfOrder: false, cleaningDeclaredAt: null },
      [{ status: ChecklistTaskStatus.NOT_STARTED }],
      [],
      null,
    );
    assert.equal(status, DerivedRoomStatus.DIRTY);
  });
});

describe('RoomStatusService.isAwaitingInspection', () => {
  it('is true for Emma CLEAN', () => {
    assert.equal(
      svc.isAwaitingInspection({ outOfOrder: false, cleaningDeclaredAt: null }, [], {
        statusCode: 'CL',
        statusLabel: 'Clean',
        derivedStatus: DerivedRoomStatus.CLEAN,
        outOfOrder: false,
        syncedAt: '2026-08-11T12:00:00.000Z',
      }),
      true,
    );
  });

  it('is false when Emma already says Inspected', () => {
    assert.equal(
      svc.isAwaitingInspection(
        { outOfOrder: false, cleaningDeclaredAt: new Date('2026-08-11T10:00:00.000Z') },
        [],
        {
          statusCode: 'IN',
          statusLabel: 'Inspected',
          derivedStatus: DerivedRoomStatus.INSPECTED,
          outOfOrder: false,
          syncedAt: '2026-08-11T15:00:00.000Z',
        },
      ),
      false,
    );
  });
});
