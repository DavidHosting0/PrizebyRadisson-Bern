import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ReservationsService } from './reservations.service';

@Injectable()
export class ReservationsScheduler {
  private readonly logger = new Logger(ReservationsScheduler.name);

  constructor(private readonly reservations: ReservationsService) {}

  @Cron(process.env.EMMA_RESERVATION_SYNC_CRON ?? '0 */3 * * * *')
  async runScheduledReservationSync() {
    try {
      await this.reservations.runBackgroundSync('cron');
    } catch (err) {
      this.logger.warn(`Scheduled reservation sync failed: ${(err as Error).message}`);
    }
  }

  /** Nightly purge of old reservation snapshots (default 03:15). */
  @Cron(process.env.EMMA_RESERVATION_PURGE_CRON ?? '0 15 3 * * *')
  async runRetentionPurge() {
    const days = parseInt(process.env.EMMA_RESERVATION_RETENTION_DAYS ?? '30', 10);
    try {
      await this.reservations.purgeExpired(days);
    } catch (err) {
      this.logger.warn(`Reservation retention purge failed: ${(err as Error).message}`);
    }
  }
}
