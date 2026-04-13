'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import clsx from 'clsx';
import { useAuth } from '@/lib/auth-context';
import { formatUserWithTitlePrefix } from '@/lib/userTitlePrefix';
import { BrandLogo } from '@/components/BrandLogo';

const nav = [
  { href: '/s', label: 'Dashboard' },
  { href: '/s/floor-plan', label: 'Floor plan' },
  { href: '/s/board', label: 'Assignment board' },
  { href: '/s/room-tasks', label: 'Room task lists' },
  { href: '/s/requests', label: 'Requests' },
  { href: '/s/chat', label: 'Team chat' },
  { href: '/s/lost', label: 'Lost & found' },
  { href: '/s/performance', label: 'Performance' },
];

export default function SupervisorLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { user, loading, logout } = useAuth();
  const router = useRouter();

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

  return (
    <div className="min-h-screen bg-surface-muted md:flex">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-surface py-6 shadow-card md:flex">
        <div className="px-4">
          <BrandLogo />
        </div>
        <nav className="mt-8 flex flex-1 flex-col gap-0.5 px-2">
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
        <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-3 shadow-card md:hidden">
          <BrandLogo compact />
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
