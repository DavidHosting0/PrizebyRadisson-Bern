'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import clsx from 'clsx';
import { useAuth } from '@/lib/auth-context';
import {
  filterNavByPermission,
  getFirstAllowedPath,
  getTechnicianRoutePermission,
  hasAnyTechnicianPermission,
  hasPermission,
  TECHNICIAN_NAV,
} from '@/lib/permission-routes';
import { formatUserWithTitlePrefix } from '@/lib/userTitlePrefix';
import { BrandLogo } from '@/components/BrandLogo';
import { IconChat, IconMaintenance, IconRooms } from '@/components/icons';
import { InstallAppBanner } from '@/components/InstallAppBanner';

const TAB_ICONS: Record<string, typeof IconMaintenance> = {
  '/t/maintenance': IconMaintenance,
  '/t/rooms': IconRooms,
  '/t/chat': IconChat,
};

export default function TechnicianLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { user, loading } = useAuth();
  const router = useRouter();

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
        <p className="text-sm text-ink-muted">Loading…</p>
      </div>
    );
  }

  const isChat = path === '/t/chat' || path.startsWith('/t/chat/');
  const tabs = filterNavByPermission(user, TECHNICIAN_NAV).map((t) => ({
    ...t,
    Icon: TAB_ICONS[t.href] ?? IconMaintenance,
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
          <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-ink-muted">Technician</p>
        </div>
        <span className="max-w-[55%] truncate text-right text-xs font-medium text-ink-muted">
          {formatUserWithTitlePrefix(user.name, user.titlePrefix)}
        </span>
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
