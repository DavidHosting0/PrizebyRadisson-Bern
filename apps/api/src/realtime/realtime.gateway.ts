import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({
  namespace: '/operations',
  cors: { origin: true, credentials: true },
})
export class RealtimeGateway {
  @WebSocketServer()
  server!: Server;

  emitRoomStatus(payload: unknown) {
    this.server?.emit('room.status_updated', payload);
  }

  emitChecklistTask(payload: unknown) {
    this.server?.emit('checklist.task_updated', payload);
  }

  emitServiceRequest(event: string, payload: unknown) {
    this.server?.emit(event, payload);
  }
}
