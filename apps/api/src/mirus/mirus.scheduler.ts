import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MirusService } from './mirus.service';

@Injectable()
export class MirusScheduler {
  private readonly logger = new Logger(MirusScheduler.name);

  constructor(private readonly mirus: MirusService) {}

  @Cron('0 */15 * * * *')
  async tick() {
    try {
      const config = await this.mirus.getConfig();
      if (!config.enabled) return;
      if (!config.hasMirusPassword) return;
      await this.mirus.syncNow('cron');
    } catch (err) {
      this.logger.warn(`Mirus cron sync: ${(err as Error).message}`);
    }
  }
}
