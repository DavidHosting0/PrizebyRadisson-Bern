'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import { useAuth, usePermission } from '@/lib/auth-context';
import {
  filterNavByPermission,
  getFirstAllowedPath,
  getReceptionRoutePermission,
  hasAnyReceptionPermission,
  hasPermission,
  RECEPTION_MOBILE_NAV,
  RECEPTION_NAV,
} from '@/lib/permission-routes';
import { RECEPTION_NAV_GROUPS } from '@/lib/nav-groups';
import { useSidebarGroups } from '@/lib/use-sidebar-groups';
import { BrandLogo } from '@/components/BrandLogo';
import { Button } from '@/components/ui/Button';
import { AppSidebar } from '@/components/nav/AppSidebar';
import { RECEPTION_NAV_ICONS } from '@/components/nav/nav-icons';
import { ReceptionUiProvider, useReceptionUi } from '@/app/r/reception-context';
import { NewRequestModal } from '@/components/reception/NewRequestModal';
import { ReceptionRoomDetailPanel } from '@/components/reception/ReceptionRoomDetailPanel';
import { ReceptionMobileShell } from '@/components/reception/ReceptionMobileShell';
import { useReceptionRealtime } from '@/lib/hooks/useReceptionRealtime';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { NotificationsRuntime } from '@/components/notifications/NotificationsRuntime';
import { PushPermissionBanner } from '@/components/notifications/PushPermissionBanner';
import { EmmaSyncAlertBanner } from '@/components/emma/EmmaSyncAlertBanner';
import { useEmmaIntegrationStatus } from '@/lib/hooks/useEmmaIntegrationStatus';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatUserWithTitlePrefix } from '@/lib/userTitlePrefix';
import { ReceptionMobileModeProvider, useReceptionMobileMode } from '@/lib/reception-mobile-context';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import { subscribeCommandBus } from '@/lib/command-bus';
import { CommandPaletteTrigger } from '@/components/command/CommandPaletteTrigger';
import { ProfilePhotoSheet } from '@/components/profile/ProfilePhotoSheet';

/** Mobile reception routes live under `/r/m/` — not `/r/monitor-map` etc. */
function isReceptionMobilePath(path: string) {
  return path === '/r/m' || path.startsWith('/r/m/');
}

function ReceptionShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { user, loading, logout } = useAuth();
  const canCreateRequest = usePermission('SERVICE_REQUEST_CREATE');
  const t = useTranslations('common');
  const tProfile = useTranslations('profile');
  const tCmd = useTranslations('commandPalette');
  const allowedNav = filterNavByPermission(user, RECEPTION_NAV);
  const { backupModeActive } = useEmmaIntegrationStatus(!!user);
  const visibleNav = allowedNav.filter(
    (item) =>
      item.href !== '/r/front-office/backup' ||
      user?.role === 'ADMIN' ||
      backupModeActive,
  );
  const sidebarGroups = useSidebarGroups(RECEPTION_NAV_GROUPS, visibleNav, RECEPTION_NAV_ICONS);
  const router = useRouter();
  const { newRequestOpen, openNewRequest, closeNewRequest, roomPanelId, openRoom } = useReceptionUi();
  const { mobileUi, hydrated, enterMobile } = useReceptionMobileMode();
  const [profileOpen, setProfileOpen] = useState(false);
  useReceptionRealtime();

  useEffect(() => {
    return subscribeCommandBus((e) => {
      if (e.type === 'reception:openNewRequest') openNewRequest();
      if (e.type === 'reception:openRoom') openRoom(e.roomId);
    });
  }, [openNewRequest, openRoom]);

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api<{ name: string }>('/settings'),
    enabled: !!user,
  });

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (user.role !== 'RECEPTION' && user.role !== 'ADMIN') {
      router.replace('/');
      return;
    }
    if (user.role === 'RECEPTION' && !hasAnyReceptionPermission(user)) {
      router.replace('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (loading || !user || user.role === 'ADMIN') return;
    if (path.startsWith('/r/front-office/') && !backupModeActive) {
      router.replace(getFirstAllowedPath(user, RECEPTION_NAV) ?? '/r');
    }
  }, [loading, user, path, router, backupModeActive]);

  useEffect(() => {
    if (loading || !user || user.role === 'ADMIN') return;
    const required = getReceptionRoutePermission(path);
    if (required && !hasPermission(user, required)) {
      const fallback =
        getFirstAllowedPath(user, RECEPTION_NAV) ?? getFirstAllowedPath(user, RECEPTION_MOBILE_NAV) ?? '/login';
      if (fallback !== path) router.replace(fallback);
    }
  }, [loading, user, path, router]);

  useEffect(() => {
    if (!hydrated || !user) return;
    if (mobileUi && path.startsWith('/r') && !isReceptionMobilePath(path)) {
      router.replace(getFirstAllowedPath(user, RECEPTION_MOBILE_NAV) ?? '/r');
    }
  }, [hydrated, mobileUi, path, router, user]);

  useEffect(() => {
    if (!hydrated || !user) return;
    if (!mobileUi && isReceptionMobilePath(path)) {
      if (path.startsWith('/r/m/chat')) router.replace('/r/chat');
      else if (path.startsWith('/r/m/requests')) router.replace('/r/requests');
      else if (path.startsWith('/r/m/rooms')) router.replace('/r/rooms');
      else if (path.startsWith('/r/m/lost')) router.replace('/r/lost');
      else router.replace('/r');
    }
  }, [hydrated, mobileUi, path, router, user]);

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

  const redirectingMobile = mobileUi && path.startsWith('/r') && !isReceptionMobilePath(path);
  const redirectingDesktop = !mobileUi && isReceptionMobilePath(path);
  if (redirectingMobile || redirectingDesktop) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-muted p-4">
        <p className="text-sm text-ink-muted">{t('loading')}</p>
      </div>
    );
  }

  if (mobileUi) {
    return (
      <>
        <EmmaSyncAlertBanner />
        <ReceptionMobileShell userName={user.name} titlePrefix={user.titlePrefix}>
          {children}
        </ReceptionMobileShell>
        <NewRequestModal open={newRequestOpen} onClose={closeNewRequest} />
        <ReceptionRoomDetailPanel roomId={roomPanelId} open={!!roomPanelId} onClose={() => openRoom(null)} />
      </>
    );
  }

  const hotelTitle = settings?.name ?? 'Prize by Radisson Bern';

  return (
    <div
      className={clsx(
        'flex flex-col bg-surface-muted md:h-dvh md:flex-row md:overflow-hidden',
        path === '/r/chat' ? 'h-dvh overflow-hidden' : 'min-h-screen',
      )}
    >
      <AppSidebar
        groups={sidebarGroups}
        path={path}
        className="md:sticky md:top-0 md:h-dvh md:self-start"
        header={<BrandLogo className="brightness-0 invert" />}
        footer={
          <div className="space-y-3">
            <div className="flex items-center justify-between">
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
              onClick={() => setProfileOpen(true)}
              className="text-xs font-medium text-sidebar-muted transition-colors hover:text-white"
            >
              {tProfile('openProfile')}
            </button>
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
          path === '/r/chat' ? 'h-full overflow-hidden' : 'md:overflow-hidden',
        )}
      >
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-4 border-b border-border bg-surface/95 px-5 shadow-card backdrop-blur-sm md:px-8">
          <BrandLogo compact className="shrink-0 md:hidden" />
          <div className="hidden min-w-0 flex-1 items-baseline gap-3 sm:flex">
            <p className="truncate text-lg font-semibold tracking-tight text-ink">{hotelTitle}</p>
            <span className="shrink-0 rounded-full bg-surface-muted px-2.5 py-0.5 text-[11px] font-medium text-ink-muted">
              {t('beta')}
            </span>
          </div>
          <div className="flex flex-1 items-center justify-end gap-2 sm:flex-none">
            <CommandPaletteTrigger className="min-h-[36px] gap-2 px-3 text-xs" label={tCmd('title')} />
            <LanguageSwitcher compact />
            <div className="md:hidden">
              <NotificationBell />
            </div>
            <Button type="button" variant="ghost" className="min-h-[36px] px-3 text-xs" onClick={enterMobile}>
              {t('mobileView')}
            </Button>
            {canCreateRequest && (
              <Button type="button" variant="action" className="min-h-[36px] px-4 text-xs" onClick={openNewRequest}>
                {t('newRequest')}
              </Button>
            )}
          </div>
        </header>

        <NotificationsRuntime />
        <PushPermissionBanner />
        <EmmaSyncAlertBanner />

        <main
          className={clsx(
            'min-h-0 min-w-0 flex-1',
            path === '/r/chat'
              ? 'flex h-full flex-col overflow-hidden'
              : 'overflow-y-auto pb-20 md:pb-8',
          )}
        >
          {children}
          {canCreateRequest && (
            <div className="fixed bottom-4 right-4 z-20 sm:hidden">
              <Button type="button" variant="action" className="min-h-[52px] rounded-full px-5 shadow-lift" onClick={openNewRequest}>
                +
              </Button>
            </div>
          )}
        </main>
      </div>

      <NewRequestModal open={newRequestOpen} onClose={closeNewRequest} />
      <ReceptionRoomDetailPanel roomId={roomPanelId} open={!!roomPanelId} onClose={() => openRoom(null)} />
      <ProfilePhotoSheet open={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  );
}

export default function ReceptionLayout({ children }: { children: React.ReactNode }) {
  return (
    <ReceptionMobileModeProvider>
      <ReceptionUiProvider>
        <ReceptionShell>{children}</ReceptionShell>
      </ReceptionUiProvider>
    </ReceptionMobileModeProvider>
  );
}
