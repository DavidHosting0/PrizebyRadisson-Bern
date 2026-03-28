'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { BrandLogo } from '@/components/BrandLogo';

export default function SupervisorLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
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
    <div className="min-h-screen bg-surface-muted">
      <header className="border-b border-border bg-surface px-4 py-3 shadow-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <BrandLogo compact />
          <span className="truncate text-sm text-ink-muted">{user.name}</span>
        </div>
      </header>
      <div className="mx-auto max-w-6xl">{children}</div>
    </div>
  );
}
