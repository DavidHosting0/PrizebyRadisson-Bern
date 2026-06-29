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
  getTechnicianRoutePermission,
  hasAnyTechnicianPermission,
  hasPermission,
  TECHNICIAN_NAV,
} from '@/lib/permission-routes';
import { useTranslatedNav } from '@/lib/use-translated-nav';
import { formatUserWithTitlePrefix } from '@/lib/userTitlePrefix';
import { BrandLogo } from '@/components/BrandLogo';
import { IconChat, IconMaintenance, IconRooms } from '@/components/icons';
import { InstallAppBanner } from '@/components/InstallAppBanner';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { NotificationsRuntime } from '@/components/notifications/NotificationsRuntime';
import { PushPermissionBanner } from '@/components/notifications/PushPermissionBanner';

const TAB_ICONS: Record<string, typeof IconMaintenance> = {
  '/t/maintenance': IconMaintenance,
  '/t/rooms': IconRooms,
  '/t/chat': IconChat,
};

export default function TechnicianLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { user, loading } = useAuth();
  const router = useRouter();
  const t = useTranslations('common');
  const translatedTabs = useTranslatedNav(filterNavByPermission(user, TECHNICIAN_NAV));

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (user.role !== 'TECHNICIAN' && user.role !== 'ADMIN') {
      router.replace('/');
      return;
    }
    if (user.role === 'TECHNICIAN' && !hasAnyTechnicianPermission(user)) {
      router.replace('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (loading || !user || user.role === 'ADMIN') return;
    const required = getTechnicianRoutePermission(path);
    if (required && !hasPermission(user, required)) {
      const fallback = getFirstAllowedPath(user, TECHNICIAN_NAV) ?? '/login';
      if (fallback !== path) router.replace(fallback);
    }
  }, [loading, user, path, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-muted p-4">
        <p className="text-sm text-ink-muted">{t('loading')}</p>
      </div>
    );
  }

  const isChat = path === '/t/chat' || path.startsWith('/t/chat/');
  const tabs = translatedTabs.map((tab) => ({
    ...tab,
    Icon: TAB_ICONS[tab.href] ?? IconMaintenance,
  }));

  return (
    <div
      className={clsx(
        'flex flex-col bg-surface-muted pb-[calc(5rem+var(--safe-bottom))]',
        isChat ? 'h-dvh overflow-hidden' : 'min-h-screen',
      )}
    >
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-surface/95 px-4 py-3 shadow-card backdrop-blur-sm">
        <div className="min-w-0">
          <BrandLogo compact />
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitcher compact />
          <NotificationBell />
          <span className="max-w-[55%] truncate text-right text-xs font-medium text-ink-muted">
            {formatUserWithTitlePrefix(user.name, user.titlePrefix)}
          </span>
        </div>
      </header>
      <PushPermissionBanner />
      <NotificationsRuntime />
      <main
        className={clsx(
          'flex min-h-0 min-w-0 flex-1 flex-col',
          isChat && 'overflow-hidden',
        )}
      >
        {children}
      </main>
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-border bg-surface/98 pb-[var(--safe-bottom)] shadow-lift backdrop-blur-md">
        {tabs.map((tab) => {
          const active = path === tab.href || path.startsWith(`${tab.href}/`);
          const Icon = tab.Icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={clsx(
                'flex flex-1 flex-col items-center gap-1 py-3 text-[11px] font-medium transition-colors duration-tap',
                active ? 'text-ink' : 'text-ink-muted',
              )}
            >
              <Icon className={clsx(active ? 'text-ink' : 'text-ink-muted')} />
              {tab.label}
            </Link>
          );
        })}
      </nav>
      <InstallAppBanner />
    </div>
  );
}
