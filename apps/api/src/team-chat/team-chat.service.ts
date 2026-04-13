import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { userPublicSelect } from '../common/user-public.select';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

@Injectable()
export class TeamChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async list(limit = 200) {
    const take = Math.min(Math.max(1, limit), 500);
    return this.prisma.teamChatMessage.findMany({
      take,
      orderBy: { createdAt: 'asc' },
      include: { author: { select: userPublicSelect } },
    });
  }

  async create(body: string, user: User) {
    const msg = await this.prisma.teamChatMessage.create({
      data: { body: body.trim(), authorId: user.id },
      include: { author: { select: userPublicSelect } },
    });
    this.realtime.emitTeamChatMessage(msg);
    return msg;
  }
}
