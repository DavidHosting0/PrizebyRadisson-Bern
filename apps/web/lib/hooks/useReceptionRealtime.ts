'use client';

import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { API_BASE } from '@/lib/api';
import { ROOMS_LIST_QUERY_KEY } from '@/lib/rooms-query';
import { formatRoomStatusLabel } from '@/lib/room-status-label';
import { useToast } from '@/components/toast/ToastProvider';

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
  const warned = useRef(false);

  useEffect(() => {
    const origin = API_BASE.replace(/\/api\/v1\/?$/, '');
    let socket: ReturnType<typeof io> | undefined;
    try {
      socket = io(`${origin}/operations`, { transports: ['websocket'] });
    } catch {
      if (!warned.current) {
        warned.current = true;
        console.warn('Socket.IO unavailable');
      }
      return undefined;
    }

    const onRoom = (payload: unknown) => {
      const room = payload as Partial<RoomStatusPayload>;
      if (!room?.id || !room.roomNumber || !room.derivedStatus) {
        void qc.invalidateQueries({ queryKey: ROOMS_LIST_QUERY_KEY });
        return;
      }

      const prev = findRoomInCache(qc, room.id);
      void qc.invalidateQueries({ queryKey: ROOMS_LIST_QUERY_KEY });

      if (prev?.derivedStatus === room.derivedStatus) return;

      const label = formatRoomStatusLabel(room.derivedStatus);
      toast.push(`Zimmer ${room.roomNumber} ist jetzt ${label}`, 'success');
    };

    const onCreated = () => {
      qc.invalidateQueries({ queryKey: ['service-requests'] });
      toast.push('New service request');
    };
    const onClaimed = () => {
      qc.invalidateQueries({ queryKey: ['service-requests'] });
      toast.push('Request claimed');
    };
    const onResolved = () => {
      qc.invalidateQueries({ queryKey: ['service-requests'] });
      toast.push('Request resolved', 'success');
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
      socket?.disconnect();
    };
  }, [qc, toast]);
}
