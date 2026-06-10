'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, usePermission } from '@/lib/auth-context';
import { getHomePath } from '@/lib/permission-routes';
import { MonitorMapView } from '@/components/monitor-map/MonitorMapView';

export function MonitorMapPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const canView = usePermission('MONITOR_MAP_READ');

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    else if (!canView) router.replace(getHomePath(user));
  }, [user, loading, canView, router]);

  if (loading || !user || !canView) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-sm text-ink-muted">Loading…</p>
      </div>
    );
  }

  return <MonitorMapView />;
}
