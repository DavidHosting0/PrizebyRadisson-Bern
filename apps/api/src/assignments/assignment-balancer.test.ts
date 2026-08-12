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

  it('assigns all restants to one cleaner by default', () => {
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

  it('splits restants across preferred assignees', () => {
    const items = [
      restant('201'),
      restant('202'),
      restant('203'),
      restant('204'),
      dirtyRoom('101'),
    ];
    const cleaners: EligibleCleaner[] = [
      { housekeeperId: 'a', isLateShift: false, roomWeight: 1 },
      { housekeeperId: 'b', isLateShift: false, roomWeight: 1 },
    ];
    const { summaries } = balanceDailyCleaningAssignments(items, cleaners, {
      preferredRestantIds: ['a', 'b'],
    });
    const a = summaries.find((s) => s.housekeeperId === 'a')!;
    const b = summaries.find((s) => s.housekeeperId === 'b')!;
    assert.equal(a.restantCount + b.restantCount, 4);
    assert.equal(a.restantCount, 2);
    assert.equal(b.restantCount, 2);
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
    assert.ok(early.roomCount > late.roomCount);
    assert.ok(late.publicCount >= early.publicCount);
  });

  it('carves contiguous floor clusters instead of scattering', () => {
    // 3 rooms on each of floors 1–4
    const rooms: BalanceWorkItem[] = [];
    for (const floor of [1, 2, 3, 4]) {
      for (const unit of [1, 2, 3]) {
        rooms.push(dirtyRoom(`${floor}0${unit}`));
      }
    }
    const cleaners: EligibleCleaner[] = [
      { housekeeperId: 'a', isLateShift: false, roomWeight: 1 },
      { housekeeperId: 'b', isLateShift: false, roomWeight: 1 },
    ];
    const { summaries, assignments } = balanceDailyCleaningAssignments(rooms, cleaners);
    assert.equal(assignments.length, 12);
    for (const s of summaries) {
      assert.equal(s.roomCount, 6);
      const floors = [...s.floors].sort((x, y) => x - y);
      // Contiguous block: max - min + 1 === number of distinct floors (no holes)
      assert.equal(floors[floors.length - 1]! - floors[0]! + 1, floors.length);
    }
    // No interleaving: floors of a and b should be disjoint ranges
    const floorsA = new Set(summaries.find((s) => s.housekeeperId === 'a')!.floors);
    const floorsB = new Set(summaries.find((s) => s.housekeeperId === 'b')!.floors);
    for (const f of floorsA) assert.equal(floorsB.has(f), false);
  });

  it('gives restant assignee more dirty rooms', () => {
    const rooms = ['101', '102', '103', '104', '105', '106', '107', '108', '109', '110'].map((n) =>
      dirtyRoom(n),
    );
    const restants = [restant('201'), restant('202'), restant('203'), restant('204')];
    const cleaners: EligibleCleaner[] = [
      { housekeeperId: 'rest', isLateShift: false, roomWeight: 1 },
      { housekeeperId: 'full', isLateShift: false, roomWeight: 1 },
    ];
    const { summaries } = balanceDailyCleaningAssignments([...rooms, ...restants], cleaners, {
      preferredRestantId: 'rest',
    });
    const rest = summaries.find((s) => s.housekeeperId === 'rest')!;
    const full = summaries.find((s) => s.housekeeperId === 'full')!;
    assert.equal(rest.restantCount, 4);
    assert.ok(rest.roomCount > full.roomCount);
  });

  it('keeps pinned dirty rooms on their assignee when targets recarve the rest', () => {
    const rooms = [
      dirtyRoom('101', true, 'b'),
      dirtyRoom('102'),
      dirtyRoom('103'),
      dirtyRoom('104'),
    ];
    const cleaners: EligibleCleaner[] = [
      { housekeeperId: 'a', isLateShift: false, roomWeight: 1 },
      { housekeeperId: 'b', isLateShift: false, roomWeight: 1 },
    ];
    const { assignments } = balanceDailyCleaningAssignments(rooms, cleaners, {
      dirtyRoomTargets: new Map([
        ['a', 1],
        ['b', 3],
      ]),
    });
    assert.equal(assignments.find((a) => a.key === 'r-101')?.housekeeperId, 'b');
    assert.equal(assignments.filter((a) => a.housekeeperId === 'b').length, 3);
    assert.equal(assignments.filter((a) => a.housekeeperId === 'a').length, 1);
  });

  it('respects explicit dirty room targets', () => {
    const rooms = ['101', '102', '103', '104', '105', '106'].map((n) => dirtyRoom(n));
    const cleaners: EligibleCleaner[] = [
      { housekeeperId: 'a', isLateShift: false, roomWeight: 1 },
      { housekeeperId: 'b', isLateShift: false, roomWeight: 1 },
    ];
    const { summaries } = balanceDailyCleaningAssignments(rooms, cleaners, {
      dirtyRoomTargets: new Map([
        ['a', 4],
        ['b', 2],
      ]),
    });
    assert.equal(summaries.find((s) => s.housekeeperId === 'a')!.roomCount, 4);
    assert.equal(summaries.find((s) => s.housekeeperId === 'b')!.roomCount, 2);
  });

  it('redistributes unlocked people by rules when one count is locked', () => {
    const rooms = Array.from({ length: 9 }, (_, i) => dirtyRoom(String(101 + i)));
    const cleaners: EligibleCleaner[] = [
      { housekeeperId: 'a', isLateShift: false, roomWeight: 1 },
      { housekeeperId: 'b', isLateShift: false, roomWeight: 1 },
      { housekeeperId: 'late', isLateShift: true, roomWeight: 0.55 },
    ];
    const { summaries } = balanceDailyCleaningAssignments(rooms, cleaners, {
      dirtyRoomTargets: new Map([['a', 2]]),
    });
    assert.equal(summaries.find((s) => s.housekeeperId === 'a')!.roomCount, 2);
    const b = summaries.find((s) => s.housekeeperId === 'b')!.roomCount;
    const late = summaries.find((s) => s.housekeeperId === 'late')!.roomCount;
    assert.equal(b + late, 7);
    assert.ok(b > late);
  });

  it('split restant holders each get more dirty than a solo restant holder would leave others', () => {
    const rooms = Array.from({ length: 12 }, (_, i) => dirtyRoom(String(101 + i)));
    const restants = [restant('201'), restant('202'), restant('203'), restant('204')];
    const cleaners: EligibleCleaner[] = [
      { housekeeperId: 'a', isLateShift: false, roomWeight: 1 },
      { housekeeperId: 'b', isLateShift: false, roomWeight: 1 },
      { housekeeperId: 'c', isLateShift: false, roomWeight: 1 },
    ];
    const { summaries } = balanceDailyCleaningAssignments([...rooms, ...restants], cleaners, {
      preferredRestantIds: ['a', 'b'],
    });
    const a = summaries.find((s) => s.housekeeperId === 'a')!;
    const b = summaries.find((s) => s.housekeeperId === 'b')!;
    const c = summaries.find((s) => s.housekeeperId === 'c')!;
    assert.ok(a.restantCount > 0 && b.restantCount > 0);
    assert.equal(c.restantCount, 0);
    assert.ok(a.roomCount >= c.roomCount);
    assert.ok(b.roomCount >= c.roomCount);
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
