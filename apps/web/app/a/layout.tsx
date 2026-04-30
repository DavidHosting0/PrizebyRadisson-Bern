'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { BrandLogo } from '@/components/BrandLogo';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    else if (user.role !== 'ADMIN') router.replace('/');
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-muted p-4">
        <p className="text-sm text-ink-muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-muted">
      <header className="border-b border-border bg-surface px-4 py-3 shadow-card">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <BrandLogo compact />
            <nav className="flex items-center gap-2">
              <Link
                href="/a"
                className={`rounded-full px-3 py-1.5 text-sm ${
                  pathname === '/a' ? 'bg-ink text-white' : 'text-ink-muted hover:bg-surface-muted'
                }`}
              >
                User management
              </Link>
              <Link
                href="/a/roles"
                className={`rounded-full px-3 py-1.5 text-sm ${
                  pathname.startsWith('/a/roles')
                    ? 'bg-ink text-white'
                    : 'text-ink-muted hover:bg-surface-muted'
                }`}
              >
                Roles
              </Link>
              <Link
                href="/a/floor-plans"
                className={`rounded-full px-3 py-1.5 text-sm ${
                  pathname.startsWith('/a/floor-plans')
                    ? 'bg-ink text-white'
                    : 'text-ink-muted hover:bg-surface-muted'
                }`}
              >
                Floor plans
              </Link>
            </nav>
          </div>
          <span className="truncate text-sm text-ink-muted">{user.email}</span>
        </div>
      </header>
      <div className="mx-auto max-w-7xl">{children}</div>
    </div>
  );
}
