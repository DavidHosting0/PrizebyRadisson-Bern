'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { formatUserWithTitlePrefix } from '@/lib/userTitlePrefix';
import { BrandLogo } from '@/components/BrandLogo';
import { Button } from '@/components/ui/Button';
import { IconChat, IconRequests, IconRooms } from '@/components/icons';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { useSupervisorMobileMode } from '@/lib/supervisor-mobile-context';
import { InstallAppBanner } from '@/components/InstallAppBanner';

const tabs = [
  { href: '/s/m', label: 'Rooms', Icon: IconRooms, home: true },
  { href: '/s/m/requests', label: 'Requests', Icon: IconRequests, home: false },
  { href: '/s/m/chat', label: 'Chat', Icon: IconChat, home: false },
];

export function SupervisorMobileShell({
  children,
  userName,
  titlePrefix,
}: {
  children: React.ReactNode;
  userName: string;
  titlePrefix?: string | null;
}) {
  const path = usePathname();
  const { exitMobile } = useSupervisorMobileMode();
  const isChat = path === '/s/m/chat' || path.startsWith('/s/m/chat/');

  return (
    <div
      className={clsx(
        'flex flex-col bg-[#121a26] pb-[calc(5rem+var(--safe-bottom))]',
        isChat ? 'h-dvh overflow-hidden' : 'min-h-screen',
      )}
    >
      <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-sidebar-border bg-sidebar/95 px-3 py-2.5 shadow-sidebar backdrop-blur-sm">
        <div className="min-w-0">
          <BrandLogo compact className="brightness-0 invert" />
          <p className="mt-0.5 truncate text-[11px] font-medium uppercase tracking-wide text-sidebar-muted">
            Supervisor · {formatUserWithTitlePrefix(userName, titlePrefix)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <NotificationBell variant="onDark" />
          <LanguageSwitcher touch onDark />
          <Button type="button" variant="ghostOnDark" className="min-h-[44px] px-3 py-1.5 text-xs" onClick={exitMobile}>
            Desktop
          </Button>
        </div>
      </header>
      <main
        className={clsx(
          'flex min-h-0 min-w-0 flex-1 flex-col bg-[#121a26]',
          isChat && 'overflow-hidden',
        )}
      >
        {children}
      </main>
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-sidebar-border bg-sidebar pb-[var(--safe-bottom)] shadow-[0_-8px_24px_rgba(0,0,0,0.35)]">
        {tabs.map((t) => {
          const active = t.home
            ? path === '/s/m' ||
              path.startsWith('/s/m/room') ||
              path.startsWith('/s/m/inspections')
            : path === t.href || path.startsWith(`${t.href}/`);
          const Icon = t.Icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={clsx(
                'flex flex-1 flex-col items-center gap-1 py-3 text-[11px] font-medium transition-colors duration-tap',
                active ? 'text-white' : 'text-sidebar-muted',
              )}
            >
              <Icon className={clsx(active ? 'text-white' : 'text-sidebar-muted')} />
              {t.label}
            </Link>
          );
        })}
      </nav>
      <InstallAppBanner />
    </div>
  );
}
