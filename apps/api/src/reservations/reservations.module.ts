import { Module, forwardRef } from '@nestjs/common';
import { CryptoModule } from '../common/crypto/crypto.module';
import { EmmaModule } from '../emma/emma.module';
import { RoomManagementModule } from '../room-management/room-management.module';
import { RoomsModule } from '../rooms/rooms.module';
import { ReservationsAnalyticsService } from './reservations-analytics.service';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';
import { ReservationsScheduler } from './reservations.scheduler';
import { RoomSuggestionService } from './room-suggestion.service';

@Module({
  imports: [
    forwardRef(() => EmmaModule),
    CryptoModule,
    forwardRef(() => RoomManagementModule),
    forwardRef(() => RoomsModule),
  ],
  controllers: [ReservationsController],
  providers: [ReservationsService, ReservationsAnalyticsService, ReservationsScheduler, RoomSuggestionService],
  exports: [ReservationsService],
})
export class ReservationsModule {}
