import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { PuzzleController } from './puzzle.controller';
import { PuzzleScheduler } from './puzzle.scheduler';
import { PuzzleService } from './puzzle.service';

@Module({
  imports: [SettingsModule],
  controllers: [PuzzleController],
  providers: [PuzzleService, PuzzleScheduler],
  exports: [PuzzleService],
})
export class PuzzleModule {}
