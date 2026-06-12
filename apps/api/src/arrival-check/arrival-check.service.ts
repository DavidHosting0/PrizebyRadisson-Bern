import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import type {
  ArrivalCheckCategoryCount,
  ArrivalCheckPaymentStatus,
  ArrivalCheckRunDetail,
  ArrivalCheckRunItem,
  ArrivalCheckRunSummary,
  ArrivalCheckScenario,
  ArrivalCheckSource,
  CheckInListTab,
  EmmaMoveFolioChargeResult,
  ReservationEmmaDetailBundle,
  ReservationEmmaFolioBundle,
  ReservationListItem,
} from '@housekeeping/shared';
import { ReservationsService } from '../reservations/reservations.service';
import { arrivalCheckCategoryLabel, formatHotelDateOnly } from '@housekeeping/shared';
import type { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SecretCipherService } from '../common/crypto/secret-cipher.service';
import {
  decryptSensitivePayload,
} from '../reservations/reservation-sensitive';
import { decryptDetailBundle } from '../reservations/reservation-detail-bundle';
import { EmmaService } from '../emma/emma.service';
import { buildArrivalCheckDecision, type ArrivalCheckDecision } from './arrival-check-rules';
import { planVccPayment } from './arrival-check-vcc';
import { decryptFolioBundle } from '../reservations/reservation-folio-bundle';

type PaymentPhaseResult = {
  paymentStatus: ArrivalCheckPaymentStatus;
  paymentAmount: string | null;
  paymentInvoice: string | null;
  paymentError: string | null;
  /** True when the reservation should stop and be listed for manual intervention. */
  manual: boolean;
  manualReason: string | null;
};

@Injectable()
export class ArrivalCheckService {
  private readonly log = new Logger(ArrivalCheckService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: SecretCipherService,
    private readonly emma: EmmaService,
    @Inject(forwardRef(() => ReservationsService))
    private readonly reservations: ReservationsService,
  ) {}

  listCheckInTab(
    tab: CheckInListTab,
    q?: string,
    hotelId?: string,
  ): Promise<ReservationListItem[]> {
    return this.reservations.list({ tab, q, hotelId });
  }

  listArrivals(q?: string, hotelId?: string): Promise<ReservationListItem[]> {
    return this.listCheckInTab('arrivals', q, hotelId);
  }

  syncArrivals(date?: string) {
    return this.reservations.syncFromEmma(date);
  }

  private defaultHotelId(hotelId?: string): string {
    return hotelId?.trim() || process.env.EMMA_HOTEL_ID?.trim() || 'CHBRNPR';
  }

  private checkInArrivalsWhere(hotelId: string) {
    return {
      hotelId,
      inTodayArrivals: true,
    };
  }

  async createRun(
    user: User,
    reservationIds: string[],
    hotelId?: string,
  ): Promise<ArrivalCheckRunDetail> {
    const hid = this.defaultHotelId(hotelId);
    const uniqueIds = [...new Set(reservationIds.map((id) => id.trim()).filter(Boolean))];
    if (uniqueIds.length === 0) {
      throw new BadRequestException('Mindestens eine Reservierungsnummer erforderlich.');
    }

    const validSnapshots = await this.prisma.reservationSnapshot.findMany({
      where: {
        ...this.checkInArrivalsWhere(hid),
        reservationId: { in: uniqueIds },
      },
    });
    const validIdSet = new Set(validSnapshots.map((s) => s.reservationId));
    const invalidIds = uniqueIds.filter((id) => !validIdSet.has(id));
    if (invalidIds.length > 0) {
      throw new BadRequestException({
        message: 'Einige Reservierungen sind keine gültigen Anreisen in der EMMA Check-In-Liste.',
        invalidReservationIds: invalidIds,
      });
    }

    const run = await this.prisma.arrivalCheckRun.create({
      data: {
        hotelId: hid,
        createdByUserId: user.id,
        items: {
          create: uniqueIds.map((reservationId) => ({
            reservationId,
            hotelId: hid,
          })),
        },
      },
      include: {
        createdBy: { select: { id: true, name: true } },
        items: true,
      },
    });

    return this.toDetail(run, validSnapshots);
  }

  async listRuns(limit = 20): Promise<ArrivalCheckRunSummary[]> {
    const runs = await this.prisma.arrivalCheckRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: limit,
      include: {
        createdBy: { select: { id: true, name: true } },
        items: {
          select: {
            status: true,
            source: true,
            scenario: true,
            categoryLabel: true,
            paymentStatus: true,
          },
        },
      },
    });
    return runs.map((run) => this.toSummary(run));
  }

  async getRun(id: string): Promise<ArrivalCheckRunDetail> {
    const run = await this.prisma.arrivalCheckRun.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, name: true } },
        items: { orderBy: { reservationId: 'asc' } },
      },
    });
    if (!run) throw new NotFoundException('Anreise-Check-Lauf nicht gefunden.');

    const reservationIds = run.items.map((i) => i.reservationId);
    const snapshots =
      reservationIds.length > 0
        ? await this.prisma.reservationSnapshot.findMany({
            where: { hotelId: run.hotelId, reservationId: { in: reservationIds } },
          })
        : [];

    return this.toDetail(run, snapshots);
  }

  /** Process pending run items: load folio, move misassigned charges, refresh folio. */
  async executeRun(runId: string): Promise<ArrivalCheckRunDetail> {
    const run = await this.prisma.arrivalCheckRun.findUnique({
      where: { id: runId },
      include: {
        createdBy: { select: { id: true, name: true } },
        items: { orderBy: { reservationId: 'asc' } },
      },
    });
    if (!run) throw new NotFoundException('Anreise-Check-Lauf nicht gefunden.');
    if (run.status === 'CANCELLED') {
      throw new BadRequestException('Abgebrochener Lauf kann nicht ausgeführt werden.');
    }

    for (const item of run.items) {
      if (
        item.status !== 'PENDING' &&
        item.status !== 'FAILED' &&
        item.status !== 'NEEDS_MANUAL'
      ) {
        continue;
      }
      // A declined VCC must be resolved manually in EMMA — never silently re-run
      // (the invoice already exists; an automatic retry would mask the open balance).
      if (item.paymentStatus === 'DECLINED') continue;
      await this.processRunItem(run.hotelId, item.id);
    }

    await this.refreshRunStatus(runId);
    return this.getRun(runId);
  }

  /** Move one folio charge via EMMA (used by arrival check and future scripts). */
  async moveFolioCharge(
    hotelId: string,
    reservationId: string,
    sourceFolioId: string,
    chargeRowId: string,
    destinationFolioId: string,
  ): Promise<EmmaMoveFolioChargeResult> {
    return this.emma.moveFolioCharge({
      hotelId,
      reservationId,
      sourceFolioId,
      chargeRowId,
      destinationFolioId,
    });
  }

  private async processRunItem(hotelId: string, itemId: string): Promise<void> {
    const item = await this.prisma.arrivalCheckRunItem.findUnique({ where: { id: itemId } });
    if (!item) return;

    await this.prisma.arrivalCheckRunItem.update({
      where: { id: itemId },
      data: {
        status: 'IN_PROGRESS',
        currentStep: 'FOLIO_LOAD',
        error: null,
        manualReason: null,
        movesDone: 0,
        paymentStatus: null,
        paymentAmount: null,
        paymentInvoice: null,
        paymentError: null,
        statusMessage: 'Reservierungsdaten werden aus EMMA geladen …',
        startedAt: item.startedAt ?? new Date(),
        finishedAt: null,
      },
    });

    try {
      await this.reservations.fetchDetailFromEmma(item.reservationId, hotelId);
      await this.reservations.fetchFolioFromEmma(item.reservationId, hotelId);

      const snap = await this.prisma.reservationSnapshot.findUnique({
        where: {
          hotelId_reservationId: { hotelId, reservationId: item.reservationId },
        },
      });
      const folio = snap ? decryptFolioBundle(this.cipher, snap.folioEnc) : null;
      if (!folio) {
        throw new Error('Folio nach EMMA-Abruf nicht verfügbar.');
      }
      const detail = snap ? decryptDetailBundle(this.cipher, snap.detailEnc) : null;
      const sensitive = snap ? decryptSensitivePayload(this.cipher, snap.sensitiveEnc) : null;

      const decision = buildArrivalCheckDecision({ sensitive, detail, folio });
      const categoryLabel = arrivalCheckCategoryLabel(decision.source, decision.scenario);

      await this.prisma.arrivalCheckRunItem.update({
        where: { id: itemId },
        data: {
          currentStep: 'CHARGE_ASSIGN',
          source: decision.source,
          scenario: decision.scenario,
          categoryLabel,
          movesPlanned: decision.moves.length,
          statusMessage: this.classifyMessage(decision, categoryLabel),
        },
      });

      if (decision.requiresManual) {
        await this.prisma.arrivalCheckRunItem.update({
          where: { id: itemId },
          data: {
            status: 'NEEDS_MANUAL',
            currentStep: null,
            manualReason: decision.manualReason,
            statusMessage: decision.manualReason,
            finishedAt: new Date(),
          },
        });
        return;
      }

      let movesDone = 0;
      for (const move of decision.moves) {
        await this.prisma.arrivalCheckRunItem.update({
          where: { id: itemId },
          data: {
            statusMessage: `Posten ${move.concept ?? move.chargeRowId} wird von Folio ${move.sourceFolioId} auf Folio ${move.destinationFolioId} verschoben (${movesDone + 1}/${decision.moves.length}) …`,
          },
        });
        await this.moveFolioCharge(
          hotelId,
          item.reservationId,
          move.sourceFolioId,
          move.chargeRowId,
          move.destinationFolioId,
        );
        movesDone += 1;
        await this.prisma.arrivalCheckRunItem.update({
          where: { id: itemId },
          data: { movesDone },
        });
      }

      let workingFolio: ReservationEmmaFolioBundle = folio;
      if (decision.moves.length > 0) {
        await this.reservations.fetchFolioFromEmma(item.reservationId, hotelId);
        const refreshedSnap = await this.prisma.reservationSnapshot.findUnique({
          where: { hotelId_reservationId: { hotelId, reservationId: item.reservationId } },
        });
        const refreshed = refreshedSnap
          ? decryptFolioBundle(this.cipher, refreshedSnap.folioEnc)
          : null;
        if (refreshed) workingFolio = refreshed;
      }

      const payment = await this.settleVccPayment(
        itemId,
        hotelId,
        item.reservationId,
        decision,
        detail,
        workingFolio,
      );

      if (payment.manual) {
        this.log.warn(`[ArrivalCheck] ${item.reservationId}: ${payment.manualReason}`);
        await this.prisma.arrivalCheckRunItem.update({
          where: { id: itemId },
          data: {
            status: 'NEEDS_MANUAL',
            currentStep: null,
            paymentStatus: payment.paymentStatus,
            paymentAmount: payment.paymentAmount,
            paymentInvoice: payment.paymentInvoice,
            paymentError: payment.paymentError,
            manualReason: payment.manualReason,
            statusMessage: payment.manualReason,
            movesDone,
            finishedAt: new Date(),
          },
        });
        return;
      }

      this.log.log(
        `[ArrivalCheck] ${item.reservationId}: ${categoryLabel}, ${movesDone}/${decision.moves.length} Posten verschoben` +
          (payment.paymentStatus === 'PAID'
            ? `, VCC belastet ${payment.paymentAmount}`
            : ''),
      );

      await this.prisma.arrivalCheckRunItem.update({
        where: { id: itemId },
        data: {
          status: 'COMPLETED',
          currentStep: null,
          paymentStatus: payment.paymentStatus,
          paymentAmount: payment.paymentAmount,
          paymentInvoice: payment.paymentInvoice,
          paymentError: null,
          statusMessage: this.completionMessage(decision, categoryLabel, movesDone, payment),
          finishedAt: new Date(),
        },
      });
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : String(err);
      const isManual = raw.startsWith('MANUAL:');
      const message = isManual ? raw.slice('MANUAL:'.length).trim() : raw;
      const isLock = /blocked by|lock|session/i.test(message);
      const manual = isManual || isLock;
      await this.prisma.arrivalCheckRunItem.update({
        where: { id: itemId },
        data: {
          status: manual ? 'NEEDS_MANUAL' : 'FAILED',
          error: message,
          manualReason: isLock
            ? `EMMA-Sperre: ${message}. Bitte Reservierung manuell prüfen und ggf. die andere Sitzung schliessen.`
            : isManual
              ? message
              : null,
          statusMessage: isLock
            ? 'Reservierung durch andere EMMA-Sitzung gesperrt.'
            : manual
              ? message
              : 'Fehler bei der Verarbeitung.',
          currentStep: null,
          finishedAt: new Date(),
        },
      });
    }
  }

  /**
   * VCC settlement phase (runs after charges are routed). Charges the stored VCC
   * token; a decline is surfaced as manual intervention (never a silent success).
   */
  private async settleVccPayment(
    itemId: string,
    hotelId: string,
    reservationId: string,
    decision: ArrivalCheckDecision,
    detail: ReservationEmmaDetailBundle | null,
    folio: ReservationEmmaFolioBundle,
  ): Promise<PaymentPhaseResult> {
    const plan = planVccPayment({ decision, detail, folio });
    if (!plan) {
      return {
        paymentStatus: 'NOT_REQUIRED',
        paymentAmount: null,
        paymentInvoice: null,
        paymentError: null,
        manual: false,
        manualReason: null,
      };
    }

    await this.prisma.arrivalCheckRunItem.update({
      where: { id: itemId },
      data: {
        currentStep: 'PREPAID_SETTLE',
        paymentStatus: 'PLANNED',
        paymentAmount: plan.amount,
        statusMessage: `VCC wird belastet: ${plan.currency} ${plan.amount} auf Folio ${plan.folioId} …`,
      },
    });

    const outcome = await this.emma.payFolioWithVcc({
      hotelId,
      reservationId,
      folioId: plan.folioId,
      amount: plan.amount,
      currency: plan.currency,
    });

    if (outcome.status === 'PAID') {
      return {
        paymentStatus: 'PAID',
        paymentAmount: outcome.amount ?? plan.amount,
        paymentInvoice: outcome.invoiceNumber,
        paymentError: null,
        manual: false,
        manualReason: null,
      };
    }

    if (outcome.status === 'DECLINED') {
      const reason = `VCC abgelehnt: ${outcome.message ?? 'Zahlung nicht erfolgreich'}. Bitte manuell prüfen.`;
      return {
        paymentStatus: 'DECLINED',
        paymentAmount: outcome.amount ?? plan.amount,
        paymentInvoice: outcome.invoiceNumber,
        paymentError: outcome.message ?? 'Zahlung abgelehnt',
        manual: true,
        manualReason: reason,
      };
    }

    // NO_VCC or AMBIGUOUS — cannot charge safely.
    return {
      paymentStatus: 'SKIPPED',
      paymentAmount: null,
      paymentInvoice: null,
      paymentError: outcome.message,
      manual: true,
      manualReason: outcome.message ?? 'VCC-Zahlung nicht möglich – manuelle Prüfung nötig.',
    };
  }

  private classifyMessage(decision: ArrivalCheckDecision, categoryLabel: string): string {
    switch (decision.scenario) {
      case 'VCC':
        return `${categoryLabel} erkannt – Zimmer-/Verpflegungsposten werden auf das Firmen-Folio verschoben, City Tax und Hotel Tax verbleiben bzw. werden auf Folio 1 zusammengeführt …`;
      case 'PREPAID':
        return `${categoryLabel}: alle Posten werden auf Folio 1 zusammengeführt …`;
      case 'DIRECT':
        return `${categoryLabel}: alle Posten werden auf Folio 1 zusammengeführt …`;
      case 'FLEXIBLE':
        return `${categoryLabel}: keine Verschiebung nötig, Posten bereits korrekt auf Folio 1.`;
      default:
        return categoryLabel;
    }
  }

  private completionMessage(
    decision: ArrivalCheckDecision,
    categoryLabel: string,
    movesDone: number,
    payment?: PaymentPhaseResult,
  ): string {
    const paid =
      payment?.paymentStatus === 'PAID'
        ? ` VCC belastet: ${payment.paymentAmount}.`
        : '';
    if (decision.scenario === 'FLEXIBLE') {
      return `${categoryLabel}: keine Verschiebung nötig.${paid}`;
    }
    if (movesDone === 0) {
      return `${categoryLabel}: Posten bereits korrekt zugeordnet, keine Verschiebung nötig.${paid}`;
    }
    return `${categoryLabel}: ${movesDone} Posten erfolgreich verschoben.${paid}`;
  }

  private async refreshRunStatus(runId: string): Promise<void> {
    const items = await this.prisma.arrivalCheckRunItem.findMany({
      where: { runId },
      select: { status: true },
    });
    const failed = items.some((i) => i.status === 'FAILED');
    const allDone = items.every(
      (i) =>
        i.status === 'COMPLETED' ||
        i.status === 'FAILED' ||
        i.status === 'SKIPPED' ||
        i.status === 'NEEDS_MANUAL',
    );
    if (!allDone) return;

    await this.prisma.arrivalCheckRun.update({
      where: { id: runId },
      data: {
        status: failed ? 'FAILED' : 'COMPLETED',
        finishedAt: new Date(),
      },
    });
  }

  private toSummary(run: {
    id: string;
    hotelId: string;
    status: ArrivalCheckRunDetail['status'];
    startedAt: Date;
    finishedAt: Date | null;
    createdBy: { id: string; name: string };
    items: {
      status: ArrivalCheckRunItem['status'];
      source?: string | null;
      scenario?: string | null;
      categoryLabel?: string | null;
      paymentStatus?: string | null;
    }[];
  }): ArrivalCheckRunSummary {
    const pendingCount = run.items.filter(
      (i) => i.status === 'PENDING' || i.status === 'IN_PROGRESS',
    ).length;
    const completedCount = run.items.filter((i) => i.status === 'COMPLETED').length;
    const failedCount = run.items.filter((i) => i.status === 'FAILED').length;
    const skippedCount = run.items.filter((i) => i.status === 'SKIPPED').length;
    const manualCount = run.items.filter((i) => i.status === 'NEEDS_MANUAL').length;
    const paidCount = run.items.filter((i) => i.paymentStatus === 'PAID').length;
    const declinedCount = run.items.filter((i) => i.paymentStatus === 'DECLINED').length;
    return {
      id: run.id,
      hotelId: run.hotelId,
      status: run.status,
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null,
      createdByUserId: run.createdBy.id,
      createdByName: run.createdBy.name,
      itemCount: run.items.length,
      pendingCount,
      completedCount,
      failedCount,
      skippedCount,
      manualCount,
      paidCount,
      declinedCount,
      categoryCounts: this.buildCategoryCounts(run.items),
    };
  }

  private buildCategoryCounts(
    items: { source?: string | null; scenario?: string | null; categoryLabel?: string | null }[],
  ): ArrivalCheckCategoryCount[] {
    const map = new Map<string, ArrivalCheckCategoryCount>();
    for (const item of items) {
      if (!item.source || !item.scenario) continue;
      const source = item.source as ArrivalCheckSource;
      const scenario = item.scenario as ArrivalCheckScenario;
      const key = `${source}|${scenario}`;
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(key, {
          source,
          scenario,
          label: item.categoryLabel ?? arrivalCheckCategoryLabel(source, scenario),
          count: 1,
        });
      }
    }
    return [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }

  private toDetail(
    run: {
      id: string;
      hotelId: string;
      status: ArrivalCheckRunDetail['status'];
      startedAt: Date;
      finishedAt: Date | null;
      createdBy: { id: string; name: string };
      items: {
        id: string;
        reservationId: string;
        hotelId: string;
        status: ArrivalCheckRunItem['status'];
        currentStep: ArrivalCheckRunItem['currentStep'];
        error: string | null;
        startedAt: Date | null;
        finishedAt: Date | null;
        source: string | null;
        scenario: string | null;
        categoryLabel: string | null;
        statusMessage: string | null;
        manualReason: string | null;
        movesPlanned: number;
        movesDone: number;
        paymentStatus: string | null;
        paymentAmount: string | null;
        paymentInvoice: string | null;
        paymentError: string | null;
      }[];
    },
    snapshots: {
      reservationId: string;
      roomId: string | null;
      arrivalDate: Date;
      departureDate: Date;
      roomType: string | null;
      numPax: number | null;
      sensitiveEnc: string;
    }[],
  ): ArrivalCheckRunDetail {
    const snapshotByReservationId = new Map(snapshots.map((s) => [s.reservationId, s]));
    const summary = this.toSummary(run);
    const items: ArrivalCheckRunItem[] = run.items.map((item) => {
      const snap = snapshotByReservationId.get(item.reservationId);
      const sensitive = snap
        ? decryptSensitivePayload(this.cipher, snap.sensitiveEnc)
        : null;
      return {
        id: item.id,
        reservationId: item.reservationId,
        hotelId: item.hotelId,
        status: item.status,
        currentStep: item.currentStep,
        error: item.error,
        startedAt: item.startedAt?.toISOString() ?? null,
        finishedAt: item.finishedAt?.toISOString() ?? null,
        mainGuestName: sensitive?.mainGuestName ?? null,
        roomId: snap?.roomId ?? null,
        arrivalDate: snap ? formatHotelDateOnly(snap.arrivalDate) : '',
        departureDate: snap ? formatHotelDateOnly(snap.departureDate) : '',
        roomType: snap?.roomType ?? null,
        numPax: snap?.numPax ?? null,
        source: (item.source as ArrivalCheckSource | null) ?? null,
        scenario: (item.scenario as ArrivalCheckScenario | null) ?? null,
        categoryLabel: item.categoryLabel ?? null,
        statusMessage: item.statusMessage ?? null,
        manualReason: item.manualReason ?? null,
        movesPlanned: item.movesPlanned ?? 0,
        movesDone: item.movesDone ?? 0,
        paymentStatus:
          (item.paymentStatus as ArrivalCheckPaymentStatus | null) ?? null,
        paymentAmount: item.paymentAmount ?? null,
        paymentInvoice: item.paymentInvoice ?? null,
        paymentError: item.paymentError ?? null,
      };
    });
    return { ...summary, items };
  }
}
