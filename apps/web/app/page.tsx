'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';

const ROLE_HOME: Record<string, string> = {
  HOUSEKEEPER: '/h',
  SUPERVISOR: '/s',
  RECEPTION: '/r',
  ADMIN: '/a',
};

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    router.replace(ROLE_HOME[user.role] ?? '/login');
  }, [user, loading, router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-surface-muted">
      <div className="h-8 w-8 animate-pulse rounded-full bg-surface-muted ring-2 ring-border" />
      <p className="text-sm text-ink-muted">Loading…</p>
    </div>
  );
}
