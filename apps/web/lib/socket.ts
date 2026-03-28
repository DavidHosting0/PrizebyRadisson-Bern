import { io, Socket } from 'socket.io-client';
import { API_BASE } from './api';

const apiOrigin = API_BASE.replace(/\/api\/v1\/?$/, '');

let socket: Socket | null = null;

export function getSocket(accessToken: string | null) {
  if (typeof window === 'undefined') return null;
  if (socket?.connected) return socket;
  socket = io(`${apiOrigin}/operations`, {
    transports: ['websocket'],
    auth: accessToken ? { token: accessToken } : undefined,
    autoConnect: !!accessToken,
  });
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
