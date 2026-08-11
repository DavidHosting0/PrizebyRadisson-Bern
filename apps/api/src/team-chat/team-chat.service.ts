import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PermissionCode, User } from '@prisma/client';
import { isSupportedLocale, resolveLocale, type SupportedLocale } from '@housekeeping/shared';
import { userPublicSelect } from '../common/user-public.select';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { S3Service } from '../storage/s3.service';
import { PermissionsService } from '../permissions/permissions.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TranslationService } from '../translation/translation.service';

/** Narrow reaction fields so Prisma never nests `message` (avoids circular JSON on serialize). */
const messageInclude = {
  author: { select: userPublicSelect },
  replyTo: {
    select: {
      id: true,
      body: true,
      createdAt: true,
      deletedAt: true,
      author: { select: userPublicSelect },
    },
  },
  reactions: { select: { userId: true, emoji: true } },
  mentions: {
    include: {
      user: { select: userPublicSelect },
    },
  },
} as const;

type AuthorRow = {
  id: string;
  name: string;
  titlePrefix: string;
  avatarS3Key: string | null;
};

type MentionRow = {
  user: AuthorRow;
};

type MessageRow = {
  id: string;
  body: string;
  sourceLocale: string | null;
  createdAt: Date;
  author: AuthorRow;
  replyTo: {
    id: string;
    body: string;
    createdAt: Date;
    deletedAt: Date | null;
    author: AuthorRow;
  } | null;
  reactions: { userId: string; emoji: string }[];
  mentions: MentionRow[];
};

const mentionableUserInclude = {
  permissionGrants: { select: { permission: true } },
  roleAssignments: {
    include: {
      role: { include: { permissions: { select: { permission: true } } } },
    },
  },
} as const;

@Injectable()
export class TeamChatService {
  private readonly log = new Logger(TeamChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly s3: S3Service,
    private readonly permissions: PermissionsService,
    private readonly notifications: NotificationsService,
    private readonly translation: TranslationService,
  ) {}

  private userHasTeamChatRead(
    user: {
      role: User['role'];
      titlePrefix: User['titlePrefix'];
      permissionGrants: { permission: PermissionCode }[];
      roleAssignments: {
        role: { permissions: { permission: PermissionCode }[] };
      }[];
    },
  ): boolean {
    const grants = user.permissionGrants.map((g) => g.permission);
    const rolePerms = Array.from(
      new Set(
        user.roleAssignments.flatMap((a) => a.role.permissions.map((p) => p.permission)),
      ),
    );
    const effective = this.permissions.effectiveFor(
      user.role,
      user.titlePrefix,
      grants,
      rolePerms,
    );
    return this.permissions.has(effective, PermissionCode.TEAM_CHAT_READ);
  }

  private summarizeReactions(
    reactions: { userId: string; emoji: string }[],
    viewerId: string,
  ): { emoji: string; count: number; me: boolean }[] {
    const map = new Map<string, { count: number; me: boolean }>();
    for (const r of reactions) {
      const cur = map.get(r.emoji) ?? { count: 0, me: false };
      cur.count++;
      if (r.userId === viewerId) cur.me = true;
      map.set(r.emoji, cur);
    }
    return [...map.entries()]
      .map(([emoji, s]) => ({ emoji, count: s.count, me: s.me }))
      .sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji));
  }

  private normalizeEmoji(raw: string): string {
    const emoji = raw.trim();
    if (!emoji || emoji.length > 32) {
      throw new BadRequestException('Invalid emoji');
    }
    // Block obvious non-emoji payloads (urls, long ascii words).
    if (/https?:\/\//i.test(emoji) || /^[a-zA-Z0-9_\-.]{3,}$/.test(emoji)) {
      throw new BadRequestException('Invalid emoji');
    }
    return emoji;
  }

  private async buildAvatarUrlMap(rows: MessageRow[]): Promise<Map<string, string>> {
    const keys = new Set<string>();
    for (const r of rows) {
      if (r.author.avatarS3Key) keys.add(r.author.avatarS3Key);
      if (r.replyTo?.author.avatarS3Key) keys.add(r.replyTo.author.avatarS3Key);
      for (const m of r.mentions) {
        if (m.user.avatarS3Key) keys.add(m.user.avatarS3Key);
      }
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

  private mentionDtos(mentions: MentionRow[]) {
    return mentions.map((m) => ({
      userId: m.user.id,
      name: m.user.name,
    }));
  }

  private async resolveTranslatedBody(
    messageId: string,
    body: string,
    sourceLocale: string | null,
    mentions: MentionRow[],
    targetLocale: SupportedLocale,
  ): Promise<{ displayBody: string; bodyTranslated: string | null; isTranslated: boolean }> {
    const mentionList = this.mentionDtos(mentions);
    const detected = this.translation.detectLocale(body);

    // Only skip when detection confidently says the text is already in the UI language.
    // Never trust a stored sourceLocale alone — TR/DE text was often mis-tagged as "en".
    if (detected === targetLocale) {
      return { displayBody: body, bodyTranslated: null, isTranslated: false };
    }

    const stored = isSupportedLocale(sourceLocale) ? sourceLocale : null;

    const cached = await this.prisma.teamChatMessageTranslation.findUnique({
      where: { messageId_locale: { messageId, locale: targetLocale } },
    });
    if (cached) {
      return { displayBody: cached.body, bodyTranslated: body, isTranslated: true };
    }

    const result = await this.translation.translateChatBody(
      body,
      targetLocale,
      mentionList,
      detected,
    );
    if (!result) {
      return { displayBody: body, bodyTranslated: null, isTranslated: false };
    }

    // Model said it's already in the target language.
    if (result.body === body && result.sourceLocale === targetLocale) {
      if (!sourceLocale || sourceLocale !== targetLocale) {
        void this.prisma.teamChatMessage
          .update({
            where: { id: messageId },
            data: { sourceLocale: targetLocale },
          })
          .catch(() => undefined);
      }
      return { displayBody: body, bodyTranslated: null, isTranslated: false };
    }

    await this.prisma.teamChatMessageTranslation.upsert({
      where: { messageId_locale: { messageId, locale: targetLocale } },
      create: { messageId, locale: targetLocale, body: result.body },
      update: { body: result.body },
    });

    if (result.sourceLocale && result.sourceLocale !== stored) {
      void this.prisma.teamChatMessage
        .update({
          where: { id: messageId },
          data: { sourceLocale: result.sourceLocale },
        })
        .catch(() => undefined);
    }

    return { displayBody: result.body, bodyTranslated: body, isTranslated: true };
  }

  private async mapMessage(
    row: MessageRow,
    viewerId: string,
    urls: Map<string, string>,
    targetLocale: SupportedLocale,
  ) {
    const { displayBody, bodyTranslated, isTranslated } = await this.resolveTranslatedBody(
      row.id,
      row.body,
      row.sourceLocale,
      row.mentions,
      targetLocale,
    );

    let replyTo = null;
    if (row.replyTo) {
      if (row.replyTo.deletedAt) {
        replyTo = {
          id: row.replyTo.id,
          body: '',
          bodyTranslated: null,
          createdAt: row.replyTo.createdAt,
          author: this.authorDto(row.replyTo.author, urls),
          deleted: true,
        };
      } else {
        const replyMentions: MentionRow[] = [];
        const replyTranslation = await this.resolveTranslatedBody(
          row.replyTo.id,
          row.replyTo.body,
          null,
          replyMentions,
          targetLocale,
        );
        replyTo = {
          id: row.replyTo.id,
          body: replyTranslation.displayBody,
          bodyTranslated: replyTranslation.isTranslated ? row.replyTo.body : null,
          createdAt: row.replyTo.createdAt,
          author: this.authorDto(row.replyTo.author, urls),
          deleted: false,
        };
      }
    }

    const sourceLocale =
      this.translation.detectLocale(row.body) ??
      (isSupportedLocale(row.sourceLocale) ? row.sourceLocale : null);

    return {
      id: row.id,
      body: displayBody,
      bodyTranslated,
      sourceLocale,
      isTranslated,
      createdAt: row.createdAt,
      author: this.authorDto(row.author, urls),
      replyTo,
      reactions: this.summarizeReactions(row.reactions, viewerId),
      mentions: row.mentions.map((m) => this.authorDto(m.user, urls)),
    };
  }

  async list(
    limit = 200,
    viewer: User,
    lang?: string,
    order: 'asc' | 'desc' = 'asc',
  ) {
    const take = Math.min(Math.max(1, limit), 500);
    const targetLocale = resolveLocale(lang, viewer.preferredLocale);
    const rows = (await this.prisma.teamChatMessage.findMany({
      take,
      where: { deletedAt: null },
      orderBy: { createdAt: order },
      include: messageInclude,
    })) as unknown as MessageRow[];
    const urls = await this.buildAvatarUrlMap(rows);
    return Promise.all(rows.map((r) => this.mapMessage(r, viewer.id, urls, targetLocale)));
  }

  private setSourceLocaleAsync(messageId: string, body: string) {
    const detected = this.translation.detectLocale(body);
    if (!detected) return;
    void this.prisma.teamChatMessage
      .update({
        where: { id: messageId },
        data: { sourceLocale: detected },
      })
      .catch((e) => {
        this.log.warn(`sourceLocale update failed: ${e instanceof Error ? e.message : String(e)}`);
      });
  }

  async listMentionables(query: string) {
    const q = query.trim().toLowerCase();
    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
      },
      select: {
        id: true,
        name: true,
        titlePrefix: true,
        avatarS3Key: true,
        role: true,
        permissionGrants: { select: { permission: true } },
        roleAssignments: {
          include: {
            role: { include: { permissions: { select: { permission: true } } } },
          },
        },
      },
      orderBy: { name: 'asc' },
      take: 50,
    });

    const eligible = users.filter((u) => this.userHasTeamChatRead(u)).slice(0, 20);
    const urls = await Promise.all(
      eligible.map(async (u) => {
        let avatarUrl: string | null = null;
        if (u.avatarS3Key) {
          try {
            avatarUrl = (await this.s3.presignGet(u.avatarS3Key)).url ?? null;
          } catch {
            avatarUrl = null;
          }
        }
        return {
          id: u.id,
          name: u.name,
          titlePrefix: u.titlePrefix,
          avatarUrl,
        };
      }),
    );
    return urls;
  }

  private async validateMentionUserIds(mentionUserIds: string[]) {
    const unique = [...new Set(mentionUserIds.filter(Boolean))];
    if (unique.length === 0) return [];

    const users = await this.prisma.user.findMany({
      where: { id: { in: unique }, isActive: true },
      include: mentionableUserInclude,
    });

    const validIds: string[] = [];
    for (const u of users) {
      if (this.userHasTeamChatRead(u)) validIds.push(u.id);
    }
    if (validIds.length !== unique.length) {
      throw new BadRequestException('One or more mentioned users are invalid');
    }
    return validIds;
  }

  async create(body: string, user: User, replyToId?: string, mentionUserIds: string[] = []) {
    if (replyToId) {
      const parent = await this.prisma.teamChatMessage.findUnique({
        where: { id: replyToId },
      });
      if (!parent || parent.deletedAt) throw new BadRequestException('Reply target not found');
    }

    const validMentionIds = await this.validateMentionUserIds(mentionUserIds);

    const msg = await this.prisma.$transaction(async (tx) => {
      const created = await tx.teamChatMessage.create({
        data: {
          body: body.trim(),
          authorId: user.id,
          replyToId: replyToId ?? null,
          ...(validMentionIds.length > 0
            ? {
                mentions: {
                  create: validMentionIds.map((userId) => ({ userId })),
                },
              }
            : {}),
        },
        include: messageInclude,
      });
      return created;
    });

    const row = msg as unknown as MessageRow;
    const urls = await this.buildAvatarUrlMap([row]);
    const targetLocale = resolveLocale(user.preferredLocale);
    const mapped = await this.mapMessage(row, user.id, urls, targetLocale);

    void this.setSourceLocaleAsync(row.id, row.body);

    try {
      this.realtime.emitTeamChatMessage(mapped);
    } catch (e) {
      this.log.warn(`team_chat broadcast failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    if (validMentionIds.length > 0) {
      // Mentions always notify (on/off shift). Await so the row + push are durable.
      await this.notifications.notifyTeamChatMention(
        row.id,
        user.name,
        validMentionIds,
        user.id,
      );
    }

    return mapped;
  }

  async toggleReaction(messageId: string, emojiRaw: string, user: User) {
    const emoji = this.normalizeEmoji(emojiRaw);
    const msg = await this.prisma.teamChatMessage.findFirst({
      where: { id: messageId, deletedAt: null },
    });
    if (!msg) throw new NotFoundException();

    const existing = await this.prisma.teamChatMessageReaction.findUnique({
      where: {
        messageId_userId_emoji: { messageId, userId: user.id, emoji },
      },
    });

    if (existing) {
      await this.prisma.teamChatMessageReaction.delete({ where: { id: existing.id } });
    } else {
      await this.prisma.teamChatMessageReaction.create({
        data: { messageId, userId: user.id, emoji },
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

  async softDelete(messageId: string, user: User) {
    const msg = await this.prisma.teamChatMessage.findFirst({
      where: { id: messageId, deletedAt: null },
    });
    if (!msg) throw new NotFoundException();

    await this.prisma.teamChatMessage.update({
      where: { id: messageId },
      data: { deletedAt: new Date(), deletedByUserId: user.id },
    });

    this.realtime.emitTeamChatDeleted({ messageId });
    return { messageId, deleted: true };
  }
}
