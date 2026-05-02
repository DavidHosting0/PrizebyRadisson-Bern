import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { scrapePuzzelTicketMessages, scrapePuzzelTickets } from './puzzel-scraper';

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

  async getTicketMessages(ticketId: string) {
    const ticket = await this.prisma.puzzelTicket.findUnique({
      where: { id: ticketId },
      include: { messages: { orderBy: { scrapedAt: 'asc' } } },
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

    const creds = await this.settings.getPuzzelLoginSecrets();
    if (!creds?.password?.trim() || !creds.email?.trim()) {
      throw new Error('Puzzle-Zugangsdaten unvollständig (E-Mail oder Passwort fehlt). Admin → Puzzle.');
    }

    const baseUrl = process.env.PUZZEL_BASE_URL ?? 'https://radissonemea.cm.puzzel.com';
    const ticketsPath = process.env.PUZZEL_TICKETS_PATH ?? '/tickets';
    const filter = await this.settings.getPuzzelTicketFilter();
    const headless = process.env.PUZZEL_HEADLESS !== 'false';

    const messages = await scrapePuzzelTicketMessages({
      baseUrl,
      ticketsPath,
      savedSearchName: filter.savedSearchName,
      teamName: filter.teamName,
      statusName: filter.statusName,
      timePeriod: filter.timePeriod,
      ticketUrl,
      email: creds.email.trim(),
      password: creds.password,
      totpSecret: creds.totpSecret?.trim() || undefined,
      headless,
    });

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.puzzelTicketMessage.deleteMany({ where: { ticketId } });
      await tx.puzzelTicketMessage.createMany({
        data: messages.map((m) => ({
          ticketId,
          externalKey: `${ticket.externalKey}:${m.externalKey}`.slice(0, 500),
          sentAtText: m.sentAtText?.slice(0, 256) ?? null,
          fromText: m.fromText?.slice(0, 512) ?? null,
          toText: m.toText?.slice(0, 512) ?? null,
          direction: m.direction,
          bodyText: m.bodyText,
          bodyHtml: m.bodyHtml,
          metadata: (m.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
          scrapedAt: now,
        })),
      });
    });

    return this.prisma.puzzelTicketMessage.findMany({
      where: { ticketId },
      orderBy: { scrapedAt: 'asc' },
    });
  }

  async getSyncStatus() {
    return this.settings.getPuzzelTicketSyncMeta();
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
      const filter = await this.settings.getPuzzelTicketFilter();
      const headless = process.env.PUZZEL_HEADLESS !== 'false';

      const rows = await scrapePuzzelTickets({
        baseUrl,
        ticketsPath,
        savedSearchName: filter.savedSearchName,
        teamName: filter.teamName,
        statusName: filter.statusName,
        timePeriod: filter.timePeriod,
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
