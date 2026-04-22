import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { TeamChatReactionType, User } from '@prisma/client';
import { userPublicSelect } from '../common/user-public.select';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { S3Service } from '../storage/s3.service';

/** Narrow reaction fields so Prisma never nests `message` (avoids circular JSON on serialize). */
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
  reactions: { select: { userId: true, type: true } },
} as const;

type AuthorRow = {
  id: string;
  name: string;
  titlePrefix: string;
  avatarS3Key: string | null;
};

type MessageRow = {
  id: string;
  body: string;
  createdAt: Date;
  author: AuthorRow;
  replyTo: {
    id: string;
    body: string;
    createdAt: Date;
    author: AuthorRow;
  } | null;
  reactions: { userId: string; type: TeamChatReactionType }[];
};

@Injectable()
export class TeamChatService {
  private readonly log = new Logger(TeamChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly s3: S3Service,
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

  /**
   * Presign GET URLs for every distinct avatar key referenced in the batch.
   * Done in parallel to avoid N+1 latency.
   */
  private async buildAvatarUrlMap(rows: MessageRow[]): Promise<Map<string, string>> {
    const keys = new Set<string>();
    for (const r of rows) {
      if (r.author.avatarS3Key) keys.add(r.author.avatarS3Key);
      if (r.replyTo?.author.avatarS3Key) keys.add(r.replyTo.author.avatarS3Key);
    }
    const entries = await Promise.all(
      Array.from(keys).map(async (key) => {
        try {
          const { url } = await this.s3.presignGet(key);
          return [key, url ?? ''] as const;
        } catch {
          return [key, ''] as const;
        }
      }),
    );
    return new Map(entries.filter((entry): entry is readonly [string, string] => !!entry[1]));
  }

  private authorDto(a: AuthorRow, urls: Map<string, string>) {
    return {
      id: a.id,
      name: a.name,
      titlePrefix: a.titlePrefix,
      avatarUrl: a.avatarS3Key ? urls.get(a.avatarS3Key) ?? null : null,
    };
  }

  private mapMessage(row: MessageRow, viewerId: string, urls: Map<string, string>) {
    return {
      id: row.id,
      body: row.body,
      createdAt: row.createdAt,
      author: this.authorDto(row.author, urls),
      replyTo: row.replyTo
        ? {
            id: row.replyTo.id,
            body: row.replyTo.body,
            createdAt: row.replyTo.createdAt,
            author: this.authorDto(row.replyTo.author, urls),
          }
        : null,
      reactions: this.summarizeReactions(row.reactions, viewerId),
    };
  }

  async list(limit = 200, viewer: User) {
    const take = Math.min(Math.max(1, limit), 500);
    const rows = (await this.prisma.teamChatMessage.findMany({
      take,
      orderBy: { createdAt: 'asc' },
      include: messageInclude,
    })) as unknown as MessageRow[];
    const urls = await this.buildAvatarUrlMap(rows);
    return rows.map((r) => this.mapMessage(r, viewer.id, urls));
  }

  async create(body: string, user: User, replyToId?: string) {
    if (replyToId) {
      const parent = await this.prisma.teamChatMessage.findUnique({
        where: { id: replyToId },
      });
      if (!parent) throw new BadRequestException('Reply target not found');
    }
    const msg = (await this.prisma.teamChatMessage.create({
      data: {
        body: body.trim(),
        authorId: user.id,
        replyToId: replyToId ?? null,
      },
      include: messageInclude,
    })) as unknown as MessageRow;
    const urls = await this.buildAvatarUrlMap([msg]);
    const mapped = this.mapMessage(msg, user.id, urls);
    try {
      this.realtime.emitTeamChatMessage(mapped);
    } catch (e) {
      this.log.warn(`team_chat broadcast failed: ${e instanceof Error ? e.message : String(e)}`);
    }
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
