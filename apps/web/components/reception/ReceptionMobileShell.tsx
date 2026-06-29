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
        'flex flex-col bg-surface-muted pb-[calc(5rem+var(--safe-bottom))]',
        isChat ? 'h-dvh overflow-hidden' : 'min-h-screen',
      )}
    >
      <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-border bg-surface/95 px-3 py-2.5 shadow-card backdrop-blur-sm">
        <div className="min-w-0">
          <BrandLogo compact />
          <p className="mt-0.5 truncate text-[11px] font-medium uppercase tracking-wide text-ink-muted">
            Reception · mobile
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <LanguageSwitcher compact />
          <span className="max-w-[140px] truncate text-[11px] font-medium text-ink-muted">
            {formatUserWithTitlePrefix(userName, titlePrefix)}
          </span>
          <Button type="button" variant="secondary" className="min-h-[36px] px-3 py-1.5 text-xs" onClick={exitMobile}>
            {t('desktopView')}
          </Button>
        </div>
      </header>
      <main
        className={clsx(
          'flex min-h-0 min-w-0 flex-1 flex-col',
          isChat && 'overflow-hidden',
        )}
      >
        {children}
      </main>
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
      <InstallAppBanner />
    </div>
  );
}
