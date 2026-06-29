'use client';

import { Command } from 'cmdk';
import clsx from 'clsx';
import type { CommandItem } from '@/lib/command-registry';
import { CommandThumb } from '@/components/command/CommandThumb';
import { IconBuilding, IconPackage } from '@/components/nav/nav-icons';

function highlightMatch(text: string, query: string) {
  const q = query.trim();
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded bg-action-muted/80 px-0.5 text-ink">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

export function CommandResultRow({
  item,
  query,
  onSelect,
}: {
  item: CommandItem;
  query: string;
  onSelect: () => void;
}) {
  const Icon = item.icon;

  let leading: React.ReactNode;
  if (item.roomNumber) {
    leading = (
      <CommandThumb
        variant="room"
        roomNumber={item.roomNumber}
        status={item.roomStatus}
        photoUrl={item.imageUrl}
      />
    );
  } else if (item.imageUrl) {
    leading = (
      <CommandThumb
        variant="photo"
        src={item.imageUrl}
        alt={item.label}
        fallbackIcon={Icon ? <Icon className="h-5 w-5" /> : <IconPackage className="h-5 w-5" />}
      />
    );
  } else if (item.initials) {
    leading = <CommandThumb variant="initials" initials={item.initials} />;
  } else if (Icon) {
    leading = <CommandThumb variant="icon" icon={<Icon className="h-[18px] w-[18px]" />} />;
  } else {
    leading = <CommandThumb variant="icon" icon={<IconBuilding className="h-[18px] w-[18px]" />} />;
  }

  return (
    <Command.Item
      value={`${item.id} ${item.label} ${item.subtitle ?? ''} ${(item.keywords ?? []).join(' ')}`}
      onSelect={onSelect}
      className={clsx(
        'group relative flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5',
        'aria-selected:bg-surface-muted data-[selected=true]:bg-surface-muted',
      )}
    >
      <span
        className="absolute left-0 top-1/2 hidden h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-action group-aria-selected:block group-data-[selected=true]:block"
        aria-hidden
      />
      {leading}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{highlightMatch(item.label, query)}</p>
        {item.subtitle && <p className="truncate text-xs text-ink-muted">{item.subtitle}</p>}
      </div>
    </Command.Item>
  );
}

export function CommandSkeletonRows({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-2 px-2 py-1">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex animate-pulse items-center gap-3 rounded-lg px-3 py-2.5">
          <div className="h-10 w-10 rounded-lg bg-surface-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-2/3 rounded bg-surface-muted" />
            <div className="h-2 w-1/2 rounded bg-surface-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}
