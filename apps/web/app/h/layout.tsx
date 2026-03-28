'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import clsx from 'clsx';
import { useAuth } from '@/lib/auth-context';

const tabs = [
  { href: '/h', label: 'Rooms' },
  { href: '/h/requests', label: 'Requests' },
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
      <div className="p-4">
        <p className="text-slate-600">Loading…</p>
      </div>
    );
  }

  return (
    <div className="pb-20">
      {children}
      <nav className="fixed bottom-0 left-0 right-0 flex border-t border-slate-200 bg-white/95 backdrop-blur">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={clsx(
              'flex-1 py-3 text-center text-sm font-medium',
              path === t.href ? 'text-accent border-t-2 border-accent -mt-px' : 'text-slate-600',
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
