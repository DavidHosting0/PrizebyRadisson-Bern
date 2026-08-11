'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import imageCompression from 'browser-image-compression';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { LOST_FOUND_BOXES } from '@/lib/lostFoundBoxes';
import { useOverlayKeyboard } from '@/lib/hooks/useOverlayKeyboard';
import { AppPageChrome, AppPageBody, APP_DARK_CARD, APP_DARK_INPUT } from '@/components/nav/AppPageChrome';
import { AppChromeTools } from '@/components/nav/AppChromeTools';

type Lf = {
  id: string;
  description: string;
  status: 'FOUND' | 'STORED' | 'CLAIMED' | 'CLOSED';
  foundAt: string | null;
  storedAt: string | null;
  guestContactedAt: string | null;
  storedLocation: string | null;
  photoS3Key: string | null;
  photoUrl?: string | null;
  createdAt: string;
  room: { roomNumber: string } | null;
  reportedBy?: { name?: string | null; email?: string | null } | null;
};

type Tab = 'unsorted' | 'stored' | 'archive';

const STATUSES = ['FOUND', 'STORED', 'CLAIMED', 'CLOSED'] as const;

function lfStatusLabel(
  status: (typeof STATUSES)[number],
  t: ReturnType<typeof useTranslations<'lostFound'>>,
) {
  switch (status) {
    case 'FOUND':
      return t('statusFound');
    case 'STORED':
      return t('statusStored');
    case 'CLAIMED':
      return t('statusClaimed');
    case 'CLOSED':
      return t('statusClosed');
    default:
      return status;
  }
}

export function LostFoundManager({
  title,
  subtitle,
  tone = 'light',
  onEnterMobile,
}: {
  title?: string;
  subtitle?: string;
  tone?: 'light' | 'dark';
  onEnterMobile?: () => void;
}) {
  const t = useTranslations('lostFound');
  const pageTitle = title ?? t('title');
  const pageSubtitle = subtitle ?? t('subtitle');
  const dark = tone === 'dark';
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('unsorted');
  const [q, setQ] = useState('');
  const [boxFilter, setBoxFilter] = useState<string>('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const { data: raw = [], isLoading } = useQuery({
    queryKey: ['lost-found', q],
    queryFn: () => {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      const s = params.toString();
      return api<Lf[]>(`/lost-found${s ? `?${s}` : ''}`);
    },
  });

  const items = useMemo(() => {
    const sorted = [...raw].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    if (tab === 'unsorted') {
      return sorted.filter((i) => i.status === 'FOUND' && !i.storedAt);
    }
    if (tab === 'stored') {
      return sorted.filter(
        (i) => i.status === 'STORED' && (!boxFilter || i.storedLocation === boxFilter),
      );
    }
    return sorted.filter((i) => i.status === 'CLAIMED' || i.status === 'CLOSED');
  }, [raw, tab, boxFilter]);

  const counts = useMemo(() => {
    return {
      unsorted: raw.filter((i) => i.status === 'FOUND' && !i.storedAt).length,
      stored: raw.filter((i) => i.status === 'STORED').length,
      archive: raw.filter((i) => i.status === 'CLAIMED' || i.status === 'CLOSED').length,
    };
  }, [raw]);

  const boxCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of raw) {
      if (i.status === 'STORED' && i.storedLocation) {
        map.set(i.storedLocation, (map.get(i.storedLocation) ?? 0) + 1);
      }
    }
    return map;
  }, [raw]);

  const patch = useMutation({
    mutationFn: (payload: { id: string; body: Record<string, unknown> }) =>
      api<Lf>(`/lost-found/${payload.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload.body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lost-found'] }),
  });

  const selected = useMemo(
    () => raw.find((i) => i.id === selectedId) ?? null,
    [raw, selectedId],
  );

  const body = (
    <div className={clsx('space-y-6', dark ? 'p-4 md:p-6' : 'p-4 md:p-8')}>
      {!dark && (
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink md:text-3xl">{pageTitle}</h1>
            <p className="mt-1 text-sm text-ink-muted">{pageSubtitle}</p>
          </div>
          <Button variant="action" onClick={() => setAddOpen(true)}>
            {t('addItem')}
          </Button>
        </div>
      )}

      <div
        className={clsx(
          'flex flex-wrap items-center gap-2 border-b pb-2',
          dark ? 'border-sidebar-border/60' : 'border-border',
        )}
      >
        <TabButton dark={dark} active={tab === 'unsorted'} onClick={() => setTab('unsorted')} label={t('tabUnsorted')} count={counts.unsorted} />
        <TabButton dark={dark} active={tab === 'stored'} onClick={() => setTab('stored')} label={t('tabStored')} count={counts.stored} />
        <TabButton dark={dark} active={tab === 'archive'} onClick={() => setTab('archive')} label={t('tabArchive')} count={counts.archive} />
        <div className="ml-auto flex flex-wrap gap-2">
          <input
            type="search"
            placeholder={t('searchPlaceholder')}
            className={clsx(
              'min-h-[36px] w-56 rounded-btn px-3 text-sm',
              dark ? APP_DARK_INPUT : 'border border-border bg-surface',
            )}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {tab === 'stored' && (
            <select
              className={clsx(
                'min-h-[36px] rounded-btn px-2 text-sm',
                dark ? APP_DARK_INPUT : 'border border-border bg-surface',
              )}
              value={boxFilter}
              onChange={(e) => setBoxFilter(e.target.value)}
            >
              <option value="">{t('allBoxes')}</option>
              {LOST_FOUND_BOXES.map((b) => (
                <option key={b} value={b}>
                  {b} ({boxCounts.get(b) ?? 0})
                </option>
              ))}
            </select>
          )}
          {dark && (
            <Button variant="action" onClick={() => setAddOpen(true)}>
              {t('addItem')}
            </Button>
          )}
        </div>
      </div>

      {isLoading && <p className={clsx('text-sm', dark ? 'text-sidebar-muted' : 'text-ink-muted')}>{t('loading')}</p>}

      {tab === 'unsorted' && (
        <UnsortedList
          dark={dark}
          items={items}
          onOpen={(id) => setSelectedId(id)}
          onStore={(id, box) => patch.mutate({ id, body: { status: 'STORED', storedLocation: box } })}
          pending={patch.isPending}
        />
      )}

      {tab === 'stored' && <StoredGrid dark={dark} items={items} onOpen={(id) => setSelectedId(id)} />}

      {tab === 'archive' && <StoredGrid dark={dark} items={items} onOpen={(id) => setSelectedId(id)} showStatus />}

      {items.length === 0 && !isLoading && (
        <p className={clsx('text-sm', dark ? 'text-sidebar-muted' : 'text-ink-muted')}>
          {tab === 'unsorted'
            ? t('emptyUnsorted')
            : tab === 'stored'
              ? t('emptyStored')
              : t('emptyArchive')}
        </p>
      )}

      {selected && (
        <ItemDetailModal
          item={selected}
          dark={dark}
          onClose={() => setSelectedId(null)}
          onPatch={(body) => patch.mutate({ id: selected.id, body })}
          pending={patch.isPending}
        />
      )}

      {addOpen && <AddItemModal dark={dark} onClose={() => setAddOpen(false)} />}
    </div>
  );

  if (dark) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <AppPageChrome
          title={pageTitle}
          description={pageSubtitle}
          actions={<AppChromeTools onEnterMobile={onEnterMobile} />}
        />
        <AppPageBody>{body}</AppPageBody>
      </div>
    );
  }

  return body;
}

function TabButton({
  active,
  onClick,
  label,
  count,
  dark,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  dark?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'rounded-t-md px-3 py-2 text-sm font-medium transition-colors',
        dark
          ? active
            ? 'bg-action text-white'
            : 'text-sidebar-muted hover:bg-white/10 hover:text-white'
          : active
            ? 'bg-ink text-white'
            : 'text-ink-muted hover:bg-surface-muted',
      )}
    >
      {label}{' '}
      <span
        className={clsx(
          'ml-1 inline-flex min-w-[22px] justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold',
          active ? 'bg-white/20 text-white' : dark ? 'bg-white/10 text-sidebar-muted' : 'bg-surface-muted text-ink-muted',
        )}
      >
        {count}
      </span>
    </button>
  );
}

function UnsortedList({
  items,
  onOpen,
  onStore,
  pending,
  dark,
}: {
  items: Lf[];
  onOpen: (id: string) => void;
  onStore: (id: string, box: string) => void;
  pending: boolean;
  dark?: boolean;
}) {
  const t = useTranslations('lostFound');

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.id}>
          {dark ? (
            <div className={clsx(APP_DARK_CARD, 'flex flex-wrap items-center gap-4 p-4')}>
              <button
                type="button"
                onClick={() => onOpen(item.id)}
                className="flex h-20 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-md bg-black/20"
              >
                {item.photoUrl ? (
                  <img src={item.photoUrl} alt={item.description} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-[10px] text-sidebar-muted">{t('noPhoto')}</span>
                )}
              </button>
              <button
                type="button"
                onClick={() => onOpen(item.id)}
                className="min-w-[200px] flex-1 text-left"
              >
                <p className="font-medium text-white">{item.description}</p>
                <p className="mt-1 text-xs text-sidebar-muted">
                  {item.room ? t('room', { roomNumber: item.room.roomNumber }) : t('noRoom')}
                  {item.reportedBy?.name ? ` · ${t('reportedBy', { name: item.reportedBy.name })}` : ''}
                </p>
                <p className="mt-1 text-xs text-sidebar-muted">
                  {item.foundAt
                    ? t('found', { when: new Date(item.foundAt).toLocaleString() })
                    : t('foundNotReported')}
                </p>
              </button>
              <BoxPicker
                dark
                disabled={pending}
                placeholder={t('storeInBox')}
                value=""
                onChange={(box) => onStore(item.id, box)}
              />
            </div>
          ) : (
            <Card className="flex flex-wrap items-center gap-4 p-4">
              <button
                type="button"
                onClick={() => onOpen(item.id)}
                className="flex h-20 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-muted"
              >
                {item.photoUrl ? (
                  <img src={item.photoUrl} alt={item.description} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-[10px] text-ink-muted">{t('noPhoto')}</span>
                )}
              </button>
              <button
                type="button"
                onClick={() => onOpen(item.id)}
                className="min-w-[200px] flex-1 text-left"
              >
                <p className="font-medium text-ink">{item.description}</p>
                <p className="mt-1 text-xs text-ink-muted">
                  {item.room ? t('room', { roomNumber: item.room.roomNumber }) : t('noRoom')}
                  {item.reportedBy?.name ? ` · ${t('reportedBy', { name: item.reportedBy.name })}` : ''}
                </p>
                <p className="mt-1 text-xs text-ink-muted">
                  {item.foundAt
                    ? t('found', { when: new Date(item.foundAt).toLocaleString() })
                    : t('foundNotReported')}
                </p>
              </button>
              <BoxPicker
                disabled={pending}
                placeholder={t('storeInBox')}
                value=""
                onChange={(box) => onStore(item.id, box)}
              />
            </Card>
          )}
        </li>
      ))}
    </ul>
  );
}

function StoredGrid({
  items,
  onOpen,
  showStatus,
  dark,
}: {
  items: Lf[];
  onOpen: (id: string) => void;
  showStatus?: boolean;
  dark?: boolean;
}) {
  const t = useTranslations('lostFound');
  const tCommon = useTranslations('common');

  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={() => onOpen(item.id)}
            className={clsx(
              'group block w-full overflow-hidden text-left transition',
              dark
                ? clsx(APP_DARK_CARD, 'p-0 hover:border-action/40')
                : 'rounded-card border border-border bg-surface shadow-card hover:shadow-lift',
            )}
          >
            <div
              className={clsx(
                'flex aspect-[4/3] items-center justify-center',
                dark ? 'bg-black/20 text-sidebar-muted' : 'bg-surface-muted text-ink-muted',
              )}
            >
              {item.photoUrl ? (
                <img src={item.photoUrl} alt={item.description} className="h-full w-full object-cover" />
              ) : (
                <span className="text-xs">{t('noPhoto')}</span>
              )}
            </div>
            <div className="p-4">
              <div className="flex items-start justify-between gap-2">
                <p className={clsx('font-medium leading-snug', dark ? 'text-white' : 'text-ink')}>{item.description}</p>
                {item.storedLocation && (
                  <span
                    className={clsx(
                      'rounded-md px-2 py-0.5 text-xs font-semibold',
                      dark ? 'bg-action/20 text-action' : 'bg-action/10 text-action',
                    )}
                  >
                    {item.storedLocation}
                  </span>
                )}
              </div>
              <p className={clsx('mt-2 text-xs', dark ? 'text-sidebar-muted' : 'text-ink-muted')}>
                {t('stored', {
                  when: item.storedAt ? new Date(item.storedAt).toLocaleString() : '—',
                })}
              </p>
              <p className={clsx('mt-1 text-xs', dark ? 'text-sidebar-muted' : 'text-ink-muted')}>
                {t('guestContactedYesNo', {
                  value: item.guestContactedAt ? tCommon('yes') : tCommon('no'),
                })}
              </p>
              {showStatus && (
                <span
                  className={clsx(
                    'mt-3 inline-flex rounded-full px-2.5 py-1 text-xs font-medium capitalize',
                    dark ? 'bg-white/10 text-sidebar-muted' : 'bg-surface-muted text-ink-muted',
                  )}
                >
                  {lfStatusLabel(item.status, t)}
                </span>
              )}
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

function BoxPicker({
  value,
  onChange,
  disabled,
  placeholder,
  dark,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  dark?: boolean;
}) {
  const t = useTranslations('lostFound');

  return (
    <select
      disabled={disabled}
      value={value}
      onChange={(e) => {
        if (e.target.value) onChange(e.target.value);
      }}
      className={clsx(
        'min-h-[40px] rounded-btn px-3 text-sm',
        dark ? APP_DARK_INPUT : 'border border-border bg-surface',
      )}
    >
      <option value="">{placeholder ?? t('selectBox')}</option>
      {LOST_FOUND_BOXES.map((b) => (
        <option key={b} value={b}>
          {t('boxOption', { box: b })}
        </option>
      ))}
    </select>
  );
}

function ItemDetailModal({
  item,
  dark,
  onClose,
  onPatch,
  pending,
}: {
  item: Lf;
  dark?: boolean;
  onClose: () => void;
  onPatch: (body: Record<string, unknown>) => void;
  pending: boolean;
}) {
  const t = useTranslations('lostFound');
  const tCommon = useTranslations('common');
  const panelRef = useRef<HTMLDivElement>(null);
  useOverlayKeyboard({ open: true, onClose, containerRef: panelRef });

  return (
    <div className={clsx('fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center', dark ? 'bg-black/60' : 'bg-ink/40')}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        className={clsx(
          'max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-card sm:rounded-card',
          dark ? APP_DARK_CARD : 'border border-border bg-surface shadow-lift',
        )}
      >
        <div className={clsx('flex items-start justify-between border-b px-5 py-4', dark ? 'border-sidebar-border/60' : 'border-border')}>
          <div>
            <h2 className={clsx('text-lg font-semibold', dark ? 'text-white' : 'text-ink')}>{t('detailTitle')}</h2>
            <p className={clsx('mt-1 text-xs capitalize', dark ? 'text-sidebar-muted' : 'text-ink-muted')}>
              {t('statusLabel', { status: lfStatusLabel(item.status, t) })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={clsx(
              'rounded-md px-2 py-1 text-sm',
              dark ? 'text-sidebar-muted hover:bg-white/10 hover:text-white' : 'text-ink-muted hover:bg-surface-muted',
            )}
          >
            {tCommon('close')}
          </button>
        </div>
        <div className="grid gap-6 p-5 md:grid-cols-5">
          <div className="md:col-span-2">
            <div className={clsx('flex aspect-square items-center justify-center overflow-hidden rounded-card', dark ? 'bg-black/20' : 'bg-surface-muted')}>
              {item.photoUrl ? (
                <img src={item.photoUrl} alt={item.description} className="h-full w-full object-cover" />
              ) : (
                <span className={clsx('text-sm', dark ? 'text-sidebar-muted' : 'text-ink-muted')}>{t('noPhoto')}</span>
              )}
            </div>
          </div>
          <div className="space-y-4 md:col-span-3">
            <div>
              <p className={clsx('text-[11px] font-semibold uppercase tracking-wide', dark ? 'text-sidebar-muted' : 'text-ink-muted')}>
                {t('description')}
              </p>
              <p className={clsx('mt-1 whitespace-pre-wrap text-sm', dark ? 'text-slate-100' : 'text-ink')}>{item.description}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <DetailRow
                dark={dark}
                label={t('foundLabel')}
                value={
                  item.foundAt ? new Date(item.foundAt).toLocaleString() : t('foundNone')
                }
              />
              <DetailRow
                dark={dark}
                label={t('storedLabel')}
                value={item.storedAt ? new Date(item.storedAt).toLocaleString() : t('notInStorage')}
              />
              <DetailRow
                dark={dark}
                label={t('roomLabel')}
                value={item.room ? t('room', { roomNumber: item.room.roomNumber }) : '—'}
              />
              <DetailRow
                dark={dark}
                label={t('reportedByLabel')}
                value={item.reportedBy?.name ?? item.reportedBy?.email ?? '—'}
              />
            </div>

            <div>
              <p className={clsx('text-[11px] font-semibold uppercase tracking-wide', dark ? 'text-sidebar-muted' : 'text-ink-muted')}>
                {t('storageBox')}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <BoxPicker
                  dark={dark}
                  value={item.storedLocation ?? ''}
                  onChange={(box) => onPatch({ status: 'STORED', storedLocation: box })}
                  disabled={pending}
                />
                {item.storedLocation && (
                  <span className={clsx('text-xs', dark ? 'text-sidebar-muted' : 'text-ink-muted')}>
                    {t('currentlyIn', { box: item.storedLocation })}
                  </span>
                )}
              </div>
            </div>

            <div>
              <p className={clsx('text-[11px] font-semibold uppercase tracking-wide', dark ? 'text-sidebar-muted' : 'text-ink-muted')}>
                {t('status')}
              </p>
              <select
                disabled={pending}
                value={item.status}
                onChange={(e) => onPatch({ status: e.target.value })}
                className={clsx(
                  'mt-1.5 min-h-[40px] rounded-btn px-3 text-sm',
                  dark ? APP_DARK_INPUT : 'border border-border bg-surface',
                )}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {lfStatusLabel(s, t)}
                  </option>
                ))}
              </select>
            </div>

            <label className={clsx('flex items-center gap-2 text-sm', dark ? 'text-white' : 'text-ink')}>
              <input
                type="checkbox"
                checked={!!item.guestContactedAt}
                disabled={pending}
                onChange={(e) => onPatch({ guestContacted: e.target.checked })}
              />
              {t('guestContacted')}
              {item.guestContactedAt && (
                <span className={clsx('text-xs', dark ? 'text-sidebar-muted' : 'text-ink-muted')}>
                  {t('guestContactedOn', { when: new Date(item.guestContactedAt).toLocaleString() })}
                </span>
              )}
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value, dark }: { label: string; value: string; dark?: boolean }) {
  return (
    <div>
      <p className={clsx('text-[11px] font-semibold uppercase tracking-wide', dark ? 'text-sidebar-muted' : 'text-ink-muted')}>
        {label}
      </p>
      <p className={clsx('mt-1 text-sm', dark ? 'text-slate-100' : 'text-ink')}>{value}</p>
    </div>
  );
}

function AddItemModal({ dark, onClose }: { dark?: boolean; onClose: () => void }) {
  const t = useTranslations('lostFound');
  const tCommon = useTranslations('common');
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [description, setDescription] = useState('');
  const [box, setBox] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  useOverlayKeyboard({ open: true, onClose, containerRef: panelRef });

  const submit = useMutation({
    mutationFn: async () => {
      setError(null);
      const desc = description.trim();
      if (!desc) throw new Error(t('errorDescriptionRequired'));

      let photoS3Key: string | null = null;
      if (file) {
        const compressed = await imageCompression(file, { maxSizeMB: 0.6, maxWidthOrHeight: 1600 });
        const mime = compressed.type?.trim() ? compressed.type : 'image/jpeg';
        const presign = await api<{ uploadUrl: string; key: string }>('/lost-found/presign', {
          method: 'POST',
          body: JSON.stringify({ contentType: mime }),
        });
        const putRes = await fetch(presign.uploadUrl, {
          method: 'PUT',
          body: compressed,
          headers: { 'Content-Type': mime },
        });
        if (!putRes.ok) throw new Error(t('errorUploadPhoto'));
        photoS3Key = presign.key;
      }

      await api('/lost-found', {
        method: 'POST',
        body: JSON.stringify({
          description: desc,
          photoS3Key,
          status: box ? 'STORED' : 'FOUND',
          storedLocation: box || null,
        }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lost-found'] });
      onClose();
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : t('errorAddItem'));
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    submit.mutate();
  }

  return (
    <div className={clsx('fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center', dark ? 'bg-black/60' : 'bg-ink/40')}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        className={clsx(
          'max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-card sm:rounded-card',
          dark ? APP_DARK_CARD : 'border border-border bg-surface shadow-lift',
        )}
      >
        <div className={clsx('border-b px-5 py-4', dark ? 'border-sidebar-border/60' : 'border-border')}>
          <h2 className={clsx('text-lg font-semibold', dark ? 'text-white' : 'text-ink')}>{t('addTitle')}</h2>
          <p className={clsx('mt-1 text-xs', dark ? 'text-sidebar-muted' : 'text-ink-muted')}>
            {t('addSubtitle')}
          </p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4 p-5">
          <div>
            <label className={clsx('text-sm font-medium', dark ? 'text-white' : 'text-ink')}>{t('descriptionRequired')}</label>
            <textarea
              className={clsx(
                'mt-1.5 w-full rounded-btn px-3 py-2.5 text-sm',
                dark ? APP_DARK_INPUT : 'border border-border bg-surface',
              )}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder={t('descriptionPlaceholder')}
              required
            />
          </div>
          <div>
            <label className={clsx('text-sm font-medium', dark ? 'text-white' : 'text-ink')}>{t('storageBoxOptional')}</label>
            <select
              className={clsx(
                'mt-1.5 min-h-[40px] w-full rounded-btn px-3 text-sm',
                dark ? APP_DARK_INPUT : 'border border-border bg-surface',
              )}
              value={box}
              onChange={(e) => setBox(e.target.value)}
            >
              <option value="">{t('leaveUnsorted')}</option>
              {LOST_FOUND_BOXES.map((b) => (
                <option key={b} value={b}>
                  {t('boxOption', { box: b })}
                </option>
              ))}
            </select>
            <p className={clsx('mt-1 text-xs', dark ? 'text-sidebar-muted' : 'text-ink-muted')}>
              {t('boxMarksStored')}
            </p>
          </div>
          <div>
            <label className={clsx('text-sm font-medium', dark ? 'text-white' : 'text-ink')}>{t('photoOptional')}</label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                className={dark ? 'border-sidebar-border bg-transparent text-white hover:bg-white/10' : undefined}
                onClick={() => fileRef.current?.click()}
              >
                {file ? t('changePhoto') : t('addPhoto')}
              </Button>
              {file && <span className={clsx('text-xs', dark ? 'text-sidebar-muted' : 'text-ink-muted')}>{file.name}</span>}
            </div>
          </div>
          {error && <p className={clsx('text-sm', dark ? 'text-rose-300' : 'text-danger')}>{error}</p>}
          <div className="flex flex-wrap gap-3 pt-2">
            <Button type="submit" variant="action" disabled={submit.isPending}>
              {submit.isPending ? t('saving') : t('saveItem')}
            </Button>
            <Button type="button" variant={dark ? 'ghostOnDark' : 'ghost'} onClick={onClose}>
              {tCommon('cancel')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
