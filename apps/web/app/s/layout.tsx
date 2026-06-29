'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import {
  filterNavByPermission,
  getFirstAllowedPath,
  getSupervisorRoutePermission,
  hasAnySupervisorPermission,
  hasPermission,
  SUPERVISOR_NAV,
} from '@/lib/permission-routes';
import { SUPERVISOR_NAV_GROUPS } from '@/lib/nav-groups';
import { useSidebarGroups } from '@/lib/use-sidebar-groups';
import { formatUserWithTitlePrefix } from '@/lib/userTitlePrefix';
import { BrandLogo } from '@/components/BrandLogo';
import { Button } from '@/components/ui/Button';
import { AppSidebar } from '@/components/nav/AppSidebar';
import { SUPERVISOR_NAV_ICONS } from '@/components/nav/nav-icons';
import { SupervisorMobileModeProvider, useSupervisorMobileMode } from '@/lib/supervisor-mobile-context';
import { SupervisorMobileShell } from '@/components/supervisor/SupervisorMobileShell';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { NotificationsRuntime } from '@/components/notifications/NotificationsRuntime';
import { PushPermissionBanner } from '@/components/notifications/PushPermissionBanner';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import { CommandPaletteTrigger } from '@/components/command/CommandPaletteTrigger';
import { ProfilePhotoSheet } from '@/components/profile/ProfilePhotoSheet';
import { SidebarSettingsButton } from '@/components/nav/SidebarSettingsButton';

/** Mobile supervisor routes live under `/s/m/` — not `/s/monitor-map` etc. */
function isSupervisorMobilePath(path: string) {
  return path === '/s/m' || path.startsWith('/s/m/');
}

const baseNav = SUPERVISOR_NAV;

export default function SupervisorLayout({ children }: { children: React.ReactNode }) {
  return (
    <SupervisorMobileModeProvider>
      <SupervisorLayoutInner>{children}</SupervisorLayoutInner>
    </SupervisorMobileModeProvider>
  );
}

function SupervisorLayoutInner({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { user, loading, logout } = useAuth();
  const t = useTranslations('common');
  const tCmd = useTranslations('commandPalette');
  const nav = filterNavByPermission(user, baseNav);
  const sidebarGroups = useSidebarGroups(SUPERVISOR_NAV_GROUPS, nav, SUPERVISOR_NAV_ICONS);
  const { mobileUi, hydrated, enterMobile } = useSupervisorMobileMode();
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    if (!hydrated || !user) return;
    if (mobileUi && path.startsWith('/s') && !isSupervisorMobilePath(path)) {
      router.replace('/s/m/inspections');
    }
  }, [hydrated, mobileUi, path, router, user]);

  useEffect(() => {
    if (!hydrated || !user) return;
    if (!mobileUi && isSupervisorMobilePath(path)) {
      if (path.startsWith('/s/m/chat')) router.replace('/s/chat');
      else if (path.startsWith('/s/m/requests')) router.replace('/s/requests');
      else router.replace('/s');
    }
  }, [hydrated, mobileUi, path, router, user]);

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    else if (user.role !== 'SUPERVISOR' && user.role !== 'ADMIN') router.replace('/');
    else if (user.role === 'SUPERVISOR' && !hasAnySupervisorPermission(user)) router.replace('/login');
  }, [user, loading, router]);

  useEffect(() => {
    if (loading || !user || user.role === 'ADMIN') return;
    const required = getSupervisorRoutePermission(path);
    if (required && !hasPermission(user, required)) {
      const fallback = getFirstAllowedPath(user, baseNav) ?? '/login';
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

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-muted p-4">
        <p className="text-sm text-ink-muted">{t('loading')}</p>
      </div>
    );
  }

  const redirectingMobile = mobileUi && path.startsWith('/s') && !isSupervisorMobilePath(path);
  const redirectingDesktop = !mobileUi && isSupervisorMobilePath(path);
  if (redirectingMobile || redirectingDesktop) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-muted p-4">
        <p className="text-sm text-ink-muted">{t('loading')}</p>
      </div>
    );
  }

  if (mobileUi) {
    return (
      <SupervisorMobileShell userName={user.name} titlePrefix={user.titlePrefix}>
        <NotificationsRuntime />
        <PushPermissionBanner />
        {children}
      </SupervisorMobileShell>
    );
  }

  return (
    <div
      className={clsx(
        'flex flex-col bg-surface-muted md:h-dvh md:flex-row md:overflow-hidden',
        path === '/s/chat' ? 'h-dvh overflow-hidden' : 'min-h-screen',
      )}
    >
      <NotificationsRuntime />
      <AppSidebar
        groups={sidebarGroups}
        path={path}
        className="md:sticky md:top-0 md:h-dvh md:self-start"
        header={<BrandLogo className="brightness-0 invert" />}
        footer={
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <SidebarSettingsButton onClick={() => setProfileOpen(true)} />
              <NotificationBell variant="onDark" />
            </div>
            <div>
              <p className="truncate text-sm font-medium text-white">
                {formatUserWithTitlePrefix(user.name, user.titlePrefix)}
              </p>
              <p className="truncate text-xs text-sidebar-muted">{user.email}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                logout();
                router.replace('/login');
              }}
              className="text-xs font-medium text-sidebar-muted transition-colors hover:text-white"
            >
              {t('signOut')}
            </button>
          </div>
        }
      />

      <div
        className={clsx(
          'flex min-h-0 min-w-0 flex-1 flex-col md:h-dvh',
          path === '/s/chat' ? 'h-full overflow-hidden' : 'md:overflow-hidden',
        )}
      >
        <header className="flex items-center justify-between gap-3 border-b border-border bg-surface/95 px-5 py-3 shadow-card backdrop-blur-sm md:hidden">
          <BrandLogo compact />
          <div className="flex items-center gap-2">
            <CommandPaletteTrigger className="min-h-[36px] gap-2 px-2 text-xs" />
            <LanguageSwitcher compact />
            <NotificationBell />
            <Button type="button" variant="ghost" className="min-h-[36px] px-3 text-xs" onClick={enterMobile}>
              {t('mobileView')}
            </Button>
          </div>
        </header>
        <header className="hidden items-center justify-end gap-2 border-b border-border bg-surface/95 px-8 py-3 shadow-card backdrop-blur-sm md:flex">
          <CommandPaletteTrigger className="min-h-[36px] gap-2 px-3 text-xs" label={tCmd('title')} />
          <LanguageSwitcher compact />
          <Button type="button" variant="ghost" className="min-h-[36px] px-3 text-xs" onClick={enterMobile}>
            {t('mobileView')}
          </Button>
        </header>
        <PushPermissionBanner />
        <main
          className={clsx(
            'min-h-0 min-w-0 flex-1',
            path === '/s/chat' ? 'flex h-full flex-col overflow-hidden' : 'overflow-y-auto',
          )}
        >
          {children}
        </main>
      </div>
      <ProfilePhotoSheet open={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  );
}
