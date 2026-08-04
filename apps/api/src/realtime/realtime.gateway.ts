import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  namespace: '/operations',
  cors: { origin: true, credentials: true },
})
export class RealtimeGateway implements OnGatewayConnection {
  private readonly log = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) return;
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token, {
        secret: this.config.getOrThrow<string>('jwt.accessSecret'),
      });
      if (payload?.sub) {
        await client.join(`user:${payload.sub}`);
      }
    } catch {
      this.log.debug('Socket connection without valid JWT — broadcast only');
    }
  }

  emitToUser(userId: string, event: string, payload: unknown) {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }

  emitRoomStatus(payload: unknown) {
    this.server?.emit('room.status_updated', payload);
  }

  emitChecklistTask(payload: unknown) {
    this.server?.emit('checklist.task_updated', payload);
  }

  emitServiceRequest(event: string, payload: unknown) {
    this.server?.emit(event, payload);
  }

  emitTeamChatMessage(payload: unknown) {
    this.server?.emit('team_chat.message', payload);
  }

  emitTeamChatReaction(payload: unknown) {
    this.server?.emit('team_chat.reaction', payload);
  }

  emitTeamChatDeleted(payload: unknown) {
    this.server?.emit('team_chat.deleted', payload);
  }

  emitDamageReport(event: string, payload: unknown) {
    this.server?.emit(event, payload);
  }

  emitEmmaIntegrationAlert(payload: unknown) {
    this.server?.emit('emma.integration_alert', payload);
  }
}
