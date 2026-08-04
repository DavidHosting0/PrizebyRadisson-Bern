import { Module, forwardRef } from '@nestjs/common';
import { AssignmentsService } from './assignments.service';
import { AssignmentsController } from './assignments.controller';
import { DailyCleaningService, PublicAreasService } from './daily-cleaning.service';
import { InspectionQueueModule } from './inspection-queue.module';
import { PublicAreasController } from './public-areas.controller';
import { RoomsModule } from '../rooms/rooms.module';
import { EmmaModule } from '../emma/emma.module';
import { DeparturesModule } from '../departures/departures.module';

@Module({
  imports: [
    RoomsModule,
    DeparturesModule,
    forwardRef(() => EmmaModule),
    InspectionQueueModule,
  ],
  controllers: [AssignmentsController, PublicAreasController],
  providers: [AssignmentsService, DailyCleaningService, PublicAreasService],
  exports: [DailyCleaningService, InspectionQueueModule],
})
export class AssignmentsModule {}
