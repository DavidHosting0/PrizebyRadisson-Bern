'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Legacy inspections list → home (cleaning tasks + inspections section). */
export default function SupervisorMobileInspectionsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/s/m');
  }, [router]);
  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <p className="text-sm text-ink-muted">Loading…</p>
    </div>
  );
}
