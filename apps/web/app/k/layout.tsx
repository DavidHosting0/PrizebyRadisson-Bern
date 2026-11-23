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
  getKitchenRoutePermission,
  hasAnyKitchenPermission,
  hasPermission,
  KITCHEN_NAV,
} from '@/lib/permission-routes';
import { useTranslatedNav } from '@/lib/use-translated-nav';
import { formatUserWithTitlePrefix } from '@/lib/userTitlePrefix';
import { BrandLogo } from '@/components/BrandLogo';
import { IconBreakfast, IconChat, IconForecast } from '@/components/icons';
import { InstallAppBanner } from '@/components/InstallAppBanner';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { NotificationsRuntime } from '@/components/notifications/NotificationsRuntime';
import { PushPermissionBanner } from '@/components/notifications/PushPermissionBanner';

const TAB_ICONS: Record<string, typeof IconBreakfast> = {
  '/k/breakfast': IconBreakfast,
  '/k/forecast': IconForecast,
  '/k/chat': IconChat,
};

export default function KitchenLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { user, loading } = useAuth();
  const router = useRouter();
  const t = useTranslations('common');
  const translatedTabs = useTranslatedNav(filterNavByPermission(user, KITCHEN_NAV));

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (user.role !== 'KITCHEN' && user.role !== 'ADMIN') {
      router.replace('/');
      return;
    }
    if (user.role === 'KITCHEN' && !hasAnyKitchenPermission(user)) {
      router.replace('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (loading || !user || user.role === 'ADMIN') return;
    if (path === '/k' || path === '/k/') {
      const first = getFirstAllowedPath(user, KITCHEN_NAV) ?? '/k/breakfast';
      router.replace(first);
      return;
    }
    const required = getKitchenRoutePermission(path);
    if (required && !hasPermission(user, required)) {
      const fallback = getFirstAllowedPath(user, KITCHEN_NAV) ?? '/login';
      if (fallback !== path) router.replace(fallback);
    }
  }, [loading, user, path, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#121a26] p-4">
        <p className="text-sm text-sidebar-muted">{t('loading')}</p>
      </div>
    );
  }

  const isChat = path === '/k/chat' || path.startsWith('/k/chat/');
  const tabs = translatedTabs.map((tab) => ({
    ...tab,
    Icon: TAB_ICONS[tab.href] ?? IconBreakfast,
  }));

  return (
    <div
      className={clsx(
        'flex flex-col bg-[#121a26] pb-[calc(5.5rem+var(--safe-bottom))]',
        isChat ? 'h-dvh overflow-hidden' : 'min-h-screen',
      )}
    >
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-sidebar-border bg-sidebar/95 px-5 py-3.5 shadow-sidebar backdrop-blur-sm">
        <div className="min-w-0">
          <BrandLogo compact className="brightness-0 invert" />
          <p className="mt-0.5 max-w-[12rem] truncate text-xs font-medium text-sidebar-muted">
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
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex justify-center border-t border-sidebar-border bg-sidebar/98 pb-[var(--safe-bottom)] pt-1 shadow-lift backdrop-blur-md">
        <div className="flex w-full max-w-md items-stretch justify-center gap-1 px-3">
          {tabs.map((tab) => {
            const active = path === tab.href || path.startsWith(`${tab.href}/`);
            const Icon = tab.Icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={clsx(
                  'flex min-h-[3.75rem] min-w-[5.5rem] flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-3 py-2.5 text-sm font-semibold transition-colors duration-tap',
                  active ? 'bg-white/10 text-white' : 'text-sidebar-muted',
                )}
              >
                <Icon className={clsx(active ? 'text-white' : 'text-sidebar-muted')} />
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>
      <InstallAppBanner />
    </div>
  );
}
