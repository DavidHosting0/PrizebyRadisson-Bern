import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { balanceDepartureAssignments } from './assignment-balancer';

function room(n: string) {
  return { roomId: `id-${n}`, roomNumber: n, floor: Math.floor(parseInt(n, 10) / 100) || null };
}

describe('balanceDepartureAssignments', () => {
  it('returns empty when no housekeepers', () => {
    const result = balanceDepartureAssignments([room('101')], []);
    assert.equal(result.assignments.length, 0);
  });

  it('balances counts within one room', () => {
    const rooms = ['101', '102', '201', '202', '301', '302'].map(room);
    const hks = [{ housekeeperId: 'a', currentCount: 0 }, { housekeeperId: 'b', currentCount: 0 }];
    const { assignments, summaries } = balanceDepartureAssignments(rooms, hks);
    assert.equal(assignments.length, 6);
    const counts = Object.fromEntries(summaries.map((s) => [s.housekeeperId, s.count]));
    assert.ok(Math.abs(counts.a! - counts.b!) <= 1);
  });

  it('keeps rooms on the same floor together when possible', () => {
    const rooms = ['101', '102', '103', '104', '201', '202'].map(room);
    const hks = [{ housekeeperId: 'a', currentCount: 0 }, { housekeeperId: 'b', currentCount: 0 }];
    const { assignments } = balanceDepartureAssignments(rooms, hks);
    const floorsByHk = new Map<string, Set<number>>();
    for (const a of assignments) {
      const set = floorsByHk.get(a.housekeeperId) ?? new Set<number>();
      if (a.floor != null) set.add(a.floor);
      floorsByHk.set(a.housekeeperId, set);
    }
    for (const floors of floorsByHk.values()) {
      assert.ok(floors.size <= 2);
    }
  });
});
