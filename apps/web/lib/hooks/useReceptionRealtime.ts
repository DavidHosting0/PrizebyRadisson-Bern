'use client';

import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { ROOMS_LIST_QUERY_KEY } from '@/lib/rooms-query';
import { useToast } from '@/components/toast/ToastProvider';
import { getSocket } from '@/lib/socket';

type RoomStatusPayload = {
  id: string;
  roomNumber: string;
  derivedStatus: string;
};

function findRoomInCache(
  qc: QueryClient,
  roomId: string,
): { derivedStatus: string } | undefined {
  const queries = qc.getQueriesData<RoomStatusPayload[]>({ queryKey: ROOMS_LIST_QUERY_KEY });
  for (const [, data] of queries) {
    const hit = data?.find((r) => r.id === roomId);
    if (hit) return hit;
  }
  return undefined;
}

export function useReceptionRealtime() {
  const qc = useQueryClient();
  const toast = useToast();
  const tToast = useTranslations('toast');
  const tRoom = useTranslations('room.status');
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
      if (!room?.id || !room.roomNumber || !room.derivedStatus) {
        void qc.invalidateQueries({ queryKey: ROOMS_LIST_QUERY_KEY });
        return;
      }

      const prev = findRoomInCache(qc, room.id);
      void qc.invalidateQueries({ queryKey: ROOMS_LIST_QUERY_KEY });

      if (prev?.derivedStatus === room.derivedStatus) return;

      const statusKey = room.derivedStatus as 'DIRTY' | 'CLEAN' | 'IN_PROGRESS' | 'INSPECTED' | 'OUT_OF_ORDER';
      const statusLabel = tRoom(statusKey);
      toast.push(tToast('roomStatus', { roomNumber: room.roomNumber, status: statusLabel }), 'success');
    };

    const onCreated = () => {
      qc.invalidateQueries({ queryKey: ['service-requests'] });
    };
    const onClaimed = () => {
      qc.invalidateQueries({ queryKey: ['service-requests'] });
    };
    const onResolved = () => {
      qc.invalidateQueries({ queryKey: ['service-requests'] });
    };
    const onUpdated = () => {
      qc.invalidateQueries({ queryKey: ['service-requests'] });
    };

    const onTeamChat = () => {
      qc.invalidateQueries({ queryKey: ['team-chat-messages'] });
    };

    socket.on('room.status_updated', onRoom);
    socket.on('service_request.created', onCreated);
    socket.on('service_request.claimed', onClaimed);
    socket.on('service_request.resolved', onResolved);
    socket.on('service_request.updated', onUpdated);
    socket.on('team_chat.message', onTeamChat);

    return () => {
      socket?.off('room.status_updated', onRoom);
      socket?.off('service_request.created', onCreated);
      socket?.off('service_request.claimed', onClaimed);
      socket?.off('service_request.resolved', onResolved);
      socket?.off('service_request.updated', onUpdated);
      socket?.off('team_chat.message', onTeamChat);
    };
  }, [qc, toast, tToast, tRoom]);
}
