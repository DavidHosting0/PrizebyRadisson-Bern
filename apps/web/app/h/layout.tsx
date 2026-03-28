'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import clsx from 'clsx';
import { useAuth } from '@/lib/auth-context';
import { BrandLogo } from '@/components/BrandLogo';
import { IconRequests, IconRooms, IconUser } from '@/components/icons';

const tabs = [
  { href: '/h', label: 'Rooms', Icon: IconRooms },
  { href: '/h/requests', label: 'Requests', Icon: IconRequests },
  { href: '/h/profile', label: 'Profile', Icon: IconUser },
];

export default function HousekeeperLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (user.role !== 'HOUSEKEEPER' && user.role !== 'ADMIN') {
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

  return (
    <div className="min-h-screen bg-surface-muted pb-[calc(5rem+var(--safe-bottom))]">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-surface/95 px-4 py-3 shadow-card backdrop-blur-sm">
        <BrandLogo compact />
        <span className="max-w-[45%] truncate text-right text-xs font-medium text-ink-muted">{user.name}</span>
      </header>
      <main>{children}</main>
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-border bg-surface/98 pb-[var(--safe-bottom)] shadow-lift backdrop-blur-md">
        {tabs.map((t) => {
          const active = path === t.href;
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
    </div>
  );
}
