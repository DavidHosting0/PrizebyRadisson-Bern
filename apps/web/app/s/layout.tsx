'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import clsx from 'clsx';
import { useAuth } from '@/lib/auth-context';
import { formatUserWithTitlePrefix } from '@/lib/userTitlePrefix';
import { BrandLogo } from '@/components/BrandLogo';
import { SupervisorMobileModeProvider, useSupervisorMobileMode } from '@/lib/supervisor-mobile-context';
import { SupervisorMobileShell } from '@/components/supervisor/SupervisorMobileShell';

const nav = [
  { href: '/s', label: 'Dashboard' },
  { href: '/s/floor-plan', label: 'Floor plan' },
  { href: '/s/board', label: 'Assignment board' },
  { href: '/s/room-tasks', label: 'Room task lists' },
  { href: '/s/requests', label: 'Requests' },
  { href: '/s/chat', label: 'Team chat' },
  { href: '/s/lost', label: 'Lost & found' },
  { href: '/s/damages', label: 'Damage reports' },
  { href: '/s/schichtplan', label: 'Schichtplan' },
  { href: '/s/performance', label: 'Performance' },
];

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
  const { mobileUi, hydrated, enterMobile } = useSupervisorMobileMode();

  useEffect(() => {
    if (!hydrated || !user) return;
    if (mobileUi && path.startsWith('/s') && !path.startsWith('/s/m')) {
      router.replace('/s/m/inspections');
    }
  }, [hydrated, mobileUi, path, router, user]);

  useEffect(() => {
    if (!hydrated || !user) return;
    if (!mobileUi && path.startsWith('/s/m')) {
      if (path.startsWith('/s/m/chat')) router.replace('/s/chat');
      else if (path.startsWith('/s/m/requests')) router.replace('/s/requests');
      else router.replace('/s');
    }
  }, [hydrated, mobileUi, path, router, user]);

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    else if (user.role !== 'SUPERVISOR' && user.role !== 'ADMIN') router.replace('/');
  }, [user, loading, router]);

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

  const redirectingMobile = mobileUi && path.startsWith('/s') && !path.startsWith('/s/m');
  const redirectingDesktop = !mobileUi && path.startsWith('/s/m');
  if (redirectingMobile || redirectingDesktop) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-muted p-4">
        <p className="text-sm text-ink-muted">Loading…</p>
      </div>
    );
  }

  if (mobileUi) {
    return (
      <SupervisorMobileShell userName={user.name} titlePrefix={user.titlePrefix}>
        {children}
      </SupervisorMobileShell>
    );
  }

  return (
    <div className="min-h-screen bg-surface-muted md:flex">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-surface py-6 shadow-card md:flex">
        <div className="px-4">
          <BrandLogo />
        </div>
        <button
          type="button"
          onClick={enterMobile}
          className="mx-4 mt-4 w-[calc(100%-2rem)] rounded-lg border border-action/30 bg-action-muted px-3 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-action-muted/80"
        >
          Mobile view
        </button>
        <nav className="mt-4 flex flex-1 flex-col gap-0.5 px-2">
          {nav.map((item) => {
            const active =
              item.href === '/s'
                ? path === '/s'
                : path === item.href || path.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  'rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  active ? 'bg-surface-muted text-ink' : 'text-ink-muted hover:bg-surface-muted/70 hover:text-ink',
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto border-t border-border px-4 pt-4">
          <p className="truncate text-xs font-medium text-ink">
            {formatUserWithTitlePrefix(user.name, user.titlePrefix)}
          </p>
          <p className="truncate text-xs text-ink-muted">{user.email}</p>
          <button
            type="button"
            onClick={() => {
              logout();
              router.replace('/login');
            }}
            className="mt-3 text-xs font-medium text-ink-muted underline underline-offset-2 hover:text-ink"
          >
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3 shadow-card md:hidden">
          <BrandLogo compact />
          <button
            type="button"
            onClick={enterMobile}
            className="shrink-0 rounded-lg border border-action/30 bg-action-muted px-3 py-2 text-xs font-semibold text-ink"
          >
            Mobile view
          </button>
        </header>
        <nav className="flex flex-wrap gap-1 border-b border-border bg-surface px-2 py-2 md:hidden">
          {nav.map((item) => {
            const active =
              item.href === '/s'
                ? path === '/s'
                : path === item.href || path.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  'rounded-lg px-2.5 py-1.5 text-xs font-medium',
                  active ? 'bg-ink text-white' : 'text-ink-muted',
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
