'use client';

import { useQuery } from '@tanstack/react-query';
import type { MonitorMapSnapshot } from '@housekeeping/shared';
import { api } from '@/lib/api';

export function useMonitorMapSnapshot(enabled = true) {
  return useQuery({
    queryKey: ['monitor-map-snapshot'],
    queryFn: () => api<MonitorMapSnapshot>('/monitor-map/snapshot'),
    refetchInterval: 30_000,
    enabled,
  });
}
