'use client';

import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { WS_EVENTS } from '@housekeeping/shared';
import { ROOMS_LIST_QUERY_KEY } from '@/lib/rooms-query';
import { useToast } from '@/components/toast/ToastProvider';
import { getSocket } from '@/lib/socket';
import { useAuth } from '@/lib/auth-context';

type RoomStatusPayload = {
  id: string;
  roomNumber: string;
  derivedStatus: string;
};

type TeamChatMessagePayload = {
  id?: string;
  body?: string;
  author?: { id?: string; name?: string };
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

function isReceptionChatPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return (
    pathname === '/r/chat' ||
    pathname.startsWith('/r/chat/') ||
    pathname === '/r/m/chat' ||
    pathname.startsWith('/r/m/chat/')
  );
}

function previewBody(body: string, max = 80): string {
  const trimmed = body.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

export function useReceptionRealtime() {
  const qc = useQueryClient();
  const toast = useToast();
  const tToast = useTranslations('toast');
  const tRoom = useTranslations('room.status');
  const pathname = usePathname();
  const { user } = useAuth();
  const warned = useRef(false);
  const pathnameRef = useRef(pathname);
  const userIdRef = useRef(user?.id);
  pathnameRef.current = pathname;
  userIdRef.current = user?.id;

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

    const onTeamChat = (payload: unknown) => {
      qc.invalidateQueries({ queryKey: ['team-chat-messages'] });

      if (isReceptionChatPath(pathnameRef.current)) return;

      const msg = payload as TeamChatMessagePayload;
      if (!msg?.id || !msg.body) return;
      if (msg.author?.id && msg.author.id === userIdRef.current) return;

      const author = msg.author?.name?.trim() || 'Team';
      const text = tToast('newChatMessage', {
        author,
        preview: previewBody(msg.body),
      });
      toast.push(text, 'default', 8000);
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
  }, [qc, toast, tToast, tRoom]);
}
