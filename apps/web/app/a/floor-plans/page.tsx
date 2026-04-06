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
  const [copyFromFloor, setCopyFromFloor] = useState<number>(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
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
  const { data: allPlans = [] } = useQuery({
    queryKey: ['admin-floor-plans-all'],
    queryFn: () => api<PlanRow[]>('/floor-plans'),
  });

  const [draft, setDraft] = useState<LayoutElement[]>([]);
  const sourceLayout = useMemo(() => plan?.layout ?? [], [plan?.updatedAt, floor]);

  useEffect(() => {
    setDraft(sourceLayout);
  }, [floor, plan?.updatedAt, sourceLayout]);

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
      setSaveError(null);
      setSaveMessage(`Saved ${layoutLabel(floor)} layout.`);
      qc.invalidateQueries({ queryKey: ['admin-floor-plan', floor] });
      qc.invalidateQueries({ queryKey: ['floor-plan-layout', floor] });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : 'Unknown save error';
      setSaveMessage(null);
      setSaveError(msg);
    },
  });

  function layoutLabel(f: number) {
    return formatFloorLabel(f);
  }

  function addElement(el: LayoutElement) {
    setSelectedId(el.id);
    setDraft((prev) => [...prev, el]);
  }

  function addElementFromDrop(kind: LayoutElement['kind'], dropX: number, dropY: number, room?: string) {
    const baseW = kind === 'corridor' ? 6 : kind === 'glass' ? 4 : 2;
    const baseH = kind === 'corridor' ? 2 : 1;
    const el: LayoutElement = {
      id: newId(),
      kind,
      x: Math.max(1, Math.min(GRID_COLS, dropX)),
      y: Math.max(1, Math.min(GRID_ROWS, dropY)),
      w: baseW,
      h: baseH,
      roomNumber: kind === 'room' ? room || undefined : undefined,
    };
    addElement(el);
  }

  function updateEl(id: string, patch: Partial<LayoutElement>) {
    setDraft((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function removeEl(id: string) {
    setDraft((prev) => prev.filter((p) => p.id !== id));
  }

  function remapRoomNumber(roomNumber: string | undefined, fromFloor: number, toFloor: number): string | undefined {
    if (!roomNumber) return roomNumber;
    const n = parseInt(roomNumber, 10);
    if (!Number.isFinite(n)) return roomNumber;
    if (fromFloor >= 1 && toFloor >= 1) {
      if (n >= fromFloor * 100 && n < (fromFloor + 1) * 100) {
        const suffix = n - fromFloor * 100;
        return String(toFloor * 100 + suffix);
      }
      if (n >= 100 && n < 1000) {
        const suffix = n % 100;
        return String(toFloor * 100 + suffix);
      }
    }
    return roomNumber;
  }

  function copyLayoutFromFloor() {
    const src = allPlans.find((p) => p.floor === copyFromFloor);
    if (!src?.layout?.length) return;
    const copied = src.layout.map((el) => ({
      ...el,
      id: newId(),
      roomNumber: el.kind === 'room' ? remapRoomNumber(el.roomNumber, copyFromFloor, floor) : undefined,
    }));
    setDraft(copied);
    setSelectedId(null);
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
          <label className="text-xs text-ink-muted">
            Copy from floor
            <select
              className="mt-1 min-h-[40px] rounded-btn border border-border bg-surface px-3 text-sm"
              value={copyFromFloor}
              onChange={(e) => setCopyFromFloor(parseInt(e.target.value, 10))}
            >
              {FLOOR_CHOICES.filter((f) => f !== floor).map((f) => (
                <option key={f} value={f}>
                  {formatFloorLabel(f)}
                </option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            variant="secondary"
            onClick={copyLayoutFromFloor}
            disabled={!allPlans.some((p) => p.floor === copyFromFloor && p.layout.length > 0)}
          >
            Use this floor's layout
          </Button>
          <Button type="button" variant="action" disabled={save.isPending} onClick={() => save.mutate(draft)}>
            {save.isPending ? 'Saving…' : 'Save floor plan'}
          </Button>
        </div>
        {saveMessage && <p className="text-sm text-success">{saveMessage}</p>}
        {saveError && <p className="whitespace-pre-wrap text-sm text-danger">{saveError}</p>}

        <div className="space-y-3">
          <p className="text-xs text-ink-muted">Drag elements from the toolbox and drop them on the floor plan. Move elements by dragging; resize with the bottom-right handle.</p>
          <div className="flex flex-wrap gap-2">
            {(['corridor', 'elevator', 'staff', 'glass'] as const).map((t) => (
              <button
                key={t}
                type="button"
                draggable
                onDragStart={(e) => {
                  const payload = JSON.stringify({ kind: t });
                  e.dataTransfer.setData('application/x-floor-element', payload);
                  e.dataTransfer.setData('text/plain', payload);
                }}
                className="rounded-btn border border-border bg-surface px-3 py-2 text-sm font-medium text-ink"
              >
                {t}
              </button>
            ))}
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-ink-muted">Rooms (drag into plan)</p>
            <div className="flex max-h-36 flex-wrap gap-2 overflow-auto rounded-btn border border-border bg-surface p-2">
              {roomOptions.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    const payload = JSON.stringify({ kind: 'room', roomNumber: r.roomNumber });
                    e.dataTransfer.setData('application/x-floor-element', payload);
                    e.dataTransfer.setData('text/plain', payload);
                  }}
                  className="rounded-btn border border-border bg-surface-muted px-2 py-1 text-sm font-semibold text-ink"
                >
                  {r.roomNumber}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-ink">Preview ({formatFloorLabel(floor)})</h2>
        <div className="overflow-x-auto">
          <div
            ref={containerRef}
            className="relative min-w-[1100px] rounded-btn border border-border bg-surface-muted/30"
            style={{ height: 540 }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const raw =
                e.dataTransfer.getData('application/x-floor-element') ||
                e.dataTransfer.getData('text/plain');
              if (!raw) return;
              try {
                const parsed = JSON.parse(raw) as { kind: LayoutElement['kind']; roomNumber?: string };
                const rect = e.currentTarget.getBoundingClientRect();
                const cellW = rect.width / GRID_COLS;
                const cellH = rect.height / GRID_ROWS;
                const gx = Math.round((e.clientX - rect.left) / cellW);
                const gy = Math.round((e.clientY - rect.top) / cellH);
                addElementFromDrop(parsed.kind, gx, gy, parsed.roomNumber);
              } catch {
                // ignore invalid drag payload
              }
            }}
          >
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
            <div key={el.id} className="grid items-end gap-2 rounded-btn border border-border p-2 md:grid-cols-4">
              <span className="text-xs text-ink-muted">{el.id.slice(0, 8)}</span>
              <select className="min-h-[36px] rounded-btn border border-border bg-surface px-2 text-sm" value={el.kind} onChange={(e) => updateEl(el.id, { kind: e.target.value as LayoutElement['kind'] })}>
                <option value="room">room</option>
                <option value="corridor">corridor</option>
                <option value="elevator">elevator</option>
                <option value="staff">staff</option>
                <option value="glass">glass</option>
              </select>
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
