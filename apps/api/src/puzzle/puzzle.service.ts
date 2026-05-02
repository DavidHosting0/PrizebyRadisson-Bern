import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import {
  assignPuzzelTicketToMeOnPage,
  extractPuzzelMessagesFromPage,
  replyToPuzzelTicketOnPage,
  scrapePuzzelTicketsOnPage,
  type PuzzelScrapedMessage,
  type PuzzelScrapeOpts,
} from './puzzel-scraper';
import { PuzzelBrowserSessionService } from './puzzel-session.service';

const PRESERVED_METADATA_KEYS = ['lastAssignedViaPrizeBernAt'] as const;

@Injectable()
export class PuzzleService {
  private readonly log = new Logger(PuzzleService.name);

  /** Single-flight background sync promise */
  private syncInFlight: Promise<void> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly session: PuzzelBrowserSessionService,
  ) {}

  private progress(message: string) {
    this.log.log(message);
  }

  listTickets() {
    return this.prisma.puzzelTicket.findMany({
      orderBy: { scrapedAt: 'desc' },
    });
  }

  async getTicketMessages(ticketId: string) {
    const ticket = await this.prisma.puzzelTicket.findUnique({
      where: { id: ticketId },
      include: { messages: { orderBy: [{ scrapedAt: 'asc' }, { externalKey: 'asc' }] } },
    });
    if (!ticket) {
      throw new Error('Puzzel ticket not found.');
    }
    if (ticket.messages.length > 0) {
      return ticket.messages;
    }
    return this.refreshTicketMessages(ticketId);
  }

  async refreshTicketMessages(ticketId: string) {
    const ticket = await this.prisma.puzzelTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) {
      throw new Error('Puzzel ticket not found.');
    }
    const ticketUrl = ticket.detailHref || this.ticketUrlFromReference(ticket.reference);
    if (!ticketUrl) {
      throw new Error('Puzzel ticket has no detail URL/reference.');
    }

    const opts = await this.buildBaseOpts();
    const messages = await this.session.run(opts, async ({ gotoLoggedIn, page }) => {
      await gotoLoggedIn(ticketUrl);
      this.progress(`[Puzzel] Nachrichten laden für Ticket ${ticket.reference ?? ticket.externalKey}`);
      return extractPuzzelMessagesFromPage(page);
    });

    await this.replaceMessages(ticketId, ticket.externalKey, messages);

    return this.prisma.puzzelTicketMessage.findMany({
      where: { ticketId },
      orderBy: [{ scrapedAt: 'asc' }, { externalKey: 'asc' }],
    });
  }

  async assignTicketToMe(ticketId: string) {
    const ticket = await this.prisma.puzzelTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new Error('Puzzel ticket not found.');
    const ticketUrl = ticket.detailHref || this.ticketUrlFromReference(ticket.reference);
    if (!ticketUrl) throw new Error('Puzzel ticket has no detail URL/reference.');

    const opts = await this.buildBaseOpts();
    const actionOpts = { ...opts, ticketUrl } as PuzzelScrapeOpts & { ticketUrl: string; replyText?: string };
    await this.session.run(opts, async ({ page, gotoLoggedIn }) => {
      await gotoLoggedIn(ticketUrl);
      await assignPuzzelTicketToMeOnPage(page, actionOpts);
    });

    const assignedAt = new Date().toISOString();
    await this.prisma.puzzelTicket.update({
      where: { id: ticket.id },
      data: {
        metadata: {
          ...this.metadataRecord(ticket.metadata),
          lastAssignedViaPrizeBernAt: assignedAt,
        } as Prisma.InputJsonValue,
      },
    });
    return { ok: true as const, action: 'assign' as const, assignedAt };
  }

  async replyToTicket(ticketId: string, body: { message?: string }) {
    const message = body.message?.trim();
    if (!message) {
      throw new Error('Reply message is empty.');
    }
    const ticket = await this.prisma.puzzelTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new Error('Puzzel ticket not found.');
    const ticketUrl = ticket.detailHref || this.ticketUrlFromReference(ticket.reference);
    if (!ticketUrl) throw new Error('Puzzel ticket has no detail URL/reference.');

    const opts = await this.buildBaseOpts(message);
    const actionOpts = { ...opts, ticketUrl, replyText: message } as PuzzelScrapeOpts & {
      ticketUrl: string;
      replyText: string;
    };

    await this.session.run(opts, async ({ page, gotoLoggedIn }) => {
      await gotoLoggedIn(ticketUrl);
      await replyToPuzzelTicketOnPage(page, actionOpts);
    });

    await this.refreshTicketMessages(ticket.id).catch((e) => {
      this.log.warn(`Puzzel reply sent, but message refresh failed: ${(e as Error).message ?? String(e)}`);
    });

    return { ok: true as const, action: 'reply' as const };
  }

  async getSyncStatus() {
    const status = await this.settings.getPuzzelTicketSyncMeta();
    if (status.inProgress && !this.syncInFlight) {
      const msg = 'Vorherige Puzzel-Synchronisation wurde unterbrochen (API-Neustart oder Prozessabbruch).';
      await this.settings.mergePuzzelTicketSyncMeta({
        inProgress: false,
        lastError: msg,
      });
      this.log.warn(msg);
      return {
        ...status,
        inProgress: false,
        lastError: msg,
      };
    }
    return status;
  }

  async getFilter() {
    return this.settings.getPuzzelTicketFilter();
  }

  async updateFilter(patch: {
    savedSearchName?: string;
    teamName?: string;
    statusName?: string;
    timePeriod?: string;
  }) {
    return this.settings.updatePuzzelTicketFilter(patch);
  }

  private ticketUrlFromReference(reference: string | null) {
    if (!reference) return null;
    const baseUrl = process.env.PUZZEL_BASE_URL ?? 'https://radissonemea.cm.puzzel.com';
    return `${baseUrl.replace(/\/+$/, '')}/tickets/${encodeURIComponent(reference)}`;
  }

  private async buildBaseOpts(replyText?: string) {
    const creds = await this.settings.getPuzzelLoginSecrets();
    if (!creds?.password?.trim() || !creds.email?.trim()) {
      throw new Error('Puzzle-Zugangsdaten unvollständig (E-Mail oder Passwort fehlt). Admin → Puzzle.');
    }
    const filter = await this.settings.getPuzzelTicketFilter();
    const opts: PuzzelScrapeOpts & { ticketUrl?: string; replyText?: string } = {
      baseUrl: process.env.PUZZEL_BASE_URL ?? 'https://radissonemea.cm.puzzel.com',
      ticketsPath: process.env.PUZZEL_TICKETS_PATH ?? '/tickets',
      savedSearchName: filter.savedSearchName,
      teamName: filter.teamName,
      statusName: filter.statusName,
      timePeriod: filter.timePeriod,
      email: creds.email.trim(),
      password: creds.password,
      totpSecret: creds.totpSecret?.trim() || undefined,
      headless: process.env.PUZZEL_HEADLESS !== 'false',
      replyText,
      progress: (message: string) => this.progress(message),
    };
    return opts;
  }

  private metadataRecord(raw: unknown): Record<string, unknown> {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
    return {};
  }

  private rowFingerprint(raw: unknown): string | null {
    const metadata = this.metadataRecord(raw);
    return typeof metadata.syncFingerprint === 'string' ? metadata.syncFingerprint : null;
  }

  private mergeMetadataPreservingPrizeBernKeys(
    previousMetadata: unknown,
    nextScrapeMetadata: Record<string, unknown> | undefined,
  ): Record<string, unknown> {
    const merged: Record<string, unknown> = { ...(nextScrapeMetadata ?? {}) };
    const previous = this.metadataRecord(previousMetadata);
    for (const key of PRESERVED_METADATA_KEYS) {
      if (previous[key] !== undefined && merged[key] === undefined) {
        merged[key] = previous[key];
      }
    }
    return merged;
  }

  private async replaceMessages(
    ticketId: string,
    ticketExternalKey: string,
    messages: PuzzelScrapedMessage[],
    scrapedAt = new Date(),
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.puzzelTicketMessage.deleteMany({ where: { ticketId } });
      await tx.puzzelTicketMessage.createMany({
        data: messages.map((m) => ({
          ticketId,
          externalKey: `${ticketExternalKey}:${m.externalKey}`.slice(0, 500),
          sentAtText: m.sentAtText?.slice(0, 256) ?? null,
          fromText: m.fromText?.slice(0, 512) ?? null,
          toText: m.toText?.slice(0, 512) ?? null,
          direction: m.direction,
          bodyText: m.bodyText,
          bodyHtml: m.bodyHtml,
          metadata: (m.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
          scrapedAt,
        })),
      });
    });
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
    await this.settings.mergePuzzelTicketSyncMeta({
      inProgress: true,
      lastError: null,
      startedAt: new Date().toISOString(),
    });
    try {
      const opts = await this.buildBaseOpts();

      const { rows, staleTargetsToScrape } = await this.session.run(opts, async ({ page, gotoLoggedIn }) => {
        const scraped = await scrapePuzzelTicketsOnPage(page, opts, gotoLoggedIn);

        const now = new Date();
        this.progress(`[Puzzel] Ticketliste gespeichert/aktualisiert: ${scraped.length} Tickets werden geprüft`);

        const externalKeys = scraped.map((r) => r.externalKey.slice(0, 500));
        const existing = await this.prisma.puzzelTicket.findMany({
          where: { externalKey: { in: externalKeys } },
          include: { _count: { select: { messages: true } } },
        });
        const existingByKey = new Map(existing.map((t) => [t.externalKey, t]));
        const stale: { ticketId: string; externalKey: string; ticketUrl: string }[] = [];

        for (const r of scraped) {
          const externalKey = r.externalKey.slice(0, 500);
          const previous = existingByKey.get(externalKey);
          const nextFingerprint = this.rowFingerprint(r.metadata);
          const previousFingerprint = previous ? this.rowFingerprint(previous.metadata) : null;
          const mergedMetadata = this.mergeMetadataPreservingPrizeBernKeys(previous?.metadata, r.metadata);

          const saved = await this.prisma.puzzelTicket.upsert({
            where: { externalKey },
            create: {
              externalKey,
              subject: r.subject.slice(0, 2000),
              reference: r.reference?.slice(0, 256) ?? null,
              status: r.status?.slice(0, 256) ?? null,
              detailHref: r.detailHref?.slice(0, 2000) ?? null,
              rowSummary: r.rowSummary.slice(0, 8000),
              metadata: mergedMetadata as Prisma.InputJsonValue,
              scrapedAt: now,
            },
            update: {
              subject: r.subject.slice(0, 2000),
              reference: r.reference?.slice(0, 256) ?? null,
              status: r.status?.slice(0, 256) ?? null,
              detailHref: r.detailHref?.slice(0, 2000) ?? null,
              rowSummary: r.rowSummary.slice(0, 8000),
              metadata: mergedMetadata as Prisma.InputJsonValue,
              scrapedAt: now,
            },
          });

          const ticketUrl = saved.detailHref || this.ticketUrlFromReference(saved.reference);
          const needsMessages =
            !previous ||
            previous._count.messages === 0 ||
            (nextFingerprint !== null && previousFingerprint !== null && nextFingerprint !== previousFingerprint);
          if (needsMessages && ticketUrl) {
            stale.push({ ticketId: saved.id, externalKey: saved.externalKey, ticketUrl });
          }
        }

        this.progress(`[Puzzel] Nachrichten-Sync nötig für ${stale.length}/${scraped.length} Tickets`);

        for (let i = 0; i < stale.length; i++) {
          const target = stale[i];
          this.progress(`[Puzzel] Nachrichten-Sync ${i + 1}/${stale.length}: Ticket ${target.externalKey}`);
          try {
            await gotoLoggedIn(target.ticketUrl);
            const messages = await extractPuzzelMessagesFromPage(page);
            this.progress(`[Puzzel] Nachrichten-Sync ${i + 1}/${stale.length}: ${messages.length} Nachrichten erkannt`);
            if (messages.length > 0) {
              await this.replaceMessages(target.ticketId, target.externalKey, messages, now);
            }
          } catch (err) {
            this.progress(
              `[Puzzel] Nachrichten-Sync ${i + 1}/${stale.length}: fehlgeschlagen (${(err as Error).message ?? String(err)})`,
            );
          }
        }

        return { rows: scraped, staleTargetsToScrape: stale };
      });

      const finishedAt = new Date();
      await this.settings.mergePuzzelTicketSyncMeta({
        inProgress: false,
        lastError: null,
        lastSyncedAt: finishedAt.toISOString(),
        lastTicketCount: rows.length,
        startedAt: null,
      });
      this.log.log(
        `Puzzle sync OK: ${rows.length} tickets, ${staleTargetsToScrape.length} ticket timelines refreshed`,
      );
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      await this.settings.mergePuzzelTicketSyncMeta({ inProgress: false, lastError: msg, startedAt: null });
      this.log.warn(`Puzzle sync failed: ${msg}`);
    }
  }
}
