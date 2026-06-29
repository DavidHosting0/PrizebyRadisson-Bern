import { Inject, Injectable, Logger, NotFoundException, forwardRef } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  ReservationDetail,
  ReservationEmmaDetailBundle,
  ReservationEmmaFolioBundle,
  ReservationListItem,
  ReservationOverview,
  ReservationSyncStatus,
  ReservationTab,
} from '@housekeeping/shared';
import { compareRoomNumbers, deriveGuestStaySignals, formatHotelDateOnly } from '@housekeeping/shared';
import { PrismaService } from '../prisma/prisma.service';
import { SecretCipherService } from '../common/crypto/secret-cipher.service';
import { EmmaService } from '../emma/emma.service';
import type { EmmaReservationSyncResult, ReservationUpsertRow } from '../emma/emma-reservation-sync';
import { RoomGuestStayService } from '../room-management/room-guest-stay.service';
import {
  decryptSensitivePayload,
  encryptSensitivePayload,
  todayIsoDate,
  dateOnlyFromIso,
} from './reservation-sensitive';
import {
  decryptDetailBundle,
  encryptDetailBundle,
} from './reservation-detail-bundle';
import {
  decryptFolioBundle,
  encryptFolioBundle,
} from './reservation-folio-bundle';
import {
  resolveOutstandingBalance,
  outstandingBalanceForStorage,
} from './reservation-balance';

@Injectable()
export class ReservationsService {
  private readonly log = new Logger(ReservationsService.name);
  private syncInProgress = false;
  private viewDebounce: ReturnType<typeof setTimeout> | null = null;
  private viewSyncNotBefore = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: SecretCipherService,
    @Inject(forwardRef(() => EmmaService))
    private readonly emma: EmmaService,
    private readonly guestStays: RoomGuestStayService,
  ) {}

  scheduleSyncOnView(source: string): void {
    if (process.env.EMMA_RESERVATION_AUTO_SYNC === 'false') return;
    if (this.syncInProgress) return;
    const now = Date.now();
    if (now < this.viewSyncNotBefore) return;
    if (this.viewDebounce) return;

    const debounceMs = parseInt(process.env.EMMA_VIEW_SYNC_DEBOUNCE_MS ?? '5000', 10);
    const minIntervalMs = parseInt(
      process.env.EMMA_RESERVATION_VIEW_SYNC_MIN_INTERVAL_MS ?? '90000',
      10,
    );

    this.viewDebounce = setTimeout(() => {
      this.viewDebounce = null;
      if (Date.now() < this.viewSyncNotBefore) return;
      this.viewSyncNotBefore = Date.now() + minIntervalMs;
      void this.runBackgroundSync('view', source);
    }, debounceMs);
  }

  async runBackgroundSync(trigger: 'cron' | 'view' | 'manual', source?: string): Promise<void> {
    if (process.env.EMMA_RESERVATION_AUTO_SYNC === 'false' && trigger !== 'manual') return;
    if (this.syncInProgress) return;
    this.syncInProgress = true;
    const label = source ? `${trigger}:${source}` : trigger;
    try {
      await this.syncFromEmma(undefined, label);
    } catch (err) {
      this.log.warn(`[Reservations] background sync failed (${label}): ${(err as Error).message}`);
    } finally {
      this.syncInProgress = false;
    }
  }

  async syncFromEmma(
    arrivalDateIso?: string,
    triggerLabel = 'manual',
  ): Promise<EmmaReservationSyncResult> {
    const run = await this.prisma.reservationSyncRun.create({
      data: { status: 'running', tab: triggerLabel },
    });
    try {
      const { rows, membership, result } = await this.emma.fetchReservationRowsFromEmma({
        arrivalDateIso: arrivalDateIso?.trim() || undefined,
      });
      const hotelId = result.hotelId;
      const businessDate = dateOnlyFromIso(membership.checkInBusinessDateIso);
      const arrivalsSet = new Set(membership.arrivalsReservationIds);
      const queueSet = new Set(membership.queueReservationIds);
      const checkInsDoneSet = new Set(membership.checkInsDoneReservationIds);

      const reservationIds = rows.map((r) => r.reservationId);
      const existingRows =
        reservationIds.length > 0
          ? await this.prisma.reservationSnapshot.findMany({
              where: { hotelId, reservationId: { in: reservationIds } },
            })
          : [];
      const existingById = new Map(existingRows.map((r) => [r.reservationId, r]));

      let created = 0;
      let updated = 0;
      let unchanged = 0;
      for (const row of rows) {
        const listFlags = this.checkInListFlagsForRow(
          row.reservationId,
          businessDate,
          arrivalsSet,
          queueSet,
          checkInsDoneSet,
        );
        const existing = existingById.get(row.reservationId);
        if (!existing) {
          await this.prisma.reservationSnapshot.create({
            data: {
              ...row,
              ...listFlags,
              checkInQueue: listFlags.checkInQueue,
            },
          });
          created++;
          continue;
        }

        const patch = this.buildReservationPatch(existing, row, listFlags);
        if (!patch) {
          unchanged++;
          continue;
        }

        await this.prisma.reservationSnapshot.update({
          where: { id: existing.id },
          data: patch,
        });
        updated++;
      }

      const upserted = created + updated;
      await this.reconcileCheckInListFlags(
        hotelId,
        businessDate,
        arrivalsSet,
        queueSet,
        checkInsDoneSet,
      );
      await this.reconcileInHouseFlags(hotelId, rows, result);

      for (const row of rows) {
        const listFlags = this.checkInListFlagsForRow(
          row.reservationId,
          businessDate,
          arrivalsSet,
          queueSet,
          checkInsDoneSet,
        );
        await this.guestStays.recordFromSync(row, listFlags);
      }

      const fetchedFromEmma = result.inhouseList > 0 || result.tabs.inhouse > 0;
      if (fetchedFromEmma) {
        const stillOpenIds = rows
          .filter((r) => {
            if (r.checkOut || !r.roomId?.trim()) return false;
            if (r.checkIn) return true;
            return checkInsDoneSet.has(r.reservationId);
          })
          .map((r) => r.reservationId);
        const closedStays = await this.guestStays.closeStaysNotInHouse(
          hotelId,
          stillOpenIds,
          new Date(),
        );
        if (closedStays > 0) {
          this.log.log(`[Reservations] closed ${closedStays} guest stays no longer in-house`);
        }
      }

      await this.prisma.reservationSyncRun.update({
        where: { id: run.id },
        data: {
          status: 'ok',
          finishedAt: new Date(),
          rowCount: upserted,
          overview: {
            ...(result.overview ?? {}),
            checkInBusinessDateIso: membership.checkInBusinessDateIso,
            tabs: result.tabs,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      this.log.log(
        `[Reservations] sync OK (${triggerLabel}): ${created} created, ${updated} updated, ${unchanged} unchanged, businessDate=${membership.checkInBusinessDateIso}, arrivals=${arrivalsSet.size}, queue=${queueSet.size}, checkInsDone=${checkInsDoneSet.size}, tabs=${JSON.stringify(result.tabs)}, inhouseList=${result.inhouseList}, inHouseActive=${rows.filter((r) => r.checkIn && !r.checkOut).length}`,
      );
      void this.emma.broadcastIntegrationStatus();
      return { ...result, upserted };
    } catch (err) {
      const msg = (err as Error).message;
      await this.prisma.reservationSyncRun.update({
        where: { id: run.id },
        data: { status: 'error', finishedAt: new Date(), error: msg },
      });
      void this.emma.broadcastIntegrationStatus();
      throw err;
    }
  }

  async list(opts: {
    tab: ReservationTab;
    date?: string;
    q?: string;
    hotelId?: string;
  }): Promise<ReservationListItem[]> {
    if (opts.tab !== 'all') {
      this.scheduleSyncOnView(`list:${opts.tab}`);
    }
    const hotelId = opts.hotelId?.trim() || process.env.EMMA_HOTEL_ID?.trim() || 'CHBRNPR';
    const q = opts.q?.trim().toLowerCase();

    const where: Prisma.ReservationSnapshotWhereInput = { hotelId };

    switch (opts.tab) {
      case 'arrivals':
        where.inTodayArrivals = true;
        break;
      case 'queue':
        where.checkInQueue = true;
        where.inCheckInDone = false;
        break;
      case 'checkInsDone':
        where.inCheckInDone = true;
        break;
      case 'inhouse':
        where.checkIn = true;
        where.checkOut = false;
        break;
      case 'all':
        break;
    }

    const rows = await this.prisma.reservationSnapshot.findMany({
      where,
      orderBy:
        opts.tab === 'all'
          ? [{ arrivalDate: 'desc' }, { reservationId: 'asc' }]
          : [{ arrivalDate: 'asc' }, { reservationId: 'asc' }],
      take: opts.tab === 'all' ? (q ? 2000 : 500) : undefined,
    });

    const mapped = rows.map((r) => this.toListItem(r, opts.tab === 'inhouse'));

    if (opts.tab === 'inhouse') {
      mapped.sort((a, b) => {
        const ra = a.roomId?.trim() ?? '';
        const rb = b.roomId?.trim() ?? '';
        if (ra && rb) {
          const cmp = compareRoomNumbers(ra, rb);
          if (cmp !== 0) return cmp;
        } else if (ra && !rb) return -1;
        else if (!ra && rb) return 1;
        return (a.mainGuestName ?? a.reservationId).localeCompare(
          b.mainGuestName ?? b.reservationId,
          'de',
        );
      });
    }

    if (!q) return mapped;
    return mapped.filter(
      (r) =>
        r.mainGuestName?.toLowerCase().includes(q) ||
        r.reservationId.toLowerCase().includes(q) ||
        r.roomId?.toLowerCase().includes(q) ||
        r.groupName?.toLowerCase().includes(q) ||
        r.roomType?.toLowerCase().includes(q) ||
        r.vipDesc?.toLowerCase().includes(q) ||
        r.tier?.toLowerCase().includes(q),
    );
  }

  async findOne(reservationId: string, hotelId?: string): Promise<ReservationDetail> {
    const hid = hotelId?.trim() || process.env.EMMA_HOTEL_ID?.trim() || 'CHBRNPR';
    const row = await this.prisma.reservationSnapshot.findUnique({
      where: { hotelId_reservationId: { hotelId: hid, reservationId } },
    });
    if (!row) throw new NotFoundException('Reservation not found');
    const detail = this.toDetail(row);
    if (!detail) throw new NotFoundException('Reservation not found');
    return detail;
  }

  /** Manually fetch full reservation detail from EMMA (read-only, no draft/lock). */
  async fetchDetailFromEmma(reservationId: string, hotelId?: string): Promise<ReservationDetail> {
    const hid = hotelId?.trim() || process.env.EMMA_HOTEL_ID?.trim() || 'CHBRNPR';
    const { upsert, bundle } = await this.emma.fetchReservationDetailFromEmma(reservationId, hid);
    const detailEnc = encryptDetailBundle(this.cipher, bundle);
    const detailFetchedAt = new Date();
    const existing = await this.prisma.reservationSnapshot.findUnique({
      where: { hotelId_reservationId: { hotelId: hid, reservationId } },
    });

    const snapshotData = {
      ...this.snapshotFieldsFromUpsert(upsert),
      detailEnc,
      detailFetchedAt,
      inTodayArrivals: existing?.inTodayArrivals ?? false,
      inCheckInDone: existing?.inCheckInDone ?? false,
      checkInBusinessDate: existing?.checkInBusinessDate ?? null,
    };

    if (!existing) {
      await this.prisma.reservationSnapshot.create({
        data: {
          hotelId: hid,
          reservationId,
          ...snapshotData,
        },
      });
    } else {
      await this.prisma.reservationSnapshot.update({
        where: { id: existing.id },
        data: snapshotData,
      });
    }

    this.log.log(`[Reservations] EMMA detail stored for ${reservationId}`);
    await this.persistBalanceOnSnapshot(hid, reservationId, { detail: bundle });
    return this.findOne(reservationId, hid);
  }

  /** Manually fetch Folio Management data from EMMA (read-only, no draft/lock). */
  async fetchFolioFromEmma(reservationId: string, hotelId?: string): Promise<ReservationDetail> {
    const hid = hotelId?.trim() || process.env.EMMA_HOTEL_ID?.trim() || 'CHBRNPR';
    const { upsert, bundle } = await this.emma.fetchReservationFolioFromEmma(reservationId, hid);
    const folioEnc = encryptFolioBundle(this.cipher, bundle);
    const folioFetchedAt = new Date();

    const existing = await this.prisma.reservationSnapshot.findUnique({
      where: { hotelId_reservationId: { hotelId: hid, reservationId } },
    });

    if (!existing) {
      if (!upsert) {
        throw new NotFoundException('Reservation not found locally and EMMA folio mapping failed');
      }
      await this.prisma.reservationSnapshot.create({
        data: {
          hotelId: hid,
          reservationId,
          ...this.snapshotFieldsFromUpsert(upsert),
          inTodayArrivals: false,
          inCheckInDone: false,
          folioEnc,
          folioFetchedAt,
        },
      });
    } else {
      const data: Prisma.ReservationSnapshotUpdateInput = { folioEnc, folioFetchedAt };
      if (upsert) Object.assign(data, this.snapshotFieldsFromUpsert(upsert));
      await this.prisma.reservationSnapshot.update({
        where: { id: existing.id },
        data,
      });
    }

    this.log.log(
      `[Reservations] EMMA folio stored for ${reservationId} (${bundle.charges.length} charges)`,
    );
    await this.persistBalanceOnSnapshot(hid, reservationId, { folio: bundle });
    return this.findOne(reservationId, hid);
  }

  /** Move one folio charge in EMMA, then refresh stored folio snapshot. */
  async moveFolioChargeFromEmma(
    reservationId: string,
    input: {
      sourceFolioId: string;
      chargeRowId: string;
      destinationFolioId: string;
      hotelId?: string;
    },
  ): Promise<ReservationDetail> {
    const hid = input.hotelId?.trim() || process.env.EMMA_HOTEL_ID?.trim() || 'CHBRNPR';
    await this.emma.moveFolioCharge({
      hotelId: hid,
      reservationId,
      sourceFolioId: input.sourceFolioId,
      chargeRowId: input.chargeRowId,
      destinationFolioId: input.destinationFolioId,
    });
    this.log.log(
      `[Reservations] moved folio charge ${input.chargeRowId} ` +
        `${input.sourceFolioId} → ${input.destinationFolioId} on ${reservationId}`,
    );
    return this.fetchFolioFromEmma(reservationId, hid);
  }

  private snapshotFieldsFromUpsert(upsert: ReservationUpsertRow) {
    return {
      arrivalDate: upsert.arrivalDate,
      departureDate: upsert.departureDate,
      roomId: upsert.roomId,
      checkIn: upsert.checkIn,
      checkOut: upsert.checkOut,
      checkInQueue: upsert.checkInQueue,
      nightsStay: upsert.nightsStay,
      roomType: upsert.roomType,
      mealPlan: upsert.mealPlan,
      tier: upsert.tier,
      numPax: upsert.numPax,
      sensitiveEnc: upsert.sensitiveEnc,
      syncedAt: upsert.syncedAt,
    };
  }

  /**
   * After arrival-check detail/folio fetches, merge the authoritative outstanding
   * balance into sensitiveEnc so list views and backup reports stay aligned.
   */
  private async persistBalanceOnSnapshot(
    hotelId: string,
    reservationId: string,
    opts: {
      folio?: ReservationEmmaFolioBundle;
      detail?: ReservationEmmaDetailBundle;
    },
  ): Promise<void> {
    const row = await this.prisma.reservationSnapshot.findUnique({
      where: { hotelId_reservationId: { hotelId, reservationId } },
    });
    if (!row) return;

    const sensitive = decryptSensitivePayload(this.cipher, row.sensitiveEnc);
    if (!sensitive) return;

    const folio = opts.folio ?? decryptFolioBundle(this.cipher, row.folioEnc);
    const detail = opts.detail ?? decryptDetailBundle(this.cipher, row.detailEnc);
    const balance = outstandingBalanceForStorage({
      sensitiveBalance: sensitive.balance,
      folio,
      detail,
    });
    if (!balance || balance === sensitive.balance) return;

    await this.prisma.reservationSnapshot.update({
      where: { id: row.id },
      data: {
        sensitiveEnc: encryptSensitivePayload(this.cipher, { ...sensitive, balance }),
      },
    });
  }

  async overview(hotelId?: string): Promise<ReservationOverview> {
    const hid = hotelId?.trim() || process.env.EMMA_HOTEL_ID?.trim() || 'CHBRNPR';
    const visibleArrivals = await this.prisma.reservationSnapshot.count({
      where: { hotelId: hid, inTodayArrivals: true },
    });
    const last = await this.prisma.reservationSyncRun.findFirst({
      where: { status: 'ok' },
      orderBy: { finishedAt: 'desc' },
    });
    const base: ReservationOverview = {
      hotelId: hid,
      checkInDone: 0,
      checkInQueue: 0,
      checkInPending: 0,
      arrivals: 0,
      checkOutDone: 0,
      checkOutToday: 0,
      inHouse: 0,
      departures: 0,
      lastSyncedAt: last?.finishedAt?.toISOString() ?? null,
      visibleArrivals,
    };
    if (last?.overview && typeof last.overview === 'object' && !Array.isArray(last.overview)) {
      const o = last.overview as Record<string, unknown>;
      return {
        ...base,
        checkInDone: Number(o.checkInDone ?? 0),
        checkInQueue: Number(o.checkInQueue ?? 0),
        checkInPending: Number(o.checkInPending ?? 0),
        arrivals: Number(o.arrivals ?? 0),
        checkOutDone: Number(o.checkOutDone ?? 0),
        checkOutToday: Number(o.checkOutToday ?? 0),
        inHouse: Number(o.inHouse ?? 0),
        departures: Number(o.departures ?? 0),
        visibleArrivals,
      };
    }
    return base;
  }

  async syncStatus(): Promise<ReservationSyncStatus> {
    const last = await this.prisma.reservationSyncRun.findFirst({
      orderBy: { startedAt: 'desc' },
    });
    const overview = await this.overview();
    return {
      lastRun: last
        ? {
            id: last.id,
            startedAt: last.startedAt.toISOString(),
            finishedAt: last.finishedAt?.toISOString() ?? null,
            status: last.status,
            rowCount: last.rowCount,
            error: last.error,
          }
        : null,
      overview,
    };
  }

  /** Delete snapshots and guest stays whose departure was more than retentionDays ago. */
  async purgeExpired(retentionDays = 30): Promise<number> {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays);
    const [snapshotResult, stayResult] = await Promise.all([
      this.prisma.reservationSnapshot.deleteMany({
        where: { departureDate: { lt: cutoff } },
      }),
      this.guestStays.purgeExpired(cutoff),
    ]);
    const total = snapshotResult.count + stayResult;
    if (snapshotResult.count > 0) {
      this.log.log(`[Reservations] purged ${snapshotResult.count} snapshots older than ${retentionDays}d`);
    }
    if (stayResult > 0) {
      this.log.log(`[Reservations] purged ${stayResult} guest stays older than ${retentionDays}d`);
    }
    return total;
  }

  /** Clear stale in-house flags when EMMA no longer reports a guest as checked in. */
  private async reconcileInHouseFlags(
    hotelId: string,
    syncedRows: ReservationUpsertRow[],
    result: EmmaReservationSyncResult,
  ): Promise<void> {
    const fetchedFromEmma = result.inhouseList > 0 || result.tabs.inhouse > 0;
    if (!fetchedFromEmma) return;

    const activeIds = syncedRows
      .filter((r) => r.checkIn && !r.checkOut)
      .map((r) => r.reservationId);

    if (activeIds.length === 0) {
      const cleared = await this.prisma.reservationSnapshot.updateMany({
        where: { hotelId, checkIn: true, checkOut: false },
        data: { checkIn: false },
      });
      if (cleared.count > 0) {
        this.log.log(`[Reservations] cleared ${cleared.count} stale in-house flags (EMMA empty)`);
      }
      return;
    }

    const cleared = await this.prisma.reservationSnapshot.updateMany({
      where: {
        hotelId,
        checkIn: true,
        checkOut: false,
        reservationId: { notIn: activeIds },
      },
      data: { checkIn: false },
    });
    if (cleared.count > 0) {
      this.log.log(`[Reservations] cleared ${cleared.count} stale in-house flags`);
    }
  }

  /** EMMA Check-In → Arrivals tab membership (synced from EMMA, not wall-clock date). */
  private checkInListFlagsForRow(
    reservationId: string,
    businessDate: Date,
    arrivals: Set<string>,
    queue: Set<string>,
    checkInsDone: Set<string>,
  ) {
    return {
      inTodayArrivals: arrivals.has(reservationId),
      checkInQueue: queue.has(reservationId),
      inCheckInDone: checkInsDone.has(reservationId),
      checkInBusinessDate: businessDate,
    };
  }

  private async reconcileCheckInListFlags(
    hotelId: string,
    businessDate: Date,
    arrivalsIds: Set<string>,
    queueIds: Set<string>,
    checkInsDoneIds: Set<string>,
  ): Promise<void> {
    await this.prisma.reservationSnapshot.updateMany({
      where: {
        hotelId,
        checkInBusinessDate: { not: businessDate },
        OR: [{ inTodayArrivals: true }, { checkInQueue: true }, { inCheckInDone: true }],
      },
      data: {
        inTodayArrivals: false,
        checkInQueue: false,
        inCheckInDone: false,
      },
    });

    const clearNotIn = async (
      flag: 'inTodayArrivals' | 'checkInQueue' | 'inCheckInDone',
      ids: Set<string>,
    ) => {
      if (ids.size === 0) {
        await this.prisma.reservationSnapshot.updateMany({
          where: { hotelId, checkInBusinessDate: businessDate, [flag]: true },
          data: { [flag]: false },
        });
        return;
      }
      await this.prisma.reservationSnapshot.updateMany({
        where: {
          hotelId,
          checkInBusinessDate: businessDate,
          [flag]: true,
          reservationId: { notIn: [...ids] },
        },
        data: { [flag]: false },
      });
    };

    await clearNotIn('inTodayArrivals', arrivalsIds);
    await clearNotIn('checkInQueue', queueIds);
    await clearNotIn('inCheckInDone', checkInsDoneIds);

    await this.prisma.reservationSnapshot.updateMany({
      where: {
        hotelId,
        checkInBusinessDate: null,
        OR: [{ inTodayArrivals: true }, { checkInQueue: true }, { inCheckInDone: true }],
      },
      data: {
        inTodayArrivals: false,
        checkInQueue: false,
        inCheckInDone: false,
      },
    });
  }

  /** Compare EMMA row to stored snapshot; return update fields only when something changed. */
  private buildReservationPatch(
    existing: {
      arrivalDate: Date;
      departureDate: Date;
      roomId: string | null;
      checkIn: boolean;
      checkOut: boolean;
      checkInQueue: boolean;
      inTodayArrivals: boolean;
      inCheckInDone: boolean;
      checkInBusinessDate: Date | null;
      nightsStay: number | null;
      roomType: string | null;
      mealPlan: string | null;
      tier: string | null;
      numPax: number | null;
      sensitiveEnc: string;
    },
    row: ReservationUpsertRow,
    listFlags: {
      inTodayArrivals: boolean;
      checkInQueue: boolean;
      inCheckInDone: boolean;
      checkInBusinessDate: Date;
    },
  ): Prisma.ReservationSnapshotUpdateInput | null {
    const patch: Prisma.ReservationSnapshotUpdateInput = {};

    if (!this.sameDate(existing.arrivalDate, row.arrivalDate)) patch.arrivalDate = row.arrivalDate;
    if (!this.sameDate(existing.departureDate, row.departureDate)) {
      patch.departureDate = row.departureDate;
    }
    if (existing.roomId !== row.roomId) patch.roomId = row.roomId;
    if (existing.checkIn !== row.checkIn) patch.checkIn = row.checkIn;
    if (existing.checkOut !== row.checkOut) patch.checkOut = row.checkOut;
    if (existing.checkInQueue !== listFlags.checkInQueue) patch.checkInQueue = listFlags.checkInQueue;
    if (existing.inTodayArrivals !== listFlags.inTodayArrivals) {
      patch.inTodayArrivals = listFlags.inTodayArrivals;
    }
    if (existing.inCheckInDone !== listFlags.inCheckInDone) {
      patch.inCheckInDone = listFlags.inCheckInDone;
    }
    if (
      !existing.checkInBusinessDate ||
      !this.sameDate(existing.checkInBusinessDate, listFlags.checkInBusinessDate)
    ) {
      patch.checkInBusinessDate = listFlags.checkInBusinessDate;
    }
    if (existing.nightsStay !== row.nightsStay) patch.nightsStay = row.nightsStay;
    if (existing.roomType !== row.roomType) patch.roomType = row.roomType;
    if (existing.mealPlan !== row.mealPlan) patch.mealPlan = row.mealPlan;
    if (existing.tier !== row.tier) patch.tier = row.tier;
    if (existing.numPax !== row.numPax) patch.numPax = row.numPax;
    if (existing.sensitiveEnc !== row.sensitiveEnc) patch.sensitiveEnc = row.sensitiveEnc;

    if (Object.keys(patch).length === 0) return null;
    patch.syncedAt = row.syncedAt;
    return patch;
  }

  private sameDate(a: Date, b: Date): boolean {
    return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
  }

  private toListItem(row: {
    id: string;
    hotelId: string;
    reservationId: string;
    roomId: string | null;
    arrivalDate: Date;
    departureDate: Date;
    nightsStay: number | null;
    roomType: string | null;
    mealPlan: string | null;
    tier: string | null;
    numPax: number | null;
    checkIn: boolean;
    checkOut: boolean;
    checkInQueue: boolean;
    inTodayArrivals: boolean;
    sensitiveEnc: string;
    detailEnc?: string | null;
    detailFetchedAt?: Date | null;
    folioEnc?: string | null;
    folioFetchedAt?: Date | null;
    arrivalCheckCompletedAt?: Date | null;
    arrivalCheckLastRunId?: string | null;
    syncedAt: Date;
  }, inHouseList = false): ReservationListItem {
    const s = decryptSensitivePayload(this.cipher, row.sensitiveEnc);
    const arrivalDate = formatHotelDateOnly(row.arrivalDate);
    const departureDate = formatHotelDateOnly(row.departureDate);
    const today = todayIsoDate();
    const stay = deriveGuestStaySignals({
      arrivalDate,
      departureDate,
      today,
      checkIn: row.checkIn,
      checkOut: row.checkOut,
      stayover: s?.stayover,
      ocoDone: s?.ocoDone,
      inHouse: inHouseList,
    });
    return {
      id: row.id,
      hotelId: row.hotelId,
      reservationId: row.reservationId,
      roomId: row.roomId,
      mainGuestName: s?.mainGuestName ?? null,
      arrivalDate,
      departureDate,
      nightsStay: row.nightsStay,
      roomType: row.roomType,
      mealPlan: row.mealPlan,
      tier: row.tier,
      numPax: row.numPax,
      vipDesc: s?.vipDesc ?? null,
      checkIn: row.checkIn,
      checkOut: row.checkOut,
      checkInQueue: row.checkInQueue,
      creditCard: s?.creditCard ?? null,
      cardHolder: s?.cardHolder ?? null,
      cardExpiry: s?.cardExpiry ?? null,
      preAuthAmount: s?.preAuthAmount ?? null,
      groupName: s?.groupName ?? null,
      syncedAt: row.syncedAt.toISOString(),
      inTodayArrivals: row.inTodayArrivals,
      detailFetchedAt: row.detailFetchedAt?.toISOString() ?? null,
      folioFetchedAt: row.folioFetchedAt?.toISOString() ?? null,
      stayover: stay.stayover ?? false,
      expectedDepartureTime: s?.expectedDepartureTime ?? null,
      isDepartureToday: stay.isDepartureToday,
      isArrivalToday: stay.isArrivalToday,
      isRestant: stay.isRestant,
      ocoDone: stay.ocoDone ?? false,
      arrivalCheckCompletedAt: row.arrivalCheckCompletedAt?.toISOString() ?? null,
      arrivalCheckLastRunId: row.arrivalCheckLastRunId ?? null,
    };
  }

  private toDetail(row: {
    id: string;
    hotelId: string;
    reservationId: string;
    roomId: string | null;
    arrivalDate: Date;
    departureDate: Date;
    nightsStay: number | null;
    roomType: string | null;
    mealPlan: string | null;
    tier: string | null;
    numPax: number | null;
    checkIn: boolean;
    checkOut: boolean;
    checkInQueue: boolean;
    inTodayArrivals: boolean;
    sensitiveEnc: string;
    detailEnc?: string | null;
    detailFetchedAt?: Date | null;
    folioEnc?: string | null;
    folioFetchedAt?: Date | null;
    syncedAt: Date;
  }): ReservationDetail | null {
    const list = this.toListItem(row);
    const emmaDetail = decryptDetailBundle(this.cipher, row.detailEnc);
    const emmaFolio = decryptFolioBundle(this.cipher, row.folioEnc);
    const s = decryptSensitivePayload(this.cipher, row.sensitiveEnc);
    const resolvedBalance = resolveOutstandingBalance({
      sensitiveBalance: s?.balance,
      folio: emmaFolio,
      detail: emmaDetail,
    }).balance;
    if (!s) {
      return {
        ...list,
        mainGuestId: null,
        mainClientName: null,
        bookingFileId: null,
        groupId: null,
        companyName: null,
        travelAgent: null,
        rateCode: null,
        sourceCode: null,
        marketCode: null,
        balance: resolvedBalance,
        comments: null,
        draftStatus: null,
        draftLockedBy: null,
        stays: null,
        guests: null,
        ciStatusSigned: false,
        stayover: false,
        noMove: false,
        originalRoomType: null,
        roomTypeUpg: null,
        numPax2: null,
        numPax3: null,
        numPax4: null,
        checkInQDate: null,
        detailFetchedAt: row.detailFetchedAt?.toISOString() ?? null,
        emmaDetail,
        folioFetchedAt: row.folioFetchedAt?.toISOString() ?? null,
        emmaFolio,
      };
    }
    return {
      ...list,
      mainGuestId: s.mainGuestId,
      mainClientName: s.mainClientName,
      bookingFileId: s.bookingFileId,
      groupId: s.groupId,
      companyName: s.companyName,
      travelAgent: s.travelAgent,
      rateCode: s.rateCode,
      sourceCode: s.sourceCode,
      marketCode: s.marketCode,
      balance: resolvedBalance,
      comments: s.comments,
      draftStatus: s.draftStatus,
      draftLockedBy: s.draftLockedBy,
      stays: s.stays,
      guests: s.guests,
      ciStatusSigned: s.ciStatusSigned,
      stayover: s.stayover,
      noMove: s.noMove,
      originalRoomType: s.originalRoomType,
      roomTypeUpg: s.roomTypeUpg,
      numPax2: s.numPax2,
      numPax3: s.numPax3,
      numPax4: s.numPax4,
      checkInQDate: s.checkInQDate,
      detailFetchedAt: row.detailFetchedAt?.toISOString() ?? null,
      emmaDetail,
      folioFetchedAt: row.folioFetchedAt?.toISOString() ?? null,
      emmaFolio,
    };
  }
}
