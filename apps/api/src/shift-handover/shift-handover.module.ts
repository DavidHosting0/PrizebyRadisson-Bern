import { Module } from '@nestjs/common';
import { ShiftHandoverController } from './shift-handover.controller';
import { ShiftHandoverService } from './shift-handover.service';

@Module({
  controllers: [ShiftHandoverController],
  providers: [ShiftHandoverService],
})
export class ShiftHandoverModule {}
