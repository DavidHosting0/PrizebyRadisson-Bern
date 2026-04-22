'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { formatUserWithTitlePrefix } from '@/lib/userTitlePrefix';
import { BrandLogo } from '@/components/BrandLogo';
import { Button } from '@/components/ui/Button';
import { IconChat, IconRequests, IconRooms, IconLost } from '@/components/icons';
import { useReceptionMobileMode } from '@/lib/reception-mobile-context';

const tabs = [
  { href: '/r/m/requests', label: 'Requests', Icon: IconRequests },
  { href: '/r/m/rooms', label: 'Rooms', Icon: IconRooms },
  { href: '/r/m/chat', label: 'Chat', Icon: IconChat },
  { href: '/r/m/lost', label: 'Lost & found', Icon: IconLost },
];

export function ReceptionMobileShell({
  children,
  userName,
  titlePrefix,
}: {
  children: React.ReactNode;
  userName: string;
  titlePrefix?: string | null;
}) {
  const path = usePathname();
  const { exitMobile } = useReceptionMobileMode();

  return (
    <div className="flex min-h-screen flex-col bg-surface-muted pb-[calc(5rem+var(--safe-bottom))]">
      <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-border bg-surface/95 px-3 py-2.5 shadow-card backdrop-blur-sm">
        <div className="min-w-0">
          <BrandLogo compact />
          <p className="mt-0.5 truncate text-[11px] font-medium uppercase tracking-wide text-ink-muted">
            Reception · mobile
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="max-w-[140px] truncate text-[11px] font-medium text-ink-muted">
            {formatUserWithTitlePrefix(userName, titlePrefix)}
          </span>
          <Button type="button" variant="secondary" className="min-h-[36px] px-3 py-1.5 text-xs" onClick={exitMobile}>
            Desktop site
          </Button>
        </div>
      </header>
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</main>
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-border bg-surface/98 pb-[var(--safe-bottom)] shadow-lift backdrop-blur-md">
        {tabs.map((t) => {
          const active = path === t.href || path.startsWith(`${t.href}/`);
          const Icon = t.Icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={clsx(
                'flex flex-1 flex-col items-center gap-1 py-3 text-[11px] font-medium transition-colors duration-tap',
                active ? 'text-ink' : 'text-ink-muted',
              )}
            >
              <Icon className={clsx(active ? 'text-ink' : 'text-ink-muted')} />
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
