import { Module, forwardRef } from '@nestjs/common';
import { InspectionsService } from './inspections.service';
import { InspectionsController } from './inspections.controller';
import { RoomsModule } from '../rooms/rooms.module';
import { EmmaModule } from '../emma/emma.module';
import { InspectionQueueModule } from '../assignments/inspection-queue.module';

@Module({
  imports: [RoomsModule, InspectionQueueModule, forwardRef(() => EmmaModule)],
  controllers: [InspectionsController],
  providers: [InspectionsService],
})
export class InspectionsModule {}
