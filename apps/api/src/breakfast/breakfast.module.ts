import { Module } from '@nestjs/common';
import { BreakfastController } from './breakfast.controller';
import { BreakfastService } from './breakfast.service';

@Module({
  controllers: [BreakfastController],
  providers: [BreakfastService],
  exports: [BreakfastService],
})
export class BreakfastModule {}
