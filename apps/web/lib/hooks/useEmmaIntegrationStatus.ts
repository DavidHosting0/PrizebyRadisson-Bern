'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { EmmaIntegrationStatus } from '@housekeeping/shared';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';

const QUERY_KEY = ['emma', 'integration-status'] as const;

export function useEmmaIntegrationStatus(enabled = true) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => api<EmmaIntegrationStatus>('/emma/integration-status'),
    enabled,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  useEffect(() => {
    if (!enabled) return undefined;
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
    let socket: ReturnType<typeof getSocket> | undefined;
    try {
      socket = getSocket(token);
    } catch {
      return undefined;
    }
    if (!socket) return undefined;

    const onAlert = (payload: unknown) => {
      qc.setQueryData(QUERY_KEY, payload as EmmaIntegrationStatus);
    };
    socket.on('emma.integration_alert', onAlert);
    return () => {
      socket?.off('emma.integration_alert', onAlert);
    };
  }, [enabled, qc]);

  const backupMode = query.data?.backupMode;

  return {
    active: backupMode?.active ?? false,
    backupModeActive: backupMode?.active ?? false,
    backupModeReasons: backupMode?.reasons ?? [],
    backupModeSince: backupMode?.since ?? null,
    nightAuditGrace: backupMode?.nightAuditGrace ?? false,
    manualBackupMode: backupMode?.manual ?? false,
    pushAlert: query.data?.pushAlert,
    message: query.data?.message ?? 'EMMA DOWN — BACKUP SYSTEM',
    pendingCount: query.data?.pushAlert?.pendingCount ?? 0,
    isLoading: query.isLoading,
    data: query.data,
  };
}
