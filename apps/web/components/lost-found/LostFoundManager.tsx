'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import imageCompression from 'browser-image-compression';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { LOST_FOUND_BOXES } from '@/lib/lostFoundBoxes';
import { useOverlayKeyboard } from '@/lib/hooks/useOverlayKeyboard';
import { useDebouncedValue } from '@/lib/command-registry';
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
  /** Skip AppPageChrome — use inside ReceptionMobileShell (already has a header). */
  embedded = false,
}: {
  title?: string;
  subtitle?: string;
  tone?: 'light' | 'dark';
  onEnterMobile?: () => void;
  embedded?: boolean;
}) {
  const t = useTranslations('lostFound');
  const pageTitle = title ?? t('title');
  const pageSubtitle = subtitle ?? t('subtitle');
  const dark = tone === 'dark';
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('unsorted');
  const [q, setQ] = useState('');
  const debouncedQ = useDebouncedValue(q, 280);
  const [boxFilter, setBoxFilter] = useState<string>('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const { data: raw = [], isLoading } = useQuery({
    queryKey: ['lost-found', debouncedQ],
    queryFn: () => {
      const params = new URLSearchParams();
      if (debouncedQ.trim()) params.set('q', debouncedQ.trim());
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
    <div className={clsx('space-y-4 md:space-y-6', dark ? 'p-3 pb-24 sm:p-4 md:p-6 md:pb-6' : 'p-4 md:p-8')}>
      {!dark && (
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink md:text-3xl">{pageTitle}</h1>
            <p className="mt-1 text-sm text-ink-muted">{pageSubtitle}</p>
          </div>
          <Button variant="action" className="min-h-[44px]" onClick={() => setAddOpen(true)}>
            {t('addItem')}
          </Button>
        </div>
      )}

      {embedded && (
        <div className="sm:hidden">
          <h1 className={clsx('text-lg font-semibold tracking-tight', dark ? 'text-white' : 'text-ink')}>
            {pageTitle}
          </h1>
          {pageSubtitle ? (
            <p className={clsx('mt-0.5 text-xs', dark ? 'text-sidebar-muted' : 'text-ink-muted')}>
              {pageSubtitle}
            </p>
          ) : null}
        </div>
      )}

      <div
        className={clsx(
          'sticky top-0 z-20 -mx-3 space-y-3 px-3 py-2 sm:-mx-4 sm:px-4 md:static md:mx-0 md:bg-transparent md:px-0 md:py-0',
          dark ? 'bg-[#121a26]/95 backdrop-blur-sm' : 'bg-surface-muted/95 backdrop-blur-sm md:bg-transparent',
        )}
      >
        <div
          className={clsx(
            '-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
            'border-b md:mx-0 md:flex-wrap md:overflow-visible md:px-0',
            dark ? 'border-sidebar-border/60' : 'border-border',
          )}
        >
          <TabButton dark={dark} active={tab === 'unsorted'} onClick={() => setTab('unsorted')} label={t('tabUnsorted')} count={counts.unsorted} />
          <TabButton dark={dark} active={tab === 'stored'} onClick={() => setTab('stored')} label={t('tabStored')} count={counts.stored} />
          <TabButton dark={dark} active={tab === 'archive'} onClick={() => setTab('archive')} label={t('tabArchive')} count={counts.archive} />
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <input
            type="search"
            enterKeyHint="search"
            placeholder={t('searchPlaceholder')}
            className={clsx(
              'min-h-[44px] w-full flex-1 rounded-btn px-3 text-base sm:min-h-[40px] sm:text-sm md:max-w-xs',
              dark ? APP_DARK_INPUT : 'border border-border bg-surface',
            )}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {tab === 'stored' && (
            <select
              className={clsx(
                'min-h-[44px] w-full rounded-btn px-3 text-base sm:min-h-[40px] sm:w-auto sm:text-sm',
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
          {dark && !embedded && (
            <Button
              variant="action"
              className="hidden min-h-[44px] sm:inline-flex"
              onClick={() => setAddOpen(true)}
            >
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

      {(embedded || dark) && (
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className={clsx(
            'fixed right-4 z-40 inline-flex h-14 min-w-[3.5rem] items-center justify-center rounded-full bg-action px-5 text-sm font-semibold text-white shadow-lift',
            embedded
              ? 'bottom-[calc(4.5rem+env(safe-area-inset-bottom))]'
              : 'bottom-[calc(1.25rem+env(safe-area-inset-bottom))] sm:hidden',
          )}
          aria-label={t('addItem')}
        >
          {t('addItemShort')}
        </button>
      )}
    </div>
  );

  if (embedded) {
    return <div className="flex min-h-0 flex-1 flex-col">{body}</div>;
  }

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
        'shrink-0 rounded-full px-3.5 py-2.5 text-sm font-medium transition-colors md:rounded-t-md md:rounded-b-none',
        dark
          ? active
            ? 'bg-action text-white'
            : 'bg-white/5 text-sidebar-muted hover:bg-white/10 hover:text-white'
          : active
            ? 'bg-ink text-white'
            : 'bg-surface-muted/70 text-ink-muted hover:bg-surface-muted',
      )}
    >
      {label}{' '}
      <span
        className={clsx(
          'ml-1 inline-flex min-w-[22px] justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold',
          active ? 'bg-white/20 text-white' : dark ? 'bg-white/10 text-sidebar-muted' : 'bg-surface text-ink-muted',
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
      {items.map((item) => {
        const meta = (
          <>
            <p className={clsx('font-medium leading-snug', dark ? 'text-white' : 'text-ink')}>
              {item.description}
            </p>
            <p className={clsx('mt-1 text-xs', dark ? 'text-sidebar-muted' : 'text-ink-muted')}>
              {item.room ? t('room', { roomNumber: item.room.roomNumber }) : t('noRoom')}
              {item.reportedBy?.name ? ` · ${t('reportedBy', { name: item.reportedBy.name })}` : ''}
            </p>
            <p className={clsx('mt-1 text-xs', dark ? 'text-sidebar-muted' : 'text-ink-muted')}>
              {item.foundAt
                ? t('found', { when: new Date(item.foundAt).toLocaleString() })
                : t('foundNotReported')}
            </p>
          </>
        );
        const thumb = (
          <button
            type="button"
            onClick={() => onOpen(item.id)}
            className={clsx(
              'flex h-20 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-md sm:h-24 sm:w-24',
              dark ? 'bg-black/20' : 'bg-surface-muted',
            )}
          >
            {item.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.photoUrl}
                alt={item.description}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
            ) : (
              <span className={clsx('text-[10px]', dark ? 'text-sidebar-muted' : 'text-ink-muted')}>
                {t('noPhoto')}
              </span>
            )}
          </button>
        );

        return (
          <li key={item.id}>
            <div
              className={clsx(
                dark ? APP_DARK_CARD : undefined,
                'flex flex-col gap-3 p-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4 sm:p-4',
                !dark && 'rounded-card border border-border bg-surface shadow-card',
              )}
            >
              <div className="flex min-w-0 flex-1 items-start gap-3">
                {thumb}
                <button type="button" onClick={() => onOpen(item.id)} className="min-w-0 flex-1 text-left">
                  {meta}
                </button>
              </div>
              <BoxPicker
                dark={dark}
                className="w-full sm:ml-auto sm:w-auto sm:min-w-[11rem]"
                disabled={pending}
                placeholder={t('storeInBox')}
                value=""
                onChange={(box) => onStore(item.id, box)}
              />
            </div>
          </li>
        );
      })}
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
    <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={() => onOpen(item.id)}
            className={clsx(
              'group flex w-full overflow-hidden text-left transition sm:block',
              dark
                ? clsx(APP_DARK_CARD, 'p-0 hover:border-action/40')
                : 'rounded-card border border-border bg-surface shadow-card hover:shadow-lift',
            )}
          >
            <div
              className={clsx(
                'flex h-24 w-24 shrink-0 items-center justify-center sm:aspect-[4/3] sm:h-auto sm:w-full',
                dark ? 'bg-black/20 text-sidebar-muted' : 'bg-surface-muted text-ink-muted',
              )}
            >
              {item.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.photoUrl}
                  alt={item.description}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="px-2 text-center text-[10px] sm:text-xs">{t('noPhoto')}</span>
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col justify-center p-3 sm:p-4">
              <div className="flex items-start justify-between gap-2">
                <p className={clsx('font-medium leading-snug', dark ? 'text-white' : 'text-ink')}>
                  {item.description}
                </p>
                {item.storedLocation && (
                  <span
                    className={clsx(
                      'shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold',
                      dark ? 'bg-action/20 text-action' : 'bg-action/10 text-action',
                    )}
                  >
                    {item.storedLocation}
                  </span>
                )}
              </div>
              <p className={clsx('mt-1.5 text-xs sm:mt-2', dark ? 'text-sidebar-muted' : 'text-ink-muted')}>
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
                    'mt-2 inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-medium capitalize sm:mt-3',
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
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  dark?: boolean;
  className?: string;
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
        'min-h-[44px] rounded-btn px-3 text-base sm:min-h-[40px] sm:text-sm',
        dark ? APP_DARK_INPUT : 'border border-border bg-surface',
        className,
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
    <div
      className={clsx(
        'fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4',
        dark ? 'bg-black/60' : 'bg-ink/40',
      )}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={clsx(
          'flex max-h-[min(94vh,920px)] w-full max-w-2xl flex-col overflow-hidden rounded-t-card sm:rounded-card',
          dark ? APP_DARK_CARD : 'border border-border bg-surface shadow-lift',
        )}
      >
        <div className="flex justify-center pt-2 sm:hidden" aria-hidden>
          <span className={clsx('h-1 w-10 rounded-full', dark ? 'bg-white/25' : 'bg-ink/20')} />
        </div>
        <div
          className={clsx(
            'flex shrink-0 items-start justify-between border-b px-4 py-3 sm:px-5 sm:py-4',
            dark ? 'border-sidebar-border/60' : 'border-border',
          )}
        >
          <div className="min-w-0 pr-3">
            <h2 className={clsx('text-lg font-semibold', dark ? 'text-white' : 'text-ink')}>
              {t('detailTitle')}
            </h2>
            <p className={clsx('mt-1 text-xs capitalize', dark ? 'text-sidebar-muted' : 'text-ink-muted')}>
              {t('statusLabel', { status: lfStatusLabel(item.status, t) })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={clsx(
              'min-h-[44px] shrink-0 rounded-md px-3 text-sm',
              dark ? 'text-sidebar-muted hover:bg-white/10 hover:text-white' : 'text-ink-muted hover:bg-surface-muted',
            )}
          >
            {tCommon('close')}
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-4 sm:grid sm:grid-cols-5 sm:gap-6 sm:space-y-0 sm:p-5">
          <div className="sm:col-span-2">
            <div
              className={clsx(
                'flex aspect-[4/3] items-center justify-center overflow-hidden rounded-card sm:aspect-square',
                dark ? 'bg-black/20' : 'bg-surface-muted',
              )}
            >
              {item.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.photoUrl} alt={item.description} className="h-full w-full object-cover" />
              ) : (
                <span className={clsx('text-sm', dark ? 'text-sidebar-muted' : 'text-ink-muted')}>
                  {t('noPhoto')}
                </span>
              )}
            </div>
          </div>
          <div className="space-y-4 sm:col-span-3">
            <div>
              <p
                className={clsx(
                  'text-[11px] font-semibold uppercase tracking-wide',
                  dark ? 'text-sidebar-muted' : 'text-ink-muted',
                )}
              >
                {t('description')}
              </p>
              <p className={clsx('mt-1 whitespace-pre-wrap text-sm', dark ? 'text-slate-100' : 'text-ink')}>
                {item.description}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <DetailRow
                dark={dark}
                label={t('foundLabel')}
                value={item.foundAt ? new Date(item.foundAt).toLocaleString() : t('foundNone')}
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
              <p
                className={clsx(
                  'text-[11px] font-semibold uppercase tracking-wide',
                  dark ? 'text-sidebar-muted' : 'text-ink-muted',
                )}
              >
                {t('storageBox')}
              </p>
              <div className="mt-1.5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                <BoxPicker
                  dark={dark}
                  className="w-full sm:w-auto"
                  value={item.storedLocation ?? ''}
                  onChange={(box) => {
                    // Don't reopen claimed/closed items just because the box changed.
                    if (item.status === 'FOUND' || item.status === 'STORED') {
                      onPatch({ status: 'STORED', storedLocation: box });
                    } else {
                      onPatch({ storedLocation: box });
                    }
                  }}
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
              <p
                className={clsx(
                  'text-[11px] font-semibold uppercase tracking-wide',
                  dark ? 'text-sidebar-muted' : 'text-ink-muted',
                )}
              >
                {t('status')}
              </p>
              <select
                disabled={pending}
                value={item.status}
                onChange={(e) => {
                  const next = e.target.value as (typeof STATUSES)[number];
                  if (next === 'STORED' && !item.storedLocation) {
                    // Force a box via BoxPicker — don't land in "stored" without location.
                    e.target.value = item.status;
                    return;
                  }
                  onPatch({ status: next });
                }}
                className={clsx(
                  'mt-1.5 min-h-[44px] w-full rounded-btn px-3 text-base sm:min-h-[40px] sm:w-auto sm:text-sm',
                  dark ? APP_DARK_INPUT : 'border border-border bg-surface',
                )}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s} disabled={s === 'STORED' && !item.storedLocation}>
                    {lfStatusLabel(s, t)}
                  </option>
                ))}
              </select>
              {!item.storedLocation && (
                <p className={clsx('mt-1.5 text-xs', dark ? 'text-sidebar-muted' : 'text-ink-muted')}>
                  {t('storeRequiresBox')}
                </p>
              )}
            </div>

            <label
              className={clsx(
                'flex min-h-[44px] items-start gap-3 text-sm',
                dark ? 'text-white' : 'text-ink',
              )}
            >
              <input
                type="checkbox"
                className="mt-1 h-5 w-5"
                checked={!!item.guestContactedAt}
                disabled={pending}
                onChange={(e) => onPatch({ guestContacted: e.target.checked })}
              />
              <span>
                {t('guestContacted')}
                {item.guestContactedAt && (
                  <span className={clsx('mt-0.5 block text-xs', dark ? 'text-sidebar-muted' : 'text-ink-muted')}>
                    {t('guestContactedOn', { when: new Date(item.guestContactedAt).toLocaleString() })}
                  </span>
                )}
              </span>
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
    <div
      className={clsx(
        'fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4',
        dark ? 'bg-black/60' : 'bg-ink/40',
      )}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={clsx(
          'flex max-h-[min(94vh,720px)] w-full max-w-md flex-col overflow-hidden rounded-t-card sm:rounded-card',
          dark ? APP_DARK_CARD : 'border border-border bg-surface shadow-lift',
        )}
      >
        <div className="flex justify-center pt-2 sm:hidden" aria-hidden>
          <span className={clsx('h-1 w-10 rounded-full', dark ? 'bg-white/25' : 'bg-ink/20')} />
        </div>
        <div className={clsx('shrink-0 border-b px-4 py-3 sm:px-5 sm:py-4', dark ? 'border-sidebar-border/60' : 'border-border')}>
          <h2 className={clsx('text-lg font-semibold', dark ? 'text-white' : 'text-ink')}>{t('addTitle')}</h2>
          <p className={clsx('mt-1 text-xs', dark ? 'text-sidebar-muted' : 'text-ink-muted')}>
            {t('addSubtitle')}
          </p>
        </div>
        <form onSubmit={onSubmit} className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 sm:p-5">
          <div>
            <label className={clsx('text-sm font-medium', dark ? 'text-white' : 'text-ink')}>
              {t('descriptionRequired')}
            </label>
            <textarea
              className={clsx(
                'mt-1.5 w-full rounded-btn px-3 py-2.5 text-base sm:text-sm',
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
            <label className={clsx('text-sm font-medium', dark ? 'text-white' : 'text-ink')}>
              {t('storageBoxOptional')}
            </label>
            <select
              className={clsx(
                'mt-1.5 min-h-[44px] w-full rounded-btn px-3 text-base sm:min-h-[40px] sm:text-sm',
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
            <label className={clsx('text-sm font-medium', dark ? 'text-white' : 'text-ink')}>
              {t('photoOptional')}
            </label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                className={clsx(
                  'min-h-[44px]',
                  dark ? 'border-sidebar-border bg-transparent text-white hover:bg-white/10' : undefined,
                )}
                onClick={() => fileRef.current?.click()}
              >
                {file ? t('changePhoto') : t('addPhoto')}
              </Button>
              {file && (
                <span className={clsx('text-xs', dark ? 'text-sidebar-muted' : 'text-ink-muted')}>
                  {file.name}
                </span>
              )}
            </div>
          </div>
          {error && <p className={clsx('text-sm', dark ? 'text-rose-300' : 'text-danger')}>{error}</p>}
          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:flex-wrap sm:gap-3 sm:pt-2">
            <Button type="submit" variant="action" className="min-h-[48px] w-full sm:w-auto" disabled={submit.isPending}>
              {submit.isPending ? t('saving') : t('saveItem')}
            </Button>
            <Button
              type="button"
              variant={dark ? 'ghostOnDark' : 'ghost'}
              className="min-h-[44px] w-full sm:w-auto"
              onClick={onClose}
            >
              {tCommon('cancel')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
