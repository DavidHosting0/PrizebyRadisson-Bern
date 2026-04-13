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
import { useReceptionRealtime } from '@/lib/hooks/useReceptionRealtime';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatUserWithTitlePrefix } from '@/lib/userTitlePrefix';
import { IconChat } from '@/components/icons';

const nav = [
  { href: '/r', label: 'Dashboard', icon: IconDash },
  { href: '/r/floor-plan', label: 'Floor plan', icon: IconMap },
  { href: '/r/rooms', label: 'Rooms', icon: IconBuilding },
  { href: '/r/requests', label: 'Service requests', icon: IconInbox },
  { href: '/r/chat', label: 'Team chat', icon: IconChat },
  { href: '/r/lost', label: 'Lost & found', icon: IconPackage },
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

function ReceptionShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { user, loading, logout } = useAuth();
  const canCreateRequest = usePermission('SERVICE_REQUEST_CREATE');
  const router = useRouter();
  const { newRequestOpen, openNewRequest, closeNewRequest, roomPanelId, openRoom } = useReceptionUi();
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

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-muted p-4">
        <p className="text-sm text-ink-muted">Loading…</p>
      </div>
    );
  }

  const hotelTitle = settings?.name ?? 'Front Office';

  return (
    <div className="flex min-h-screen flex-col bg-surface-muted">
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-4 border-b border-border bg-surface px-4 shadow-card md:px-6">
        <div className="flex min-w-0 items-center gap-4">
          <BrandLogo compact className="shrink-0" />
          <div className="hidden min-w-0 sm:block">
            <p className="truncate text-sm font-semibold text-ink">{hotelTitle}</p>
            <p className="truncate text-xs text-ink-muted">Housekeeping operations</p>
          </div>
        </div>
        <div className="flex flex-1 items-center justify-end gap-3">
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

      <div className="flex flex-1">
        <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-surface py-4 shadow-card md:flex">
          <nav className="flex flex-col gap-0.5 px-2">
            {nav.map((item) => {
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

        <main className="min-w-0 flex-1 overflow-auto pb-20 md:pb-8">
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
    <ReceptionUiProvider>
      <ReceptionShell>{children}</ReceptionShell>
    </ReceptionUiProvider>
  );
}
