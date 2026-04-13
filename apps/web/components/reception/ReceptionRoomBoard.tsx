'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { formatUserWithTitlePrefix } from '@/lib/userTitlePrefix';
import { StatusBadge } from '@/components/StatusBadge';
import { Card } from '@/components/ui/Card';
import { useReceptionUi } from '@/app/r/reception-context';

export type RoomBoardRow = {
  id: string;
  roomNumber: string;
  floor: number | null;
  derivedStatus: string;
  checklist: { tasks: { status: string }[] } | null;
};

type AssignmentRow = {
  roomId: string;
  housekeeper: { id: string; name: string; titlePrefix: string };
};

type ReqRow = {
  id: string;
  roomId: string;
  priority: string;
  status: string;
};

type Props = {
  compact?: boolean;
};

export function ReceptionRoomBoard({ compact }: Props) {
  const { openRoom } = useReceptionUi();
  const [view, setView] = useState<'grid' | 'table'>('grid');
  const [floor, setFloor] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [groupBy, setGroupBy] = useState<'none' | 'floor' | 'status'>('none');

  const { data: rooms = [], isLoading } = useQuery({
    queryKey: ['rooms', 'reception'],
    queryFn: () => api<RoomBoardRow[]>('/rooms'),
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ['assignments'],
    queryFn: () => api<AssignmentRow[]>('/assignments'),
  });

  const { data: requests = [] } = useQuery({
    queryKey: ['service-requests'],
    queryFn: () => api<ReqRow[]>('/service-requests'),
  });

  const assignByRoom = useMemo(
    () =>
      Object.fromEntries(
        assignments.map((a) => [
          a.roomId,
          formatUserWithTitlePrefix(a.housekeeper.name, a.housekeeper.titlePrefix),
        ]),
      ),
    [assignments],
  );

  const urgentByRoom = useMemo(() => {
    const s = new Set<string>();
    for (const r of requests) {
      if (r.priority !== 'URGENT') continue;
      if (['RESOLVED', 'CANCELLED'].includes(r.status)) continue;
      s.add(r.roomId);
    }
    return s;
  }, [requests]);

  const floors = useMemo(() => {
    const set = new Set<number>();
    rooms.forEach((r) => {
      if (r.floor != null) set.add(r.floor);
    });
    return Array.from(set).sort((a, b) => a - b);
  }, [rooms]);

  const filtered = useMemo(() => {
    return rooms.filter((r) => {
      if (floor && String(r.floor ?? '') !== floor) return false;
      if (status && r.derivedStatus !== status) return false;
      if (search && !r.roomNumber.toLowerCase().includes(search.trim().toLowerCase())) return false;
      return true;
    });
  }, [rooms, floor, status, search]);

  const grouped = useMemo(() => {
    if (groupBy === 'none') return [{ key: 'All rooms', items: filtered }];
    if (groupBy === 'floor') {
      const m = new Map<string, RoomBoardRow[]>();
      filtered.forEach((r) => {
        const k = r.floor != null ? `Floor ${r.floor}` : 'No floor';
        if (!m.has(k)) m.set(k, []);
        m.get(k)!.push(r);
      });
      return Array.from(m.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, items]) => ({ key, items }));
    }
    const m = new Map<string, RoomBoardRow[]>();
    filtered.forEach((r) => {
      const k = r.derivedStatus;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    });
    return Array.from(m.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, items]) => ({ key, items }));
  }, [filtered, groupBy]);

  function RoomTile({ r }: { r: RoomBoardRow }) {
    const total = r.checklist?.tasks.length ?? 0;
    const done = r.checklist?.tasks.filter((t) => t.status === 'COMPLETED').length ?? 0;
    const pct = total ? Math.round((done / total) * 100) : 0;
    const hk = assignByRoom[r.id];
    const urgent = urgentByRoom.has(r.id);

    return (
      <button
        type="button"
        onClick={() => openRoom(r.id)}
        className={`w-full rounded-card border bg-surface p-4 text-left shadow-card transition-all hover:border-ink/20 hover:shadow-lift ${
          urgent ? 'border-danger/40 ring-1 ring-danger/15' : 'border-border'
        } ${compact ? 'p-3' : ''}`}
      >
        <div className="flex items-start justify-between gap-2">
          <span className={`font-semibold text-ink ${compact ? 'text-lg' : 'text-2xl'}`}>{r.roomNumber}</span>
          <StatusBadge status={r.derivedStatus} />
        </div>
        {r.floor != null && <p className="mt-1 text-xs text-ink-muted">Floor {r.floor}</p>}
        <div className="mt-3">
          <div className="flex justify-between text-[11px] text-ink-muted">
            <span>Progress</span>
            <span>
              {done}/{total}
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-muted">
            <div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-ink-muted">HK: {hk ?? '—'}</span>
          {urgent && (
            <span className="rounded-full bg-danger-muted px-2 py-0.5 font-medium text-danger">Urgent</span>
          )}
        </div>
      </button>
    );
  }

  if (isLoading) {
    return <p className="text-sm text-ink-muted">Loading rooms…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Search</label>
          <input
            type="search"
            placeholder="Room #"
            className="mt-1 min-h-[40px] min-w-[140px] rounded-btn border border-border bg-surface px-3 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Floor</label>
          <select
            className="mt-1 min-h-[40px] min-w-[120px] rounded-btn border border-border bg-surface px-3 text-sm"
            value={floor}
            onChange={(e) => setFloor(e.target.value)}
          >
            <option value="">All</option>
            {floors.map((f) => (
              <option key={f} value={String(f)}>
                {f}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Status</label>
          <select
            className="mt-1 min-h-[40px] min-w-[140px] rounded-btn border border-border bg-surface px-3 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All</option>
            <option value="DIRTY">Dirty</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="CLEAN">Clean</option>
            <option value="INSPECTED">Inspected</option>
            <option value="OUT_OF_ORDER">Out of order</option>
          </select>
        </div>
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Group</label>
          <select
            className="mt-1 min-h-[40px] min-w-[140px] rounded-btn border border-border bg-surface px-3 text-sm"
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as typeof groupBy)}
          >
            <option value="none">None</option>
            <option value="floor">By floor</option>
            <option value="status">By status</option>
          </select>
        </div>
        <div className="ml-auto flex rounded-lg border border-border p-0.5">
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${view === 'grid' ? 'bg-ink text-white' : 'text-ink-muted'}`}
            onClick={() => setView('grid')}
          >
            Grid
          </button>
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${view === 'table' ? 'bg-ink text-white' : 'text-ink-muted'}`}
            onClick={() => setView('table')}
          >
            Table
          </button>
        </div>
      </div>

      {view === 'grid' &&
        grouped.map((g) => (
          <section key={g.key}>
            {groupBy !== 'none' && (
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-muted">{g.key}</h3>
            )}
            <div
              className={`grid gap-3 ${compact ? 'sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4' : 'sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6'}`}
            >
              {g.items.map((r) => (
                <RoomTile key={r.id} r={r} />
              ))}
            </div>
          </section>
        ))}

      {view === 'table' && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-border bg-surface-muted/80 text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Room</th>
                <th className="px-4 py-3 font-semibold">Floor</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Progress</th>
                <th className="px-4 py-3 font-semibold">Housekeeper</th>
                <th className="px-4 py-3 font-semibold">Flags</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const total = r.checklist?.tasks.length ?? 0;
                const done = r.checklist?.tasks.filter((t) => t.status === 'COMPLETED').length ?? 0;
                const pct = total ? Math.round((done / total) * 100) : 0;
                const urgent = urgentByRoom.has(r.id);
                return (
                  <tr
                    key={r.id}
                    className="cursor-pointer border-b border-border/80 hover:bg-surface-muted/50"
                    onClick={() => openRoom(r.id)}
                  >
                    <td className="px-4 py-3 font-semibold text-ink">{r.roomNumber}</td>
                    <td className="px-4 py-3 text-ink-muted">{r.floor ?? '—'}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.derivedStatus} />
                    </td>
                    <td className="px-4 py-3 text-ink-muted">
                      {done}/{total} ({pct}%)
                    </td>
                    <td className="px-4 py-3 text-ink-muted">{assignByRoom[r.id] ?? '—'}</td>
                    <td className="px-4 py-3">
                      {urgent && (
                        <span className="rounded-full bg-danger-muted px-2 py-0.5 text-xs font-medium text-danger">
                          Urgent
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
