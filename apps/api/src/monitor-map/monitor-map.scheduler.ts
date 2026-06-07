import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MonitorMapService } from './monitor-map.service';

@Injectable()
export class MonitorMapScheduler {
  private readonly log = new Logger(MonitorMapScheduler.name);

  constructor(private readonly monitorMap: MonitorMapService) {}

  @Cron('0 */5 * * * *')
  async syncFeeds() {
    try {
      await this.monitorMap.syncFeeds();
    } catch (e) {
      this.log.warn(`Feed sync cron: ${(e as Error).message}`);
    }
  }

  @Cron('*/30 * * * * *')
  async refreshAviation() {
    try {
      await this.monitorMap.refreshAviation();
    } catch (e) {
      this.log.warn(`Aviation cron: ${(e as Error).message}`);
    }
  }
}
