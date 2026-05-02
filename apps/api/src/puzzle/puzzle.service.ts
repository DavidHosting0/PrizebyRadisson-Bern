import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { scrapePuzzelTickets } from './puzzel-scraper';

@Injectable()
export class PuzzleService {
  private readonly log = new Logger(PuzzleService.name);

  /** Single-flight background sync promise */
  private syncInFlight: Promise<void> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  listTickets() {
    return this.prisma.puzzelTicket.findMany({
      orderBy: { scrapedAt: 'desc' },
    });
  }

  async getSyncStatus() {
    return this.settings.getPuzzelTicketSyncMeta();
  }

  requestBackgroundSync(): { status: 'started' | 'already_running' } {
    if (this.syncInFlight) return { status: 'already_running' };
    this.syncInFlight = this.runSync().finally(() => {
      this.syncInFlight = null;
    });
    return { status: 'started' };
  }

  /** Used by cron: only enqueue when credentials + env allow */
  async runScheduledSyncIfEnabled() {
    if (process.env.PUZZEL_AUTO_SYNC !== 'true') return;
    const creds = await this.settings.getPuzzelLoginSecrets();
    if (!creds?.password?.trim()) return;
    this.requestBackgroundSync();
  }

  private async runSync() {
    await this.settings.mergePuzzelTicketSyncMeta({ inProgress: true, lastError: null });
    try {
      const creds = await this.settings.getPuzzelLoginSecrets();
      if (!creds?.password?.trim() || !creds.email?.trim()) {
        throw new Error('Puzzle-Zugangsdaten unvollständig (E-Mail oder Passwort fehlt). Admin → Puzzle.');
      }
      const baseUrl = process.env.PUZZEL_BASE_URL ?? 'https://radissonemea.cm.puzzel.com';
      const ticketsPath = process.env.PUZZEL_TICKETS_PATH ?? '/tickets';
      const savedSearchName = process.env.PUZZEL_SAVED_SEARCH_NAME ?? "My Favourite Team's Open Tickets";
      const headless = process.env.PUZZEL_HEADLESS !== 'false';

      const rows = await scrapePuzzelTickets({
        baseUrl,
        ticketsPath,
        savedSearchName,
        email: creds.email.trim(),
        password: creds.password,
        totpSecret: creds.totpSecret?.trim() || undefined,
        headless,
      });

      const now = new Date();
      await this.prisma.$transaction(async (tx) => {
        await tx.puzzelTicket.deleteMany();
        if (rows.length > 0) {
          await tx.puzzelTicket.createMany({
            data: rows.map((r) => ({
              externalKey: r.externalKey.slice(0, 500),
              subject: r.subject.slice(0, 2000),
              reference: r.reference?.slice(0, 256) ?? null,
              status: r.status?.slice(0, 256) ?? null,
              detailHref: r.detailHref?.slice(0, 2000) ?? null,
              rowSummary: r.rowSummary.slice(0, 8000),
              metadata: (r.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
              scrapedAt: now,
            })),
          });
        }
      });

      await this.settings.mergePuzzelTicketSyncMeta({
        inProgress: false,
        lastError: null,
        lastSyncedAt: now.toISOString(),
        lastTicketCount: rows.length,
      });
      this.log.log(`Puzzle sync OK: ${rows.length} tickets`);
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      await this.settings.mergePuzzelTicketSyncMeta({ inProgress: false, lastError: msg });
      this.log.warn(`Puzzle sync failed: ${msg}`);
    }
  }
}
