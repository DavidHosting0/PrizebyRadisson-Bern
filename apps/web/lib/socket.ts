import { io, Socket } from 'socket.io-client';
import { API_BASE } from './api';

const apiOrigin = API_BASE.replace(/\/api\/v1\/?$/, '');

let socket: Socket | null = null;
let socketToken: string | null = null;

export function getSocket(accessToken: string | null): Socket | null {
  if (typeof window === 'undefined') return null;
  if (!accessToken) return null;

  if (socket && socketToken !== accessToken) {
    socket.disconnect();
    socket = null;
  }

  if (!socket) {
    socketToken = accessToken;
    socket = io(`${apiOrigin}/operations`, {
      transports: ['websocket'],
      auth: { token: accessToken },
    });
  } else if (!socket.connected) {
    socket.connect();
  }

  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
  socketToken = null;
}
