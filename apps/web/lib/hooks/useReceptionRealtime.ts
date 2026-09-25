'use client';

import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { WS_EVENTS } from '@housekeeping/shared';
import { ROOMS_LIST_QUERY_KEY } from '@/lib/rooms-query';
import { useToast } from '@/components/toast/ToastProvider';
import { getSocket } from '@/lib/socket';
import { useLocale } from '@/lib/locale-context';
import { upsertTeamChatMessage } from '@/lib/team-chat-cache';

type RoomStatusPayload = {
  id: string;
  roomNumber: string;
  derivedStatus: string;
};

type TeamChatMessagePayload = {
  id?: string;
  body?: string;
  photoUrl?: string | null;
  author?: { id?: string; name?: string };
  translationsByLocale?: Record<string, string> | null;
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
  const { locale } = useLocale();
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

      // Keep floor plan / room boards in sync immediately (same as supervisor hook).
      qc.setQueriesData<RoomStatusPayload[]>({ queryKey: ROOMS_LIST_QUERY_KEY }, (list) => {
        if (!list) return list;
        let hit = false;
        const next = list.map((r) => {
          if (r.id !== room.id) return r;
          hit = true;
          return { ...r, derivedStatus: room.derivedStatus! };
        });
        return hit ? next : list;
      });

      void qc.invalidateQueries({ queryKey: ROOMS_LIST_QUERY_KEY });

      if (prev?.derivedStatus === room.derivedStatus) return;

      const statusKey = room.derivedStatus as
        | 'DIRTY'
        | 'CLEAN'
        | 'IN_PROGRESS'
        | 'INSPECTED'
        | 'OUT_OF_ORDER';
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

    const onTeamChat = (payload: unknown) => {
      const msg = payload as TeamChatMessagePayload;
      if (msg?.id && msg.author?.id) {
        upsertTeamChatMessage(
          qc,
          payload as {
            id: string;
            body: string;
            photoUrl?: string | null;
            author: { id: string };
            translationsByLocale?: Record<string, string> | null;
          },
          locale,
        );
      }
    };

    socket.on('room.status_updated', onRoom);
    socket.on('service_request.created', onCreated);
    socket.on('service_request.claimed', onClaimed);
    socket.on('service_request.resolved', onResolved);
    socket.on('service_request.updated', onUpdated);
    socket.on(WS_EVENTS.TEAM_CHAT_MESSAGE, onTeamChat);

    return () => {
      socket?.off('room.status_updated', onRoom);
      socket?.off('service_request.created', onCreated);
      socket?.off('service_request.claimed', onClaimed);
      socket?.off('service_request.resolved', onResolved);
      socket?.off('service_request.updated', onUpdated);
      socket?.off(WS_EVENTS.TEAM_CHAT_MESSAGE, onTeamChat);
    };
  }, [qc, toast, tToast, tRoom, locale]);
}
