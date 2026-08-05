'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function ReceptionMobileIndexPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/r/m/requests');
  }, [router]);
  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <p className="text-sm text-sidebar-muted">Loading…</p>
    </div>
  );
}
