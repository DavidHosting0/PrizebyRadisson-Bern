import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { FavurService } from './favur.service';

@Injectable()
export class FavurScheduler {
  private readonly logger = new Logger(FavurScheduler.name);

  constructor(private readonly favur: FavurService) {}

  /**
   * Every 15 minutes, attempt a Favur sync. The service itself short-circuits
   * if integration is disabled / not configured, and uses a DB lock to avoid
   * overlap with manual triggers.
   */
  @Cron('0 */15 * * * *')
  async runScheduledSync() {
    try {
      const config = await this.favur.getConfig();
      if (!config.enabled || !config.email || !config.hasPassword) return;
      await this.favur.syncNow('cron');
    } catch (err) {
      this.logger.warn(`Scheduled Favur sync failed: ${(err as Error).message}`);
    }
  }
}
