'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function SupervisorMobileIndexPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/s/m/inspections');
  }, [router]);
  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <p className="text-sm text-ink-muted">Loading…</p>
    </div>
  );
}
