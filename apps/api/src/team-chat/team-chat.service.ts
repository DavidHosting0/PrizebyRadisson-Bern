import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PermissionCode, User } from '@prisma/client';
import {
  isAllowedTeamChatUploadMime,
  isSupportedLocale,
  isTeamChatPhotoTooLarge,
  isTeamChatVideoContentType,
  orderTeamChatWindow,
  resolveLocale,
  sniffTeamChatMediaPrefix,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from '@housekeeping/shared';
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
      photoS3Key: true,
      createdAt: true,
      deletedAt: true,
      author: { select: userPublicSelect },
    },
  },
  reactions: { select: { userId: true, emoji: true, user: { select: userPublicSelect } } },
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
  photoS3Key: string | null;
  sourceLocale: string | null;
  createdAt: Date;
  author: AuthorRow;
  replyTo: {
    id: string;
    body: string;
    photoS3Key: string | null;
    createdAt: Date;
    deletedAt: Date | null;
    author: AuthorRow;
  } | null;
  reactions: {
    userId: string;
    emoji: string;
    user: AuthorRow;
  }[];
  mentions: MentionRow[];
};

type TranslateMode = 'none' | 'cache';

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
  private readonly photoSkipCache = new Map<string, { at: number; skip: boolean }>();
  private static readonly PHOTO_SKIP_TTL_MS = 10 * 60_000;

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
    reactions: { userId: string; emoji: string; user?: AuthorRow | null }[],
    viewerId: string,
    avatarUrls?: Map<string, string>,
  ): {
    emoji: string;
    count: number;
    me: boolean;
    users: { id: string; name: string; titlePrefix: string; avatarUrl: string | null }[];
  }[] {
    const map = new Map<
      string,
      {
        count: number;
        me: boolean;
        users: { id: string; name: string; titlePrefix: string; avatarUrl: string | null }[];
      }
    >();
    for (const r of reactions) {
      const cur = map.get(r.emoji) ?? { count: 0, me: false, users: [] };
      cur.count++;
      if (r.userId === viewerId) cur.me = true;
      const name = r.user?.name?.trim() || '—';
      const titlePrefix = r.user?.titlePrefix ?? '';
      const avatarUrl =
        r.user?.avatarS3Key && avatarUrls
          ? avatarUrls.get(r.user.avatarS3Key) ?? null
          : null;
      if (!cur.users.some((u) => u.id === r.userId)) {
        cur.users.push({ id: r.userId, name, titlePrefix, avatarUrl });
      }
      map.set(r.emoji, cur);
    }
    return [...map.entries()]
      .map(([emoji, s]) => ({
        emoji,
        count: s.count,
        me: s.me,
        users: s.users.sort((a, b) => a.name.localeCompare(b.name)),
      }))
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

  private async shouldSkipChatPhoto(key: string): Promise<boolean> {
    const hit = this.photoSkipCache.get(key);
    if (hit && Date.now() - hit.at < TeamChatService.PHOTO_SKIP_TTL_MS) return hit.skip;
    const meta = await this.s3.headObject(key);
    const skip = !!(
      meta &&
      (isTeamChatPhotoTooLarge(meta.contentLength) || isTeamChatVideoContentType(meta.contentType))
    );
    this.photoSkipCache.set(key, { at: Date.now(), skip });
    if (skip) {
      this.log.warn(`Skipping chat photo ${key} (video or oversized)`);
    }
    return skip;
  }

  private async assertChatPhotoSafe(key: string) {
    const meta = await this.s3.headObject(key);
    if (meta && (isTeamChatPhotoTooLarge(meta.contentLength) || isTeamChatVideoContentType(meta.contentType))) {
      throw new BadRequestException('Only image uploads are allowed');
    }
    const prefix = await this.s3.getObjectPrefix(key);
    if (prefix && sniffTeamChatMediaPrefix(prefix) === 'video') {
      throw new BadRequestException('Only image uploads are allowed');
    }
  }

  private async buildMediaUrlMap(
    rows: MessageRow[],
    opts?: { verifyPhotos?: boolean },
  ): Promise<{
    avatars: Map<string, string>;
    photos: Map<string, string>;
  }> {
    const avatarKeys = new Set<string>();
    const photoKeys = new Set<string>();
    for (const r of rows) {
      if (r.author.avatarS3Key) avatarKeys.add(r.author.avatarS3Key);
      if (r.replyTo?.author.avatarS3Key) avatarKeys.add(r.replyTo.author.avatarS3Key);
      for (const m of r.mentions) {
        if (m.user.avatarS3Key) avatarKeys.add(m.user.avatarS3Key);
      }
      for (const rx of r.reactions) {
        if (rx.user.avatarS3Key) avatarKeys.add(rx.user.avatarS3Key);
      }
      if (r.photoS3Key) photoKeys.add(r.photoS3Key);
      if (r.replyTo?.photoS3Key) photoKeys.add(r.replyTo.photoS3Key);
    }
    const verifyPhotos = opts?.verifyPhotos !== false;
    const resolvePhotos = async (keys: Set<string>) => {
      const entries = await Promise.all(
        Array.from(keys).map(async (key) => {
          try {
            if (verifyPhotos && (await this.shouldSkipChatPhoto(key))) return [key, ''] as const;
            const { url } = await this.s3.presignGet(key);
            return [key, url ?? ''] as const;
          } catch {
            return [key, ''] as const;
          }
        }),
      );
      return new Map(entries.filter((entry): entry is readonly [string, string] => !!entry[1]));
    };
    const resolveAvatars = async (keys: Set<string>) => {
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
    };
    const [avatars, photos] = await Promise.all([resolveAvatars(avatarKeys), resolvePhotos(photoKeys)]);
    return { avatars, photos };
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
    mode: TranslateMode = 'cache',
    transCache?: Map<string, string>,
  ): Promise<{ displayBody: string; bodyTranslated: string | null; isTranslated: boolean }> {
    if (!body.trim()) {
      return { displayBody: '', bodyTranslated: null, isTranslated: false };
    }

    if (mode === 'none') {
      return { displayBody: body, bodyTranslated: null, isTranslated: false };
    }

    const detected = this.translation.detectLocale(body);
    if (detected === targetLocale) {
      return { displayBody: body, bodyTranslated: null, isTranslated: false };
    }

    let cachedBody: string | undefined;
    if (transCache) {
      cachedBody = transCache.get(messageId);
    } else {
      const cached = await this.prisma.teamChatMessageTranslation.findUnique({
        where: { messageId_locale: { messageId, locale: targetLocale } },
      });
      cachedBody = cached?.body;
    }

    // DB is the only source of truth on read — never call OpenAI from list/polls.
    if (cachedBody != null) {
      if (cachedBody === body) {
        return { displayBody: body, bodyTranslated: null, isTranslated: false };
      }
      if (!this.translation.translationLooksPlausible(cachedBody, targetLocale)) {
        return { displayBody: body, bodyTranslated: null, isTranslated: false };
      }
      return { displayBody: cachedBody, bodyTranslated: body, isTranslated: true };
    }

    void sourceLocale;
    void mentions;
    return { displayBody: body, bodyTranslated: null, isTranslated: false };
  }

  /** One row per (message, locale) — real translation or identity skip marker. */
  private async persistTranslation(
    messageId: string,
    locale: SupportedLocale,
    body: string,
    transCache?: Map<string, string>,
  ) {
    await this.prisma.teamChatMessageTranslation.upsert({
      where: { messageId_locale: { messageId, locale } },
      create: { messageId, locale, body },
      update: { body },
    });
    transCache?.set(messageId, body);
  }

  private async mapMessage(
    row: MessageRow,
    viewerId: string,
    urls: { avatars: Map<string, string>; photos: Map<string, string> },
    targetLocale: SupportedLocale,
    mode: TranslateMode = 'cache',
    transCache?: Map<string, string>,
  ) {
    const { displayBody, bodyTranslated, isTranslated } = await this.resolveTranslatedBody(
      row.id,
      row.body,
      row.sourceLocale,
      row.mentions,
      targetLocale,
      mode,
      transCache,
    );

    let replyTo = null;
    if (row.replyTo) {
      if (row.replyTo.deletedAt) {
        replyTo = {
          id: row.replyTo.id,
          body: '',
          bodyTranslated: null,
          photoUrl: null,
          createdAt: row.replyTo.createdAt,
          author: this.authorDto(row.replyTo.author, urls.avatars),
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
          mode,
          transCache,
        );
        replyTo = {
          id: row.replyTo.id,
          body: replyTranslation.displayBody,
          bodyTranslated: replyTranslation.isTranslated ? row.replyTo.body : null,
          photoUrl: row.replyTo.photoS3Key
            ? urls.photos.get(row.replyTo.photoS3Key) ?? null
            : null,
          createdAt: row.replyTo.createdAt,
          author: this.authorDto(row.replyTo.author, urls.avatars),
          deleted: false,
        };
      }
    }

    const sourceLocale = row.body.trim()
      ? this.translation.detectLocale(row.body) ??
        (isSupportedLocale(row.sourceLocale) ? row.sourceLocale : null)
      : null;

    return {
      id: row.id,
      body: displayBody,
      bodyTranslated,
      sourceLocale,
      isTranslated,
      photoUrl: row.photoS3Key ? urls.photos.get(row.photoS3Key) ?? null : null,
      createdAt: row.createdAt,
      author: this.authorDto(row.author, urls.avatars),
      replyTo,
      reactions: this.summarizeReactions(row.reactions, viewerId, urls.avatars),
      mentions: row.mentions.map((m) => this.authorDto(m.user, urls.avatars)),
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
    const newestFirst = (await this.prisma.teamChatMessage.findMany({
      take,
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: messageInclude,
    })) as unknown as MessageRow[];
    const rows = orderTeamChatWindow(newestFirst, order);
    const ids = [...new Set(rows.flatMap((r) => (r.replyTo ? [r.id, r.replyTo.id] : [r.id])))];
    const [urls, translationRows] = await Promise.all([
      this.buildMediaUrlMap(rows),
      ids.length
        ? this.prisma.teamChatMessageTranslation.findMany({
            where: { messageId: { in: ids }, locale: targetLocale },
            select: { messageId: true, body: true },
          })
        : Promise.resolve([]),
    ]);
    const transCache = new Map(translationRows.map((t) => [t.messageId, t.body]));

    // Read-only: translations are written once on create. Never OpenAI here.
    const mapped = await Promise.all(
      rows.map((r) => this.mapMessage(r, viewer.id, urls, targetLocale, 'cache', transCache)),
    );
    return mapped;
  }

  /**
   * Translate a message into every UI locale exactly once and persist.
   * No-op when all locales already exist in DB — never re-calls OpenAI for that message.
   * @returns true if an OpenAI call was made
   */
  async ensureMessageFullyTranslated(messageId: string): Promise<boolean> {
    const row = await this.prisma.teamChatMessage.findUnique({
      where: { id: messageId },
      include: {
        mentions: { include: { user: { select: userPublicSelect } } },
        translations: { select: { locale: true } },
      },
    });
    if (!row || row.deletedAt || !row.body.trim()) return false;

    const have = new Set(row.translations.map((t) => t.locale));
    if (SUPPORTED_LOCALES.every((locale) => have.has(locale))) {
      return false;
    }

    const detected =
      (isSupportedLocale(row.sourceLocale) ? row.sourceLocale : null) ??
      this.translation.detectLocale(row.body);

    // Persist source-language identity without OpenAI.
    if (detected && !have.has(detected)) {
      await this.persistTranslation(row.id, detected, row.body);
      have.add(detected);
    }
    // Uncertain source: still mark nothing as identity until model returns.

    let missing = SUPPORTED_LOCALES.filter((locale) => !have.has(locale));
    if (missing.length === 0) return false;

    if (this.translation.isRateLimited()) return false;

    try {
      const { sourceLocale, byLocale } = await this.translation.translateChatBodyToAllLocales(
        row.body,
        this.mentionDtos(row.mentions),
        detected,
        missing,
      );
      if (sourceLocale && sourceLocale !== row.sourceLocale) {
        void this.prisma.teamChatMessage
          .update({ where: { id: row.id }, data: { sourceLocale } })
          .catch(() => undefined);
        if (!have.has(sourceLocale)) {
          await this.persistTranslation(row.id, sourceLocale, row.body);
          have.add(sourceLocale);
        }
      }
      for (const [locale, body] of byLocale) {
        await this.persistTranslation(row.id, locale, body);
        have.add(locale);
      }
      return true;
    } catch (e) {
      this.log.warn(
        `ensureMessageFullyTranslated failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      return false;
    }
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

  /** Active users who can read team chat, excluding the author. */
  private async listChatNotificationRecipientIds(excludeUserId: string): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: { isActive: true, id: { not: excludeUserId } },
      include: mentionableUserInclude,
    });
    return users.filter((u) => this.userHasTeamChatRead(u)).map((u) => u.id);
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

  async presign(contentType: string) {
    const mime = (contentType || '').toLowerCase().split(';')[0]!.trim() || 'image/jpeg';
    if (!isAllowedTeamChatUploadMime(mime)) {
      throw new BadRequestException('Only image uploads are allowed');
    }
    const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
    const key = this.s3.buildTeamChatKey(ext);
    const { url } = await this.s3.presignPut(key, mime);
    return { uploadUrl: url, key };
  }

  async create(
    body: string,
    user: User,
    replyToId?: string,
    mentionUserIds: string[] = [],
    photoS3Key?: string,
    lang?: string,
  ) {
    const text = (body ?? '').trim();
    const photoKey = photoS3Key?.trim() || null;
    if (!text && !photoKey) {
      throw new BadRequestException('Message body or photo required');
    }
    if (photoKey && !photoKey.startsWith('team-chat/')) {
      throw new BadRequestException('Invalid photo key');
    }
    if (text.length > 2000) {
      throw new BadRequestException('Message too long');
    }

    const mentionPromise = this.validateMentionUserIds(mentionUserIds);
    if (replyToId) {
      const parent = await this.prisma.teamChatMessage.findUnique({
        where: { id: replyToId },
      });
      if (!parent || parent.deletedAt) throw new BadRequestException('Reply target not found');
    }
    const validMentionIds = await mentionPromise;

    const detected = text ? this.translation.detectLocale(text) : null;
    const msg = await this.prisma.teamChatMessage.create({
      data: {
        body: text,
        photoS3Key: photoKey,
        authorId: user.id,
        replyToId: replyToId ?? null,
        sourceLocale: detected,
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

    const row = msg as unknown as MessageRow;

    // Kick off OpenAI immediately (parallel with media URLs) for near-live translation.
    const translatePromise = text
      ? this.ensureMessageFullyTranslated(row.id).catch((e) => {
          this.log.warn(
            `translate-on-create failed: ${e instanceof Error ? e.message : String(e)}`,
          );
          return false;
        })
      : Promise.resolve(false);

    const urls = await this.buildMediaUrlMap([row], { verifyPhotos: false });
    const targetLocale = resolveLocale(lang, user.preferredLocale);
    // Sender: instant HTTP reply with what they typed.
    const mapped = await this.mapMessage(row, user.id, urls, targetLocale, 'none');

    if (photoKey) {
      void this.assertChatPhotoSafe(photoKey).catch((e) => {
        this.log.warn(
          `Unsafe chat photo ${photoKey}: ${e instanceof Error ? e.message : String(e)}`,
        );
        void this.prisma.teamChatMessage
          .update({ where: { id: row.id }, data: { photoS3Key: null } })
          .catch(() => undefined);
      });
    }

    // 1) Broadcast original immediately so everyone sees the message live.
    try {
      this.realtime.emitTeamChatMessage({
        ...mapped,
        body: text || row.body,
        bodyTranslated: null,
        isTranslated: false,
        translationsByLocale: {},
      });
    } catch (e) {
      this.log.warn(`team_chat broadcast failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    // 2) When translations land, re-emit — clients swap to their UI language in place.
    if (text) {
      void this.finishTranslateAndRebroadcast(row, urls, text, translatePromise);
    }

    void this.listChatNotificationRecipientIds(user.id)
      .then(async (recipientIds) => {
        const mentioned = new Set(
          validMentionIds.filter((id) => id !== user.id),
        );
        const mentionRecipients = recipientIds.filter((id) => mentioned.has(id));
        const broadcastRecipients = recipientIds.filter((id) => !mentioned.has(id));
        const hasPhoto = !!row.photoS3Key;

        let mentionedNames: string[] = [];
        if (mentioned.size > 0) {
          const mentionedUsers = await this.prisma.user.findMany({
            where: { id: { in: [...mentioned] } },
            select: { id: true, name: true },
          });
          const nameById = new Map(mentionedUsers.map((u) => [u.id, u.name]));
          mentionedNames = validMentionIds
            .filter((id) => id !== user.id)
            .map((id) => nameById.get(id))
            .filter((n): n is string => !!n);
        }

        const tasks: Promise<unknown>[] = [
          this.notifications.notifyTeamChatMention(
            row.id,
            user.name,
            mentionRecipients,
            user.id,
            row.body,
            hasPhoto,
          ),
        ];

        if (mentionedNames.length > 0) {
          tasks.push(
            this.notifications.notifyTeamChatMentionOther(
              row.id,
              user.name,
              mentionedNames,
              broadcastRecipients,
              user.id,
              row.body,
              hasPhoto,
            ),
          );
        } else {
          tasks.push(
            this.notifications.notifyTeamChatMessage(
              row.id,
              user.name,
              broadcastRecipients,
              user.id,
              row.body,
              hasPhoto,
            ),
          );
        }

        await Promise.all(tasks);
      })
      .catch((e) => {
        this.log.warn(
          `team_chat notify failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      });

    return mapped;
  }

  /** Await in-flight translation, then push translationsByLocale for in-place UI update. */
  private async finishTranslateAndRebroadcast(
    row: MessageRow,
    urls: { avatars: Map<string, string>; photos: Map<string, string> },
    text: string,
    translatePromise: Promise<boolean>,
  ) {
    try {
      await Promise.race([
        translatePromise,
        new Promise<boolean>((resolve) => {
          setTimeout(() => resolve(false), 6_000);
        }),
      ]);
    } catch {
      return;
    }

    const translationRows = await this.prisma.teamChatMessageTranslation.findMany({
      where: { messageId: row.id },
      select: { locale: true, body: true },
    });
    const translationsByLocale = Object.fromEntries(
      translationRows
        .filter((t) => t.body.trim() && t.body !== text)
        .map((t) => [t.locale, t.body]),
    );
    if (Object.keys(translationsByLocale).length === 0) return;

    const base = await this.mapMessage(row, row.author.id, urls, 'en', 'none');
    try {
      this.realtime.emitTeamChatMessage({
        ...base,
        body: text,
        bodyTranslated: null,
        isTranslated: false,
        translationsByLocale,
      });
    } catch (e) {
      this.log.warn(`team_chat rebroadcast failed: ${e instanceof Error ? e.message : String(e)}`);
    }
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
      select: {
        userId: true,
        emoji: true,
        user: { select: userPublicSelect },
      },
    });
    const avatarKeys = new Set(
      reactions
        .map((r) => r.user.avatarS3Key)
        .filter((k): k is string => !!k),
    );
    const avatarEntries = await Promise.all(
      Array.from(avatarKeys).map(async (key) => {
        try {
          const { url } = await this.s3.presignGet(key);
          return [key, url ?? ''] as const;
        } catch {
          return [key, ''] as const;
        }
      }),
    );
    const avatarUrls = new Map(
      avatarEntries.filter((e): e is readonly [string, string] => !!e[1]),
    );
    return {
      messageId,
      reactions: this.summarizeReactions(reactions, user.id, avatarUrls),
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
