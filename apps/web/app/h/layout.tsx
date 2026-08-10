'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import {
  filterNavByPermission,
  getFirstAllowedPath,
  getHousekeeperRoutePermission,
  hasAnyHousekeeperPermission,
  hasPermission,
  HOUSEKEEPER_NAV,
} from '@/lib/permission-routes';
import { useTranslatedNav } from '@/lib/use-translated-nav';
import { formatUserWithTitlePrefix } from '@/lib/userTitlePrefix';
import { BrandLogo } from '@/components/BrandLogo';
import { IconChat, IconRequests, IconRooms } from '@/components/icons';
import { InstallAppBanner } from '@/components/InstallAppBanner';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { NotificationsRuntime } from '@/components/notifications/NotificationsRuntime';
import { PushPermissionBanner } from '@/components/notifications/PushPermissionBanner';

const TAB_ICONS: Record<string, typeof IconRooms> = {
  '/h': IconRooms,
  '/h/requests': IconRequests,
  '/h/chat': IconChat,
};

export default function HousekeeperLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { user, loading } = useAuth();
  const router = useRouter();
  const tCommon = useTranslations('common');
  const translatedTabs = useTranslatedNav(filterNavByPermission(user, HOUSEKEEPER_NAV));

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (user.role !== 'HOUSEKEEPER' && user.role !== 'ADMIN') {
      router.replace('/');
      return;
    }
    if (user.role === 'HOUSEKEEPER' && !hasAnyHousekeeperPermission(user)) {
      router.replace('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (loading || !user || user.role === 'ADMIN') return;
    const required = getHousekeeperRoutePermission(path);
    if (required && !hasPermission(user, required)) {
      const fallback = getFirstAllowedPath(user, HOUSEKEEPER_NAV) ?? '/login';
      if (fallback !== path) router.replace(fallback);
    }
  }, [loading, user, path, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#121a26] p-4">
        <p className="text-sm text-sidebar-muted">{tCommon('loading')}</p>
      </div>
    );
  }

  const isChat = path === '/h/chat' || path.startsWith('/h/chat/');
  const tabItems = translatedTabs.map((tab) => ({
    ...tab,
    Icon: TAB_ICONS[tab.href] ?? IconRooms,
  }));

  return (
    <div
      className={clsx(
        'flex flex-col bg-[#121a26] pb-[calc(5rem+var(--safe-bottom))]',
        isChat ? 'h-dvh overflow-hidden' : 'min-h-screen',
      )}
    >
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-sidebar-border bg-sidebar/95 px-4 py-3 shadow-sidebar backdrop-blur-sm">
        <div className="min-w-0">
          <BrandLogo compact className="brightness-0 invert" />
          <p className="mt-0.5 max-w-[9rem] truncate text-[11px] font-medium text-sidebar-muted">
            {formatUserWithTitlePrefix(user.name, user.titlePrefix)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <NotificationBell variant="onDark" />
          <LanguageSwitcher touch onDark />
        </div>
      </header>
      <PushPermissionBanner />
      <NotificationsRuntime />
      <main
        className={clsx(
          'flex min-h-0 min-w-0 flex-1 flex-col bg-[#121a26]',
          isChat && 'overflow-hidden',
        )}
      >
        {children}
      </main>
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-sidebar-border bg-sidebar pb-[var(--safe-bottom)] shadow-[0_-8px_24px_rgba(0,0,0,0.35)]">
        {tabItems.map((t) => {
          const active = t.href === '/h' ? path === '/h' : path === t.href || path.startsWith(`${t.href}/`);
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
