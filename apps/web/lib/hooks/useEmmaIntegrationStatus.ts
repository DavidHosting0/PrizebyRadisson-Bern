'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';

export type EmmaIntegrationStatus = {
  pushAlert: {
    active: boolean;
    since: string | null;
    pendingCount: number;
    lastError: string | null;
  };
  message: string | null;
};

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

  return {
    active: query.data?.pushAlert.active ?? false,
    message:
      query.data?.message ??
      'EMMA SYNC DOWN, EMMA IS NOT REACHABLE. ACTION REQUIRED',
    pendingCount: query.data?.pushAlert.pendingCount ?? 0,
    isLoading: query.isLoading,
  };
}
