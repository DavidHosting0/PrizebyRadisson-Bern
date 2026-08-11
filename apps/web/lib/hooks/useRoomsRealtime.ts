'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { ROOMS_LIST_QUERY_KEY } from '@/lib/rooms-query';
import { getSocket } from '@/lib/socket';

type RoomStatusPayload = {
  id: string;
  roomNumber?: string;
  derivedStatus: string;
  floor?: number | null;
  occupancy?: unknown;
};

/**
 * Keep GET /rooms caches fresh when cleaners/inspectors/FO change status.
 * Used by supervisor floor plan + room list (reception has its own hook with toasts).
 */
export function useRoomsRealtime() {
  const qc = useQueryClient();
  const warned = useRef(false);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
    let socket: ReturnType<typeof getSocket> | undefined;
    try {
      socket = getSocket(token);
    } catch {
      if (!warned.current) {
        warned.current = true;
        console.warn('Socket.IO unavailable');
      }
      return undefined;
    }
    if (!socket) return undefined;

    const onRoom = (payload: unknown) => {
      const room = payload as Partial<RoomStatusPayload>;
      if (!room?.id || !room.derivedStatus) {
        void qc.invalidateQueries({ queryKey: ['rooms'] });
        return;
      }

      // Patch list caches immediately so floor plan / room board show Clean without refresh.
      qc.setQueriesData<RoomStatusPayload[]>({ queryKey: ROOMS_LIST_QUERY_KEY }, (prev) => {
        if (!prev) return prev;
        let hit = false;
        const next = prev.map((r) => {
          if (r.id !== room.id) return r;
          hit = true;
          return {
            ...r,
            derivedStatus: room.derivedStatus!,
            ...(room.roomNumber != null ? { roomNumber: room.roomNumber } : {}),
            ...(room.floor !== undefined ? { floor: room.floor } : {}),
            ...(room.occupancy !== undefined ? { occupancy: room.occupancy } : {}),
          };
        });
        return hit ? next : prev;
      });

      void qc.invalidateQueries({ queryKey: ['rooms'] });
    };

    socket.on('room.status_updated', onRoom);
    return () => {
      socket?.off('room.status_updated', onRoom);
    };
  }, [qc]);
}
