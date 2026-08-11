import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';

type PushPayload = {
  title: string;
  body: string;
  linkPath: string;
};

@Injectable()
export class PushService {
  private readonly log = new Logger(PushService.name);
  private configured = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.initVapid();
  }

  private initVapid() {
    const publicKey = this.config.get<string>('vapid.publicKey') ?? '';
    const privateKey = this.config.get<string>('vapid.privateKey') ?? '';
    const subject = this.config.get<string>('vapid.subject') ?? 'mailto:housekeeping@localhost';
    if (!publicKey || !privateKey) {
      this.log.warn('VAPID keys not configured — web push disabled');
      return;
    }
    webpush.setVapidDetails(subject, publicKey, privateKey);
    this.configured = true;
  }

  getVapidPublicKey(): string | null {
    const key = this.config.get<string>('vapid.publicKey') ?? '';
    return key || null;
  }

  async upsertSubscription(
    userId: string,
    sub: { endpoint: string; p256dh: string; auth: string; userAgent?: string },
  ) {
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      create: {
        userId,
        endpoint: sub.endpoint,
        p256dh: sub.p256dh,
        auth: sub.auth,
        userAgent: sub.userAgent ?? null,
      },
      update: {
        userId,
        p256dh: sub.p256dh,
        auth: sub.auth,
        userAgent: sub.userAgent ?? null,
      },
    });
    return { ok: true };
  }

  async removeSubscription(endpoint: string, userId?: string) {
    await this.prisma.pushSubscription.deleteMany({
      where: {
        endpoint,
        ...(userId ? { userId } : {}),
      },
    });
    return { ok: true };
  }

  private async sendOnce(
    sub: { endpoint: string; p256dh: string; auth: string },
    body: string,
  ) {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      body,
    );
  }

  async sendToUser(userId: string, payload: PushPayload) {
    if (!this.configured) return;
    const subs = await this.prisma.pushSubscription.findMany({
      where: { userId },
    });
    if (subs.length === 0) return;

    const body = JSON.stringify({
      title: payload.title,
      body: payload.body,
      linkPath: payload.linkPath,
    });

    const maxAttempts = 3;
    await Promise.all(
      subs.map(async (sub) => {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            await this.sendOnce(sub, body);
            return;
          } catch (e: unknown) {
            const status = (e as { statusCode?: number })?.statusCode;
            if (status === 404 || status === 410) {
              await this.prisma.pushSubscription.delete({ where: { id: sub.id } });
              return;
            }
            const msg = e instanceof Error ? e.message : String(e);
            if (attempt >= maxAttempts) {
              this.log.warn(`push failed for ${sub.endpoint} after ${attempt} attempts: ${msg}`);
              return;
            }
            this.log.debug(`push retry ${attempt}/${maxAttempts} for ${sub.endpoint}: ${msg}`);
            await new Promise((r) => setTimeout(r, 200 * attempt));
          }
        }
      }),
    );
  }
}
