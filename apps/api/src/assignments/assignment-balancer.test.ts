import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  balanceDailyCleaningAssignments,
  daysBetweenIso,
  isLateShiftWindow,
  isPublicAreaDue,
  type BalanceWorkItem,
  type EligibleCleaner,
} from './assignment-balancer';

function dirtyRoom(n: string, pinned = false, assignee: string | null = null): BalanceWorkItem {
  return {
    key: `r-${n}`,
    kind: 'ROOM',
    workType: 'DIRTY',
    roomId: `id-${n}`,
    roomNumber: n,
    floor: Math.floor(parseInt(n, 10) / 100) || null,
    pinned,
    assigneeUserId: assignee,
  };
}

function restant(n: string): BalanceWorkItem {
  return { ...dirtyRoom(n), key: `rest-${n}`, workType: 'RESTANT' };
}

function publicItem(id: string, floor = 1): BalanceWorkItem {
  return {
    key: `p-${id}`,
    kind: 'PUBLIC_AREA',
    workType: 'PUBLIC',
    publicAreaId: id,
    floor,
    pinned: false,
    assigneeUserId: null,
  };
}

describe('balanceDailyCleaningAssignments', () => {
  it('returns empty when no housekeepers', () => {
    const result = balanceDailyCleaningAssignments([dirtyRoom('101')], []);
    assert.equal(result.assignments.length, 0);
  });

  it('preserves pinned assignees', () => {
    const items = [
      dirtyRoom('101', true, 'pinned-hk'),
      dirtyRoom('102'),
      dirtyRoom('103'),
    ];
    const cleaners: EligibleCleaner[] = [
      { housekeeperId: 'a', isLateShift: false, roomWeight: 1 },
      { housekeeperId: 'b', isLateShift: false, roomWeight: 1 },
    ];
    const { assignments } = balanceDailyCleaningAssignments(items, cleaners);
    const pinned = assignments.find((a) => a.key === 'r-101');
    assert.equal(pinned?.housekeeperId, 'pinned-hk');
  });

  it('assigns all restants to one cleaner', () => {
    const items = [restant('201'), restant('202'), restant('203'), dirtyRoom('101')];
    const cleaners: EligibleCleaner[] = [
      { housekeeperId: 'a', isLateShift: false, roomWeight: 1 },
      { housekeeperId: 'b', isLateShift: false, roomWeight: 1 },
    ];
    const { assignments } = balanceDailyCleaningAssignments(items, cleaners);
    const restAssignees = new Set(
      assignments.filter((a) => a.key.startsWith('rest-')).map((a) => a.housekeeperId),
    );
    assert.equal(restAssignees.size, 1);
  });

  it('gives late shift fewer dirty rooms and more public', () => {
    const rooms = ['101', '102', '103', '104', '105', '106', '107', '108'].map((n) => dirtyRoom(n));
    const publics = ['g1', 'g2', 'g3', 'g4'].map((id) => publicItem(id));
    const cleaners: EligibleCleaner[] = [
      { housekeeperId: 'early', isLateShift: false, roomWeight: 1 },
      { housekeeperId: 'late', isLateShift: true, roomWeight: 0.55 },
    ];
    const { summaries } = balanceDailyCleaningAssignments([...rooms, ...publics], cleaners);
    const early = summaries.find((s) => s.housekeeperId === 'early')!;
    const late = summaries.find((s) => s.housekeeperId === 'late')!;
    assert.ok(early.roomCount >= late.roomCount);
    assert.ok(late.publicCount >= early.publicCount);
  });
});

describe('isLateShiftWindow', () => {
  it('detects 11–20 window', () => {
    // Use fixed UTC times that map to ~11:00–20:00 in Europe/Zurich (CEST = UTC+2 in summer)
    const start = new Date('2026-08-04T09:00:00.000Z'); // 11:00 Zurich summer
    const end = new Date('2026-08-04T18:00:00.000Z'); // 20:00 Zurich summer
    assert.equal(isLateShiftWindow(start, end, 'Europe/Zurich'), true);
  });

  it('rejects early shift', () => {
    const start = new Date('2026-08-04T04:00:00.000Z'); // 06:00 Zurich
    const end = new Date('2026-08-04T13:00:00.000Z'); // 15:00 Zurich
    assert.equal(isLateShiftWindow(start, end, 'Europe/Zurich'), false);
  });
});

describe('isPublicAreaDue / overdue days', () => {
  it('due when never cleaned', () => {
    assert.equal(isPublicAreaDue({ lastCompletedOn: null, frequencyDays: 2, dateIso: '2026-08-04' }), true);
  });

  it('respects every-2-days frequency', () => {
    assert.equal(
      isPublicAreaDue({ lastCompletedOn: '2026-08-03', frequencyDays: 2, dateIso: '2026-08-04' }),
      false,
    );
    assert.equal(
      isPublicAreaDue({ lastCompletedOn: '2026-08-02', frequencyDays: 2, dateIso: '2026-08-04' }),
      true,
    );
  });

  it('computes overdue days', () => {
    assert.equal(daysBetweenIso('2026-08-01', '2026-08-04'), 3);
  });
});
