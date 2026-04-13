import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TeamChatReactionType, User } from '@prisma/client';
import { userPublicSelect } from '../common/user-public.select';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

const messageInclude = {
  author: { select: userPublicSelect },
  replyTo: {
    select: {
      id: true,
      body: true,
      createdAt: true,
      author: { select: userPublicSelect },
    },
  },
  reactions: true,
} as const;

@Injectable()
export class TeamChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  private summarizeReactions(
    reactions: { userId: string; type: TeamChatReactionType }[],
    viewerId: string,
  ): { type: TeamChatReactionType; count: number; me: boolean }[] {
    const order: TeamChatReactionType[] = [
      TeamChatReactionType.THUMBS_UP,
      TeamChatReactionType.CHECK_MARK,
      TeamChatReactionType.HEART,
      TeamChatReactionType.EYES,
      TeamChatReactionType.EXCLAMATION_QUESTION,
    ];
    const map = new Map<TeamChatReactionType, { count: number; me: boolean }>();
    for (const t of order) {
      map.set(t, { count: 0, me: false });
    }
    for (const r of reactions) {
      const cur = map.get(r.type) ?? { count: 0, me: false };
      cur.count++;
      if (r.userId === viewerId) cur.me = true;
      map.set(r.type, cur);
    }
    return order
      .map((type) => {
        const s = map.get(type)!;
        return { type, count: s.count, me: s.me };
      })
      .filter((x) => x.count > 0);
  }

  private mapMessage(
    row: {
      id: string;
      body: string;
      createdAt: Date;
      author: { id: string; name: string; titlePrefix: string };
      replyTo: {
        id: string;
        body: string;
        createdAt: Date;
        author: { id: string; name: string; titlePrefix: string };
      } | null;
      reactions: { userId: string; type: TeamChatReactionType }[];
    },
    viewerId: string,
  ) {
    return {
      id: row.id,
      body: row.body,
      createdAt: row.createdAt,
      author: row.author,
      replyTo: row.replyTo,
      reactions: this.summarizeReactions(row.reactions, viewerId),
    };
  }

  async list(limit = 200, viewer: User) {
    const take = Math.min(Math.max(1, limit), 500);
    const rows = await this.prisma.teamChatMessage.findMany({
      take,
      orderBy: { createdAt: 'asc' },
      include: messageInclude,
    });
    return rows.map((r) => this.mapMessage(r, viewer.id));
  }

  async create(body: string, user: User, replyToId?: string) {
    if (replyToId) {
      const parent = await this.prisma.teamChatMessage.findUnique({
        where: { id: replyToId },
      });
      if (!parent) throw new BadRequestException('Reply target not found');
    }
    const msg = await this.prisma.teamChatMessage.create({
      data: {
        body: body.trim(),
        authorId: user.id,
        replyToId: replyToId ?? null,
      },
      include: messageInclude,
    });
    const mapped = this.mapMessage(msg, user.id);
    this.realtime.emitTeamChatMessage(mapped);
    return mapped;
  }

  async toggleReaction(messageId: string, type: TeamChatReactionType, user: User) {
    const msg = await this.prisma.teamChatMessage.findUnique({ where: { id: messageId } });
    if (!msg) throw new NotFoundException();

    const existing = await this.prisma.teamChatMessageReaction.findUnique({
      where: {
        messageId_userId_type: { messageId, userId: user.id, type },
      },
    });

    if (existing) {
      await this.prisma.teamChatMessageReaction.delete({ where: { id: existing.id } });
    } else {
      await this.prisma.teamChatMessageReaction.create({
        data: { messageId, userId: user.id, type },
      });
    }

    this.realtime.emitTeamChatReaction({ messageId });
    const reactions = await this.prisma.teamChatMessageReaction.findMany({
      where: { messageId },
    });
    return {
      messageId,
      reactions: this.summarizeReactions(reactions, user.id),
    };
  }
}
