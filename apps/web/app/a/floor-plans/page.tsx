'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatFloorLabel } from '@housekeeping/shared';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

type LayoutElement = {
  id: string;
  kind: 'room' | 'staff' | 'elevator' | 'corridor' | 'glass';
  x: number;
  y: number;
  w: number;
  h: number;
  roomNumber?: string;
};

type RoomRow = { id: string; roomNumber: string; floor: number | null };
type PlanRow = { floor: number; layout: LayoutElement[]; updatedAt: string };

const FLOOR_CHOICES = [-1, 0, 1, 2, 3, 4, 5, 6, 7];
const GRID_COLS = 30;
const GRID_ROWS = 14;

function newId() {
  return `el-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export default function AdminFloorPlansPage() {
  const qc = useQueryClient();
  const [floor, setFloor] = useState<number>(2);
  const [kind, setKind] = useState<LayoutElement['kind']>('room');
  const [x, setX] = useState(1);
  const [y, setY] = useState(1);
  const [w, setW] = useState(2);
  const [h, setH] = useState(1);
  const [roomNumber, setRoomNumber] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<{
    id: string;
    mode: 'move' | 'resize';
    startClientX: number;
    startClientY: number;
    origin: LayoutElement;
  } | null>(null);

  const { data: rooms = [] } = useQuery({
    queryKey: ['rooms', 'admin-floor-plans'],
    queryFn: () => api<RoomRow[]>('/rooms'),
  });

  const { data: plan } = useQuery({
    queryKey: ['admin-floor-plan', floor],
    queryFn: () => api<PlanRow | null>(`/floor-plans/${floor}`),
  });

  const [draft, setDraft] = useState<LayoutElement[]>([]);
  const sourceLayout = plan?.layout ?? [];

  useEffect(() => {
    setDraft(sourceLayout);
  }, [floor, sourceLayout]);

  const roomOptions = useMemo(
    () =>
      rooms
        .filter((r) => r.floor === floor)
        .sort((a, b) => parseInt(a.roomNumber, 10) - parseInt(b.roomNumber, 10)),
    [rooms, floor],
  );

  const save = useMutation({
    mutationFn: (layout: LayoutElement[]) =>
      api(`/floor-plans/${floor}`, {
        method: 'PUT',
        body: JSON.stringify({ layout }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-floor-plan', floor] });
      qc.invalidateQueries({ queryKey: ['floor-plan-layout', floor] });
    },
  });

  function addElement() {
    const el: LayoutElement = {
      id: newId(),
      kind,
      x,
      y,
      w,
      h,
      roomNumber: kind === 'room' ? roomNumber || undefined : undefined,
    };
    setDraft((prev) => [...prev, el]);
  }

  function updateEl(id: string, patch: Partial<LayoutElement>) {
    setDraft((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function removeEl(id: string) {
    setDraft((prev) => prev.filter((p) => p.id !== id));
  }

  useEffect(() => {
    if (!drag) return;
    const current = drag;
    function onMove(e: MouseEvent) {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cellW = rect.width / GRID_COLS;
      const cellH = rect.height / GRID_ROWS;
      const dx = Math.round((e.clientX - current.startClientX) / cellW);
      const dy = Math.round((e.clientY - current.startClientY) / cellH);
      if (current.mode === 'move') {
        updateEl(current.id, {
          x: Math.max(1, Math.min(GRID_COLS, current.origin.x + dx)),
          y: Math.max(1, Math.min(GRID_ROWS, current.origin.y + dy)),
        });
      } else {
        const nextW = Math.max(1, current.origin.w + dx);
        const nextH = Math.max(1, current.origin.h + dy);
        updateEl(current.id, {
          w: Math.min(GRID_COLS, nextW),
          h: Math.min(GRID_ROWS, nextH),
        });
      }
    }
    function onUp() {
      setDrag(null);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [drag]);

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Floor plan builder</h1>
        <p className="mt-1 text-sm text-ink-muted">Admin category to create custom floor plans (rooms, corridors, elevators, staff areas).</p>
      </div>

      <Card className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-ink-muted">
            Floor
            <select
              className="mt-1 min-h-[40px] rounded-btn border border-border bg-surface px-3 text-sm"
              value={floor}
              onChange={(e) => setFloor(parseInt(e.target.value, 10))}
            >
              {FLOOR_CHOICES.map((f) => (
                <option key={f} value={f}>
                  {formatFloorLabel(f)}
                </option>
              ))}
            </select>
          </label>
          <Button type="button" variant="secondary" onClick={() => setDraft(sourceLayout)}>
            Reload saved
          </Button>
          <Button type="button" variant="action" disabled={save.isPending} onClick={() => save.mutate(draft)}>
            {save.isPending ? 'Saving…' : 'Save floor plan'}
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-7">
          <label className="text-xs text-ink-muted">
            Type
            <select
              className="mt-1 min-h-[40px] w-full rounded-btn border border-border bg-surface px-3 text-sm"
              value={kind}
              onChange={(e) => setKind(e.target.value as LayoutElement['kind'])}
            >
              <option value="room">Room</option>
              <option value="corridor">Corridor</option>
              <option value="elevator">Elevator</option>
              <option value="staff">Staff</option>
              <option value="glass">Glass</option>
            </select>
          </label>
          <label className="text-xs text-ink-muted">
            X
            <input className="mt-1 min-h-[40px] w-full rounded-btn border border-border bg-surface px-3 text-sm" type="number" value={x} onChange={(e) => setX(parseInt(e.target.value || '1', 10))} />
          </label>
          <label className="text-xs text-ink-muted">
            Y
            <input className="mt-1 min-h-[40px] w-full rounded-btn border border-border bg-surface px-3 text-sm" type="number" value={y} onChange={(e) => setY(parseInt(e.target.value || '1', 10))} />
          </label>
          <label className="text-xs text-ink-muted">
            W
            <input className="mt-1 min-h-[40px] w-full rounded-btn border border-border bg-surface px-3 text-sm" type="number" value={w} onChange={(e) => setW(parseInt(e.target.value || '1', 10))} />
          </label>
          <label className="text-xs text-ink-muted">
            H
            <input className="mt-1 min-h-[40px] w-full rounded-btn border border-border bg-surface px-3 text-sm" type="number" value={h} onChange={(e) => setH(parseInt(e.target.value || '1', 10))} />
          </label>
          <label className="text-xs text-ink-muted md:col-span-2">
            Room (for type=room)
            <select
              className="mt-1 min-h-[40px] w-full rounded-btn border border-border bg-surface px-3 text-sm"
              value={roomNumber}
              onChange={(e) => setRoomNumber(e.target.value)}
              disabled={kind !== 'room'}
            >
              <option value="">Select room</option>
              {roomOptions.map((r) => (
                <option key={r.id} value={r.roomNumber}>
                  {r.roomNumber}
                </option>
              ))}
            </select>
          </label>
        </div>

        <Button type="button" variant="secondary" onClick={addElement}>
          Add element
        </Button>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-ink">Preview ({formatFloorLabel(floor)})</h2>
        <div className="overflow-x-auto">
          <div ref={containerRef} className="relative min-w-[1100px] rounded-btn border border-border bg-surface-muted/30" style={{ height: 540 }}>
            {draft.map((el) => {
              const left = `${((el.x - 1) / GRID_COLS) * 100}%`;
              const top = `${((el.y - 1) / GRID_ROWS) * 100}%`;
              const width = `${(el.w / GRID_COLS) * 100}%`;
              const height = `${(el.h / GRID_ROWS) * 100}%`;
              const base =
                el.kind === 'room'
                  ? 'rounded-md border-2 border-border bg-surface text-center text-sm font-semibold text-ink'
                  : el.kind === 'corridor'
                    ? 'rounded-md border border-border/50 bg-surface-muted/45'
                    : el.kind === 'glass'
                      ? 'rounded-md border border-cyan-400/70 bg-cyan-100/40 text-center text-xs font-semibold text-cyan-900'
                    : el.kind === 'elevator'
                      ? 'rounded-md border border-dashed border-border bg-surface text-center text-xs text-ink-muted'
                      : 'rounded-md border border-border bg-surface text-center text-xs font-semibold text-ink-muted';
              return (
                <div
                  key={el.id}
                  className={`absolute ${base} ${selectedId === el.id ? 'ring-2 ring-action' : ''} cursor-move`}
                  style={{ left, top, width, height }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setSelectedId(el.id);
                    setDrag({
                      id: el.id,
                      mode: 'move',
                      startClientX: e.clientX,
                      startClientY: e.clientY,
                      origin: el,
                    });
                  }}
                >
                  {el.kind === 'room'
                    ? el.roomNumber || 'Room'
                    : el.kind === 'elevator'
                      ? 'Elevator'
                      : el.kind === 'staff'
                        ? 'Staff'
                        : el.kind === 'glass'
                          ? 'Glass'
                          : ''}
                  <button
                    type="button"
                    className="absolute bottom-0 right-0 h-3 w-3 cursor-se-resize rounded-tl border border-border bg-surface"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSelectedId(el.id);
                      setDrag({
                        id: el.id,
                        mode: 'resize',
                        startClientX: e.clientX,
                        startClientY: e.clientY,
                        origin: el,
                      });
                    }}
                    aria-label="Resize"
                  />
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-ink">Elements</h2>
        <div className="space-y-2">
          {draft.map((el) => (
            <div key={el.id} className="grid items-end gap-2 rounded-btn border border-border p-2 md:grid-cols-8">
              <span className="text-xs text-ink-muted">{el.id.slice(0, 8)}</span>
              <select className="min-h-[36px] rounded-btn border border-border bg-surface px-2 text-sm" value={el.kind} onChange={(e) => updateEl(el.id, { kind: e.target.value as LayoutElement['kind'] })}>
                <option value="room">room</option>
                <option value="corridor">corridor</option>
                <option value="elevator">elevator</option>
                <option value="staff">staff</option>
                <option value="glass">glass</option>
              </select>
              <input className="min-h-[36px] rounded-btn border border-border bg-surface px-2 text-sm" type="number" value={el.x} onChange={(e) => updateEl(el.id, { x: parseInt(e.target.value || '1', 10) })} />
              <input className="min-h-[36px] rounded-btn border border-border bg-surface px-2 text-sm" type="number" value={el.y} onChange={(e) => updateEl(el.id, { y: parseInt(e.target.value || '1', 10) })} />
              <input className="min-h-[36px] rounded-btn border border-border bg-surface px-2 text-sm" type="number" value={el.w} onChange={(e) => updateEl(el.id, { w: parseInt(e.target.value || '1', 10) })} />
              <input className="min-h-[36px] rounded-btn border border-border bg-surface px-2 text-sm" type="number" value={el.h} onChange={(e) => updateEl(el.id, { h: parseInt(e.target.value || '1', 10) })} />
              <input
                className="min-h-[36px] rounded-btn border border-border bg-surface px-2 text-sm"
                placeholder="roomNumber"
                value={el.roomNumber ?? ''}
                onChange={(e) => updateEl(el.id, { roomNumber: e.target.value || undefined })}
                disabled={el.kind !== 'room'}
              />
              <Button type="button" variant="danger" onClick={() => removeEl(el.id)}>
                Delete
              </Button>
            </div>
          ))}
          {draft.length === 0 && <p className="text-sm text-ink-muted">No elements yet for this floor.</p>}
        </div>
      </Card>
    </div>
  );
}
