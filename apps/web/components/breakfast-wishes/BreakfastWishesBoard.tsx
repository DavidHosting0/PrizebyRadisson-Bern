'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import {
  BREAKFAST_WISH_TAGS,
  type BreakfastSpecialWishDto,
} from '@housekeeping/shared';
import { api } from '@/lib/api';
import { usePermission } from '@/lib/auth-context';
import { roomsListQueryOptions } from '@/lib/rooms-query';
import { Button } from '@/components/ui/Button';
import { APP_DARK_CARD, APP_DARK_INPUT } from '@/components/nav/AppPageChrome';

type RoomOpt = { id: string; roomNumber: string };

function todayIsoLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function BreakfastWishesBoard() {
  const t = useTranslations('breakfastWishes');
  const tCommon = useTranslations('common');
  const canWrite = usePermission('BREAKFAST_WISHES_WRITE');
  const qc = useQueryClient();
  const [date, setDate] = useState(todayIsoLocal);
  const [statusFilter, setStatusFilter] = useState<'OPEN' | 'DONE' | 'ALL'>('OPEN');
  const [showForm, setShowForm] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const listQ = useQuery({
    queryKey: ['breakfast', 'wishes', date, statusFilter],
    queryFn: () => {
      const status = statusFilter === 'ALL' ? '' : `&status=${statusFilter}`;
      return api<BreakfastSpecialWishDto[]>(`/breakfast/wishes?date=${date}${status}`);
    },
  });

  const { data: roomOpts = [] } = useQuery({
    ...roomsListQueryOptions<RoomOpt>(),
    enabled: showForm,
  });

  const sortedRooms = useMemo(
    () =>
      [...roomOpts].sort((a, b) =>
        a.roomNumber.localeCompare(b.roomNumber, 'de', { numeric: true }),
      ),
    [roomOpts],
  );

  const createMut = useMutation({
    mutationFn: () =>
      api<BreakfastSpecialWishDto>('/breakfast/wishes', {
        method: 'POST',
        body: JSON.stringify({ roomId, serviceDate: date, tags, note: note || null }),
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

  const patchMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'DONE' | 'OPEN' | 'CANCELLED' }) =>
      api(`/breakfast/wishes/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['breakfast', 'wishes'] }),
  });

  function toggleTag(tag: string) {
    setTags((prev) => (prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]));
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!roomId) {
      setErr(t('errorRoomRequired'));
      return;
    }
    if (tags.length === 0) {
      setErr(t('errorTagsRequired'));
      return;
    }
    createMut.mutate();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-sidebar-muted">
          {t('date')}
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={clsx(APP_DARK_INPUT, 'min-h-10')}
          />
        </label>
        <div className="flex gap-1">
          {(['OPEN', 'DONE', 'ALL'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={clsx(
                'rounded-lg px-3 py-2 text-sm font-medium',
                statusFilter === s
                  ? 'bg-white/15 text-white'
                  : 'bg-white/5 text-sidebar-muted hover:bg-white/10',
              )}
            >
              {t(`status.${s}`)}
            </button>
          ))}
        </div>
        {canWrite && (
          <Button
            type="button"
            variant={showForm ? 'secondary' : 'primary'}
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? tCommon('cancel') : t('newWish')}
          </Button>
        )}
      </div>

      {showForm && canWrite && (
        <form
          onSubmit={onSubmit}
          className={clsx(APP_DARK_CARD, 'space-y-3 p-4')}
        >
          <label className="flex flex-col gap-1 text-xs text-sidebar-muted">
            {t('room')}
            <select
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className={clsx(APP_DARK_INPUT, 'min-h-10')}
            >
              <option value="">{t('selectRoom')}</option>
              {sortedRooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.roomNumber}
                </option>
              ))}
            </select>
          </label>
          <div>
            <p className="mb-2 text-xs text-sidebar-muted">{t('tags')}</p>
            <div className="flex flex-wrap gap-2">
              {BREAKFAST_WISH_TAGS.map((tag) => {
                const active = tags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={clsx(
                      'rounded-full px-3 py-1.5 text-xs font-semibold',
                      active
                        ? 'bg-amber-500/25 text-amber-100 ring-1 ring-amber-400/40'
                        : 'bg-white/5 text-sidebar-muted ring-1 ring-white/10',
                    )}
                  >
                    {t(`tag.${tag}`)}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="flex flex-col gap-1 text-xs text-sidebar-muted">
            {t('note')}
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className={clsx(APP_DARK_INPUT, 'resize-y')}
              placeholder={t('notePlaceholder')}
            />
          </label>
          {err && <p className="text-sm text-red-300">{err}</p>}
          <Button type="submit" disabled={createMut.isPending}>
            {t('save')}
          </Button>
        </form>
      )}

      {listQ.isLoading ? (
        <p className="text-sm text-sidebar-muted">{tCommon('loading')}</p>
      ) : (listQ.data ?? []).length === 0 ? (
        <p className="text-sm text-sidebar-muted">{t('empty')}</p>
      ) : (
        <ul className="space-y-2">
          {(listQ.data ?? []).map((w) => (
            <li key={w.id} className={clsx(APP_DARK_CARD, 'flex flex-wrap items-start gap-3 p-4')}>
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold text-white">{w.room.roomNumber}</p>
                <p className="mt-1 text-sm text-amber-100/90">
                  {w.tags
                    .map((tag) =>
                      (BREAKFAST_WISH_TAGS as readonly string[]).includes(tag)
                        ? t(`tag.${tag as (typeof BREAKFAST_WISH_TAGS)[number]}`)
                        : tag,
                    )
                    .join(' · ')}
                </p>
                {w.note && <p className="mt-1 text-sm text-sidebar-muted">{w.note}</p>}
                <p className="mt-2 text-xs text-sidebar-muted">
                  {w.createdBy.name} · {t(`status.${w.status}`)}
                </p>
              </div>
              {canWrite && w.status === 'OPEN' && (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => patchMut.mutate({ id: w.id, status: 'DONE' })}
                  >
                    {t('markDone')}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => patchMut.mutate({ id: w.id, status: 'CANCELLED' })}
                  >
                    {t('cancelWish')}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
