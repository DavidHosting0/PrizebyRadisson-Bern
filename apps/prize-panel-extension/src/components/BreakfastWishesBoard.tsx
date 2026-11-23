'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BREAKFAST_WISH_TAGS,
  type BreakfastSpecialWishDto,
} from '@housekeeping/shared';
import { api } from '@/lib/api';
import { useI18n } from '@/i18n';
import { usePermission } from '@/lib/auth-context';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { DarkSelect } from './ui/DarkSelect';
import { DarkDateInput } from './ui/DarkDateInput';

type RoomOpt = { id: string; roomNumber: string };

function calendarTodayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function BreakfastWishesBoard() {
  const { m } = useI18n();
  const canWrite = usePermission('BREAKFAST_WISHES_WRITE');
  const qc = useQueryClient();
  const [date, setDate] = useState(calendarTodayIso);
  const [showForm, setShowForm] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const tagLabel = (tag: string) => {
    switch (tag) {
      case 'glutenfrei':
        return m.breakfastWishes.tagGlutenfrei;
      case 'vegan':
        return m.breakfastWishes.tagVegan;
      case 'vegetarisch':
        return m.breakfastWishes.tagVegetarisch;
      case 'laktosefrei':
        return m.breakfastWishes.tagLaktosefrei;
      case 'schweinefleischfrei':
        return m.breakfastWishes.tagSchweinefleischfrei;
      case 'allergie':
        return m.breakfastWishes.tagAllergie;
      case 'andere':
        return m.breakfastWishes.tagAndere;
      default:
        return tag;
    }
  };

  const listQ = useQuery({
    queryKey: ['breakfast', 'wishes', date, 'OPEN'],
    queryFn: () =>
      api<BreakfastSpecialWishDto[]>(`/breakfast/wishes?date=${date}&status=OPEN`),
  });

  const roomsQ = useQuery({
    queryKey: ['rooms', 'list'],
    queryFn: () => api<RoomOpt[]>('/rooms'),
    enabled: showForm,
  });

  const roomOptions = useMemo(
    () =>
      [...(roomsQ.data ?? [])]
        .sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, 'de', { numeric: true }))
        .map((r) => ({ value: r.id, label: r.roomNumber })),
    [roomsQ.data],
  );

  const createMut = useMutation({
    mutationFn: () =>
      api('/breakfast/wishes', {
        method: 'POST',
        body: JSON.stringify({
          roomId,
          serviceDate: date,
          tags,
          note: note || null,
        }),
      }),
    onSuccess: () => {
      setTags([]);
      setNote('');
      setRoomId('');
      setShowForm(false);
      setErr(null);
      qc.invalidateQueries({ queryKey: ['breakfast', 'wishes'] });
    },
    onError: (e: Error) => setErr(e.message),
  });

  const doneMut = useMutation({
    mutationFn: (id: string) =>
      api(`/breakfast/wishes/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'DONE' }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['breakfast', 'wishes'] }),
  });

  function toggleTag(tag: string) {
    setTags((prev) => (prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]));
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!roomId || tags.length === 0) {
      setErr(m.breakfastWishes.incomplete);
      return;
    }
    createMut.mutate();
  }

  return (
    <div className="space-y-2 bg-sidebar p-2.5 pb-3">
      <DarkDateInput
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="w-full"
      />

      {canWrite && (
        <Button
          type="button"
          variant={showForm ? 'secondary' : 'action'}
          className="min-h-[28px] w-full text-xs"
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? m.common.cancel : m.breakfastWishes.newWish}
        </Button>
      )}

      {showForm && canWrite && (
        <Card padding>
          <form className="space-y-2" onSubmit={onSubmit}>
            <DarkSelect
              value={roomId}
              onChange={setRoomId}
              options={roomOptions}
              placeholder={m.breakfastWishes.roomPlaceholder}
            />
            <p className="text-[10px] font-medium text-sidebar-muted">
              {m.breakfastWishes.tagsLabel}
            </p>
            <div className="flex flex-wrap gap-1">
              {BREAKFAST_WISH_TAGS.map((tag) => {
                const active = tags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={
                      active
                        ? 'rounded-full bg-amber-500/25 px-2 py-0.5 text-[10px] font-semibold text-amber-100'
                        : 'rounded-full border border-white/15 px-2 py-0.5 text-[10px] text-slate-300'
                    }
                  >
                    {tagLabel(tag)}
                  </button>
                );
              })}
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder={m.breakfastWishes.notePlaceholder}
              className="w-full rounded-md border border-white/15 bg-black/20 px-2 py-1.5 text-xs text-white placeholder:text-sidebar-muted"
            />
            {err && <p className="text-[10px] text-red-300">{err}</p>}
            <Button type="submit" variant="action" className="min-h-[28px] w-full text-xs">
              {m.breakfastWishes.save}
            </Button>
          </form>
        </Card>
      )}

      {listQ.isLoading ? (
        <p className="text-xs text-sidebar-muted">{m.breakfastWishes.loading}</p>
      ) : (listQ.data ?? []).length === 0 ? (
        <p className="text-xs text-sidebar-muted">{m.breakfastWishes.empty}</p>
      ) : (
        <ul className="space-y-1.5">
          {(listQ.data ?? []).map((w) => (
            <li
              key={w.id}
              className="rounded-xl bg-white/[0.06] px-2.5 py-2 ring-1 ring-inset ring-white/10"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold text-white">{w.room.roomNumber}</p>
                  <p className="mt-0.5 text-[10px] text-amber-100/90">
                    {w.tags.map(tagLabel).join(' · ')}
                  </p>
                  {w.note && (
                    <p className="mt-0.5 text-[10px] text-sidebar-muted">{w.note}</p>
                  )}
                </div>
                {canWrite && (
                  <Button
                    type="button"
                    variant="secondary"
                    className="min-h-[24px] shrink-0 px-2 text-[10px]"
                    onClick={() => doneMut.mutate(w.id)}
                  >
                    {m.breakfastWishes.markDone}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
