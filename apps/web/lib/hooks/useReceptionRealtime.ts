'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { API_BASE } from '@/lib/api';
import { useToast } from '@/components/toast/ToastProvider';

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

    const onRoom = () => {
      qc.invalidateQueries({ queryKey: ['rooms'] });
      toast.push('Room status updated', 'success');
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

    socket.on('room.status_updated', onRoom);
    socket.on('service_request.created', onCreated);
    socket.on('service_request.claimed', onClaimed);
    socket.on('service_request.resolved', onResolved);
    socket.on('service_request.updated', onUpdated);

    return () => {
      socket?.off('room.status_updated', onRoom);
      socket?.off('service_request.created', onCreated);
      socket?.off('service_request.claimed', onClaimed);
      socket?.off('service_request.resolved', onResolved);
      socket?.off('service_request.updated', onUpdated);
      socket?.disconnect();
    };
  }, [qc, toast]);
}
