import { Module, forwardRef } from '@nestjs/common';
import { CryptoModule } from '../common/crypto/crypto.module';
import { EmmaModule } from '../emma/emma.module';
import { RoomManagementModule } from '../room-management/room-management.module';
import { ReservationsAnalyticsService } from './reservations-analytics.service';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';
import { ReservationsScheduler } from './reservations.scheduler';

@Module({
  imports: [forwardRef(() => EmmaModule), CryptoModule, forwardRef(() => RoomManagementModule)],
  controllers: [ReservationsController],
  providers: [ReservationsService, ReservationsAnalyticsService, ReservationsScheduler],
  exports: [ReservationsService],
})
export class ReservationsModule {}
