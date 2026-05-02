import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { PuzzelBrowserSessionService } from './puzzel-session.service';
import { PuzzleController } from './puzzle.controller';
import { PuzzleScheduler } from './puzzle.scheduler';
import { PuzzleService } from './puzzle.service';

@Module({
  imports: [SettingsModule],
  controllers: [PuzzleController],
  providers: [PuzzleService, PuzzleScheduler, PuzzelBrowserSessionService],
  exports: [PuzzleService],
})
export class PuzzleModule {}
