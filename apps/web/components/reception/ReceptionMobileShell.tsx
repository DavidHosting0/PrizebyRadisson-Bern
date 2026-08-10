'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { formatUserWithTitlePrefix } from '@/lib/userTitlePrefix';
import { BrandLogo } from '@/components/BrandLogo';
import { Button } from '@/components/ui/Button';
import { IconChat, IconRequests, IconRooms, IconLost } from '@/components/icons';
import { useReceptionMobileMode } from '@/lib/reception-mobile-context';
import { InstallAppBanner } from '@/components/InstallAppBanner';
import { useAuth } from '@/lib/auth-context';
import { filterNavByPermission, RECEPTION_MOBILE_NAV } from '@/lib/permission-routes';
import { useTranslatedNav } from '@/lib/use-translated-nav';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import { useTranslations } from 'next-intl';

const MOBILE_ICONS: Record<string, typeof IconRequests> = {
  '/r/m/requests': IconRequests,
  '/r/m/rooms': IconRooms,
  '/r/m/chat': IconChat,
  '/r/m/lost': IconLost,
};

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
  const { user } = useAuth();
  const { exitMobile } = useReceptionMobileMode();
  const t = useTranslations('common');
  const isChat = path === '/r/m/chat' || path.startsWith('/r/m/chat/');
  const tabs = useTranslatedNav(filterNavByPermission(user, RECEPTION_MOBILE_NAV)).map((item) => ({
    ...item,
    Icon: MOBILE_ICONS[item.href] ?? IconRequests,
  }));

  return (
    <div
      className={clsx(
        'flex flex-col bg-[#121a26] pb-[calc(5rem+var(--safe-bottom))]',
        isChat ? 'h-dvh overflow-hidden' : 'min-h-screen',
      )}
    >
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-sidebar-border bg-sidebar/95 px-3 py-2.5 shadow-sidebar backdrop-blur-sm">
        <div className="min-w-0">
          <BrandLogo compact className="brightness-0 invert" />
          <p className="mt-0.5 truncate text-[11px] font-medium text-sidebar-muted">
            {formatUserWithTitlePrefix(userName, titlePrefix)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <LanguageSwitcher touch onDark />
          <Button type="button" variant="ghostOnDark" className="min-h-[44px] px-3 py-1.5 text-xs" onClick={exitMobile}>
            {t('desktopView')}
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
          const active = path === t.href || path.startsWith(`${t.href}/`);
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
