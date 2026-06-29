import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EmmaService } from './emma.service';

@Injectable()
export class EmmaScheduler {
  private readonly logger = new Logger(EmmaScheduler.name);

  constructor(private readonly emma: EmmaService) {}

  /**
   * Pull room statuses from EMMA OData every 5 minutes (configurable).
   * Skips when auto-sync is disabled, credentials missing, or a sync is already running.
   */
  @Cron(process.env.EMMA_AUTO_SYNC_CRON ?? '0 */5 * * * *')
  async runScheduledRoomStatusSync() {
    try {
      await this.emma.runBackgroundRoomStatusSync('cron');
    } catch (err) {
      this.logger.warn(`Scheduled EMMA room sync failed: ${(err as Error).message}`);
    }
  }

  @Cron(process.env.EMMA_PUSH_RETRY_CRON ?? '0 */30 * * * *')
  async retryFailedRoomStatusPushes() {
    try {
      await this.emma.retryFailedRoomStatusPushes();
    } catch (err) {
      this.logger.warn(`EMMA push outbox retry failed: ${(err as Error).message}`);
    }
  }
}
