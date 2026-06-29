import { Module, forwardRef } from '@nestjs/common';
import { AssignmentsService } from './assignments.service';
import { AssignmentsController } from './assignments.controller';
import { RoomsModule } from '../rooms/rooms.module';
import { EmmaModule } from '../emma/emma.module';
import { DeparturesModule } from '../departures/departures.module';

@Module({
  imports: [RoomsModule, DeparturesModule, forwardRef(() => EmmaModule)],
  controllers: [AssignmentsController],
  providers: [AssignmentsService],
})
export class AssignmentsModule {}
