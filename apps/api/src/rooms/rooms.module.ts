import { Module, forwardRef } from '@nestjs/common';
import { CryptoModule } from '../common/crypto/crypto.module';
import { EmmaModule } from '../emma/emma.module';
import { ReservationsModule } from '../reservations/reservations.module';
import { RoomsService } from './rooms.service';
import { RoomsController } from './rooms.controller';
import { RoomStatusService } from './room-status.service';
import { RoomOccupancyService } from './room-occupancy.service';

@Module({
  imports: [forwardRef(() => EmmaModule), forwardRef(() => ReservationsModule), CryptoModule],
  controllers: [RoomsController],
  providers: [RoomsService, RoomStatusService, RoomOccupancyService],
  exports: [RoomsService, RoomStatusService],
})
export class RoomsModule {}
