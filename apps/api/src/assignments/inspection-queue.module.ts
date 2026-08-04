import { Module } from '@nestjs/common';
import { InspectionQueueService } from './inspection-queue.service';

/** Leaf module — no Rooms/Photos imports (avoids Nest circular DI). */
@Module({
  providers: [InspectionQueueService],
  exports: [InspectionQueueService],
})
export class InspectionQueueModule {}
