import { Module, forwardRef } from '@nestjs/common';
import { ServiceRequestsService } from './service-requests.service';
import { ServiceRequestsController } from './service-requests.controller';
import { RoomsModule } from '../rooms/rooms.module';
import { EmmaModule } from '../emma/emma.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [RoomsModule, forwardRef(() => EmmaModule), NotificationsModule],
  controllers: [ServiceRequestsController],
  providers: [ServiceRequestsService],
})
export class ServiceRequestsModule {}
