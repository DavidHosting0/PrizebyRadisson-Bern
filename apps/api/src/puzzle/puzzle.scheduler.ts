import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PuzzleService } from './puzzle.service';

@Injectable()
export class PuzzleScheduler {
  private readonly log = new Logger(PuzzleScheduler.name);

  constructor(private readonly puzzle: PuzzleService) {}

  @Cron('0 */20 * * * *')
  async scheduledPuzzelPull() {
    try {
      await this.puzzle.runScheduledSyncIfEnabled();
    } catch (e) {
      this.log.warn(`Puzzle cron: ${(e as Error).message}`);
    }
  }
}
