import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DerivedRoomStatus } from '@housekeeping/shared';
import { ChecklistTaskStatus } from '@prisma/client';
import { RoomStatusService } from './room-status.service';

const svc = new RoomStatusService();

describe('RoomStatusService.derive', () => {
  it('shows CLEAN after cleaner mark-clean even when EMMA says Dirty', () => {
    const cleanAt = new Date('2026-08-11T10:00:00.000Z');
    const status = svc.derive(
      { outOfOrder: false, cleaningDeclaredAt: cleanAt },
      [],
      [],
      {
        statusCode: 'DI',
        statusLabel: 'Dirty',
        derivedStatus: DerivedRoomStatus.DIRTY,
        outOfOrder: false,
        syncedAt: '2026-08-11T12:00:00.000Z', // EMMA sync newer than clean — still ignore
      },
    );
    assert.equal(status, DerivedRoomStatus.CLEAN);
  });

  it('shows CLEAN after re-clean even when an older passed inspection exists', () => {
    const status = svc.derive(
      { outOfOrder: false, cleaningDeclaredAt: new Date('2026-08-11T14:00:00.000Z') },
      [],
      [{ passed: true, inspectedAt: new Date('2026-08-10T18:00:00.000Z') }],
      {
        statusCode: 'IN',
        statusLabel: 'Inspected',
        derivedStatus: DerivedRoomStatus.INSPECTED,
        outOfOrder: false,
        syncedAt: '2026-08-11T15:00:00.000Z',
      },
    );
    assert.equal(status, DerivedRoomStatus.CLEAN);
  });

  it('shows INSPECTED when inspection is at/after the clean declaration', () => {
    const at = new Date('2026-08-11T16:00:00.000Z');
    const status = svc.derive(
      { outOfOrder: false, cleaningDeclaredAt: at },
      [],
      [{ passed: true, inspectedAt: at }],
      {
        statusCode: 'IN',
        statusLabel: 'Inspected',
        derivedStatus: DerivedRoomStatus.INSPECTED,
        outOfOrder: false,
        syncedAt: '2026-08-11T16:01:00.000Z',
      },
    );
    assert.equal(status, DerivedRoomStatus.INSPECTED);
  });

  it('uses EMMA Dirty when there is no local clean awaiting inspection', () => {
    const status = svc.derive(
      { outOfOrder: false, cleaningDeclaredAt: null },
      [],
      [{ passed: true, inspectedAt: new Date('2026-08-10T18:00:00.000Z') }],
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
  it('is true only for local clean newer than last passed inspection', () => {
    assert.equal(
      svc.isAwaitingInspection(
        { outOfOrder: false, cleaningDeclaredAt: new Date('2026-08-11T14:00:00.000Z') },
        [{ passed: true, inspectedAt: new Date('2026-08-10T12:00:00.000Z') }],
      ),
      true,
    );
    assert.equal(
      svc.isAwaitingInspection(
        { outOfOrder: false, cleaningDeclaredAt: new Date('2026-08-11T14:00:00.000Z') },
        [{ passed: true, inspectedAt: new Date('2026-08-11T15:00:00.000Z') }],
      ),
      false,
    );
    assert.equal(
      svc.isAwaitingInspection({ outOfOrder: false, cleaningDeclaredAt: null }, []),
      false,
    );
  });
});
