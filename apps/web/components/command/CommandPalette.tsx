'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import {
  buildActionCommands,
  buildNavCommands,
  buildQuickNavCommands,
  useDebouncedValue,
  type CommandItem,
} from '@/lib/command-registry';
import { useCommandRecent, type RecentCommandItem } from '@/lib/hooks/useCommandRecent';
import { useCommandSearch } from '@/lib/hooks/useCommandSearch';
import { emitCommandBus } from '@/lib/command-bus';
import { CommandResultRow, CommandSkeletonRows } from '@/components/command/CommandResultRow';
import { IconSearch } from '@/components/nav/nav-icons';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CommandPalette({ open, onOpenChange }: Props) {
  const router = useRouter();
  const { user } = useAuth();
  const tNav = useTranslations('nav');
  const tCmd = useTranslations('commandPalette');
  const tRoom = useTranslations('room.status');
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 280);
  const { recent, pushRecent } = useCommandRecent();

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const recordAndClose = useCallback(
    (item: RecentCommandItem, run: () => void) => {
      pushRecent(item);
      onOpenChange(false);
      setQuery('');
      run();
    },
    [pushRecent, onOpenChange],
  );

  const handleNavigate = useCallback(
    (href: string, item: Omit<CommandItem, 'onSelect'>) => {
      recordAndClose(
        {
          id: item.id,
          type: 'nav',
          label: item.label,
          subtitle: item.subtitle,
          href,
        },
        () => router.push(href),
      );
    },
    [recordAndClose, router],
  );

  const handleEntitySelect = useCallback(
    (item: Omit<CommandItem, 'onSelect'>) => {
      recordAndClose(
        {
          id: item.id,
          type: item.id.split(':')[0] ?? 'entity',
          label: item.label,
          subtitle: item.subtitle,
          href: item.href,
          imageUrl: item.imageUrl,
        },
        () => {
          if (item.action === 'openRoom' && item.roomId) {
            emitCommandBus({ type: 'reception:openRoom', roomId: item.roomId });
            return;
          }
          if (item.href) router.push(item.href);
        },
      );
    },
    [recordAndClose, router],
  );

  const handleAction = useCallback(
    (action: 'newRequest') => {
      if (action === 'newRequest') {
        recordAndClose(
          { id: 'action:newRequest', type: 'action', label: tCmd('actions.newRequest'), action: 'newRequest' },
          () => emitCommandBus({ type: 'reception:openNewRequest' }),
        );
      }
    },
    [recordAndClose, tCmd],
  );

  const quickNav = useMemo(
    () => buildQuickNavCommands(user, (k) => tNav(k), (k) => tCmd(k), handleNavigate),
    [user, tNav, tCmd, handleNavigate],
  );

  const navCommands = useMemo(
    () => buildNavCommands(user, (k) => tNav(k), (k) => tCmd(k), handleNavigate),
    [user, tNav, tCmd, handleNavigate],
  );

  const actionCommands = useMemo(
    () => buildActionCommands(user, (k) => tCmd(k), handleAction),
    [user, tCmd, handleAction],
  );

  const { entityItems, loading } = useCommandSearch(
    user,
    query,
    debouncedQuery,
    (k, v) => tCmd(k, v),
    (k) => tRoom(k),
    handleEntitySelect,
  );

  const recentItems: CommandItem[] = useMemo(
    () =>
      recent.map((r) => ({
        id: `recent:${r.id}`,
        group: tCmd('groups.recent'),
        label: r.label,
        subtitle: r.subtitle,
        imageUrl: r.imageUrl,
        href: r.href,
        onSelect: () => {
          if (r.href) {
            handleNavigate(r.href, { id: r.id, group: '', label: r.label, subtitle: r.subtitle, href: r.href });
          } else if (r.action === 'newRequest') {
            handleAction('newRequest');
          }
        },
      })),
    [recent, tCmd, handleNavigate, handleAction],
  );

  const idleItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filter = (items: CommandItem[]) =>
      q ? items.filter((i) => fuzzyItem(i, q)) : items;
    return [...filter(recentItems), ...filter(quickNav), ...actionCommands];
  }, [query, recentItems, quickNav, actionCommands]);

  const searchNavItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return navCommands.filter((i) => fuzzyItem(i, q));
  }, [query, navCommands]);

  const groupedSearch = useMemo(() => {
    const all = [...searchNavItems, ...entityItems];
    const map = new Map<string, CommandItem[]>();
    for (const item of all) {
      const list = map.get(item.group) ?? [];
      list.push(item);
      map.set(item.group, list);
    }
    return map;
  }, [searchNavItems, entityItems]);

  const showIdle = !query.trim();
  const showSearch = !!query.trim();

  if (!user) return null;

  return (
    <>
      {open && (
        <button
          type="button"
          className="fixed inset-0 z-[80] bg-ink/20 backdrop-blur-sm"
          aria-label={tCmd('close')}
          onClick={() => onOpenChange(false)}
        />
      )}
      <Command.Dialog
        open={open}
        onOpenChange={onOpenChange}
        label={tCmd('title')}
        className="fixed left-1/2 top-[12%] z-[90] w-[min(100vw-1.5rem,32rem)] -translate-x-1/2 overflow-hidden rounded-card border border-border bg-surface shadow-lift page-enter"
      >
        <div className="flex items-center gap-3 border-b border-border px-4">
          <IconSearch className="h-5 w-5 shrink-0 text-ink-muted" />
          <Command.Input
            value={query}
            onValueChange={setQuery}
            placeholder={tCmd('placeholder')}
            className="flex h-14 w-full bg-transparent text-base text-ink outline-none placeholder:text-ink-muted"
          />
          <kbd className="hidden shrink-0 rounded border border-border bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-ink-muted sm:inline">
            ⌘K
          </kbd>
        </div>

        <Command.List className="max-h-[min(60vh,420px)] overflow-y-auto p-2">
          <Command.Empty className="px-4 py-8 text-center text-sm text-ink-muted">
            {showSearch ? tCmd('noResults', { query: query.trim() }) : tCmd('emptyHint')}
          </Command.Empty>

          {showIdle && idleItems.length > 0 && (
            <Command.Group
              heading={tCmd('groups.suggestions')}
              className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-ink-muted"
            >
              {idleItems.map((item) => (
                <CommandResultRow key={item.id} item={item} query={query} onSelect={item.onSelect} />
              ))}
            </Command.Group>
          )}

          {showSearch && loading && <CommandSkeletonRows />}

          {showSearch &&
            !loading &&
            Array.from(groupedSearch.entries()).map(([group, items]) => (
              <Command.Group
                key={group}
                heading={group}
                className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-ink-muted"
              >
                {items.map((item) => (
                  <CommandResultRow key={item.id} item={item} query={query} onSelect={item.onSelect} />
                ))}
              </Command.Group>
            ))}
        </Command.List>

        <div className="flex items-center justify-between gap-2 border-t border-border bg-surface-muted/50 px-4 py-2 text-[11px] text-ink-muted">
          <span>{tCmd('footer.navigate')}</span>
          <span>{tCmd('footer.open')}</span>
          <span>{tCmd('footer.close')}</span>
        </div>
      </Command.Dialog>
    </>
  );
}

function fuzzyItem(item: CommandItem, q: string): boolean {
  const hay = [item.label, item.subtitle, ...(item.keywords ?? [])].join(' ').toLowerCase();
  return hay.includes(q);
}
