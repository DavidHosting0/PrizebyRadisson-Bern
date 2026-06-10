'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import clsx from 'clsx';
import { useAuth, usePermission } from '@/lib/auth-context';
import { BrandLogo } from '@/components/BrandLogo';
import { Button } from '@/components/ui/Button';
import { ReceptionUiProvider, useReceptionUi } from '@/app/r/reception-context';
import { NewRequestModal } from '@/components/reception/NewRequestModal';
import { ReceptionRoomDetailPanel } from '@/components/reception/ReceptionRoomDetailPanel';
import { ReceptionMobileShell } from '@/components/reception/ReceptionMobileShell';
import { useReceptionRealtime } from '@/lib/hooks/useReceptionRealtime';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatUserWithTitlePrefix } from '@/lib/userTitlePrefix';
import { IconChat } from '@/components/icons';
import { ReceptionMobileModeProvider, useReceptionMobileMode } from '@/lib/reception-mobile-context';

/** Mobile reception routes live under `/r/m/` — not `/r/monitor-map` etc. */
function isReceptionMobilePath(path: string) {
  return path === '/r/m' || path.startsWith('/r/m/');
}

const nav = [
  { href: '/r', label: 'Dashboard', icon: IconDash },
  { href: '/r/floor-plan', label: 'Floor plan', icon: IconMap },
  { href: '/r/rooms', label: 'Rooms', icon: IconBuilding },
  { href: '/r/arrivals', label: 'Arrivals', icon: IconCalendar },
  { href: '/r/arrival-check', label: 'Arrival Check', icon: IconArrivalCheck, permission: 'ARRIVAL_CHECK' as const },
  { href: '/r/in-house', label: 'Im Haus', icon: IconInHouse },
  { href: '/r/reservations', label: 'Reservations', icon: IconReservations },
  { href: '/r/requests', label: 'Service requests', icon: IconInbox },
  { href: '/r/chat', label: 'Chat', icon: IconChat },
  { href: '/r/lost', label: 'Lost & found', icon: IconPackage },
  { href: '/r/damages', label: 'Damage reports', icon: IconDamage },
  { href: '/r/schichtplan', label: 'Schichtplan', icon: IconCalendar },
  { href: '/r/puzzle', label: 'Puzzle', icon: IconPuzzle },
  { href: '/r/monitor-map', label: 'Monitor Map', icon: IconMonitor, permission: 'MONITOR_MAP_READ' as const },
];

function IconDash({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 13h6V4H4v9zm0 7h6v-5H4v5zm8 0h8v-9h-8v9zm0-16v5h8V4h-8z" fill="currentColor" />
    </svg>
  );
}
function IconMap({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconBuilding({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 21V8l8-5 8 5v13M9 21v-4h6v4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}
function IconInbox({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M22 12h-4l-2 4H8l-2-4H2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M5.45 5L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-7A2 2 0 0017.52 4H6.48a2 2 0 00-1.93 1z" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}
function IconPackage({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" stroke="currentColor" strokeWidth="1.75" />
      <path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function IconDamage({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3L4 9v12h16V9l-8-6zM9 21v-8h6v8"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10 7l2 3 2-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconCalendar({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.75" />
      <path d="M3 9h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function IconReservations({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="9" y="3" width="6" height="4" rx="1" stroke="currentColor" strokeWidth="1.75" />
      <path d="M9 12h6M9 16h4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function IconArrivalCheck({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 11l2 2 4-4M7 3h10a2 2 0 012 2v14a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconInHouse({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M3 21V9l9-6 9 6v12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 21v-6h6v6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="11" r="1.5" fill="currentColor" />
    </svg>
  );
}

function IconPuzzle({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M10 3h4a1 1 0 011 1v2a1 1 0 001 1h2a2 2 0 012 2v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a2 2 0 01-2 2h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H5a2 2 0 01-2-2v-3a1 1 0 011-1h1a2 2 0 100-4H4a1 1 0 01-1-1V9a2 2 0 012-2h2a1 1 0 001-1V4a1 1 0 011-1z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconMonitor({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
      <path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function ReceptionShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { user, loading, logout } = useAuth();
  const canCreateRequest = usePermission('SERVICE_REQUEST_CREATE');
  const canMonitorMap = usePermission('MONITOR_MAP_READ');
  const canArrivalCheck = usePermission('ARRIVAL_CHECK');
  const router = useRouter();
  const { newRequestOpen, openNewRequest, closeNewRequest, roomPanelId, openRoom } = useReceptionUi();
  const { mobileUi, hydrated, enterMobile } = useReceptionMobileMode();
  useReceptionRealtime();

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
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (!hydrated || !user) return;
    if (mobileUi && path.startsWith('/r') && !isReceptionMobilePath(path)) {
      router.replace('/r/m/requests');
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
        <p className="text-sm text-ink-muted">Loading…</p>
      </div>
    );
  }

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-muted p-4">
        <p className="text-sm text-ink-muted">Loading…</p>
      </div>
    );
  }

  const redirectingMobile = mobileUi && path.startsWith('/r') && !isReceptionMobilePath(path);
  const redirectingDesktop = !mobileUi && isReceptionMobilePath(path);
  if (redirectingMobile || redirectingDesktop) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-muted p-4">
        <p className="text-sm text-ink-muted">Loading…</p>
      </div>
    );
  }

  if (mobileUi) {
    return (
      <>
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
        'flex flex-col bg-surface-muted',
        path === '/r/chat' ? 'h-dvh overflow-hidden' : 'min-h-screen',
      )}
    >
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-4 border-b border-border bg-surface px-4 shadow-card md:px-6">
        <div className="flex min-w-0 items-center gap-4">
          <BrandLogo compact className="shrink-0 md:hidden" />
          <BrandLogo className="hidden shrink-0 md:block" />
          <div className="hidden min-w-0 items-baseline gap-3 sm:flex">
            <p className="truncate text-lg font-semibold tracking-tight text-ink md:text-xl">{hotelTitle}</p>
            <span className="shrink-0 text-lg font-bold tracking-tight text-ink md:text-xl">Beta Testversion</span>
          </div>
        </div>
        <div className="flex flex-1 items-center justify-end gap-3">
          <Button
            type="button"
            variant="secondary"
            className="min-h-[40px] px-3 text-xs"
            onClick={enterMobile}
          >
            Mobile view
          </Button>
          {canCreateRequest && (
            <Button
              type="button"
              variant="action"
              className="hidden min-h-[40px] sm:inline-flex"
              onClick={openNewRequest}
            >
              + New request
            </Button>
          )}
          <div className="hidden text-right md:block">
            <p className="truncate text-sm font-medium text-ink">
              {formatUserWithTitlePrefix(user.name, user.titlePrefix)}
            </p>
            <p className="truncate text-xs text-ink-muted">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              logout();
              router.replace('/login');
            }}
            className="text-xs font-medium text-ink-muted hover:text-ink"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-surface py-4 shadow-card md:flex">
          <nav className="flex flex-col gap-0.5 px-2">
            {nav
              .filter((item) => {
                if (!('permission' in item)) return true;
                if (item.permission === 'MONITOR_MAP_READ') return canMonitorMap;
                if (item.permission === 'ARRIVAL_CHECK') return canArrivalCheck;
                return false;
              })
              .map((item) => {
              const active =
                item.href === '/r'
                  ? path === '/r'
                  : path === item.href || path.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                    active ? 'bg-surface-muted text-ink' : 'text-ink-muted hover:bg-surface-muted/80 hover:text-ink',
                  )}
                >
                  <Icon className={clsx('shrink-0', active ? 'text-ink' : 'text-ink-muted')} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          {canCreateRequest && (
            <Button
              type="button"
              variant="action"
              className="mx-3 mt-6 min-h-[44px] md:hidden"
              onClick={openNewRequest}
            >
              + New request
            </Button>
          )}
        </aside>

        <main
          className={clsx(
            'min-w-0 flex-1',
            path === '/r/chat'
              ? 'flex h-full min-h-0 flex-col overflow-hidden'
              : 'overflow-auto pb-20 md:pb-8',
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
