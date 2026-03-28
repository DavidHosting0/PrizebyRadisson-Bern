'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import clsx from 'clsx';
import { useAuth } from '@/lib/auth-context';
import { BrandLogo } from '@/components/BrandLogo';
import { IconFloor, IconLost, IconRequests } from '@/components/icons';

const tabs = [
  { href: '/r', label: 'Floor', Icon: IconFloor },
  { href: '/r/requests', label: 'Requests', Icon: IconRequests },
  { href: '/r/lost', label: 'Lost & found', Icon: IconLost },
];

export default function ReceptionLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { user, loading, logout } = useAuth();
  const router = useRouter();

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

  const NavLinks = ({ mobile }: { mobile?: boolean }) => (
    <>
      {tabs.map((t) => {
        const active = path === t.href;
        const Icon = t.Icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={clsx(
              mobile
                ? 'flex flex-1 flex-col items-center gap-1 py-3 text-[11px] font-medium'
                : 'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
              active
                ? mobile
                  ? 'text-ink'
                  : 'bg-surface-muted text-ink'
                : mobile
                  ? 'text-ink-muted'
                  : 'text-ink-muted hover:bg-surface-muted/80 hover:text-ink',
            )}
          >
            <Icon className={clsx(!mobile && 'shrink-0', active ? 'text-ink' : 'text-ink-muted')} />
            {t.label}
          </Link>
        );
      })}
    </>
  );

  return (
    <div className="min-h-screen bg-surface-muted md:flex">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-surface py-6 shadow-card md:flex">
        <div className="px-4">
          <BrandLogo />
        </div>
        <nav className="mt-8 flex flex-1 flex-col gap-1 px-2">
          <NavLinks />
        </nav>
        <div className="mt-auto border-t border-border px-4 pt-4">
          <p className="truncate text-xs font-medium text-ink">{user.name}</p>
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

      <div className="flex min-h-screen min-w-0 flex-1 flex-col pb-[calc(5rem+var(--safe-bottom))] md:pb-0">
        <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-3 shadow-card md:hidden">
          <BrandLogo compact />
          <span className="max-w-[50%] truncate text-xs text-ink-muted">{user.name}</span>
        </header>
        <main className="flex-1">{children}</main>
        <nav className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-border bg-surface/98 pb-[var(--safe-bottom)] backdrop-blur-md md:hidden">
          <NavLinks mobile />
        </nav>
      </div>
    </div>
  );
}
