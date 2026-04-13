'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function TechnicianIndexPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/t/maintenance');
  }, [router]);
  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <p className="text-sm text-ink-muted">Loading…</p>
    </div>
  );
}
