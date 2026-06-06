import { Module, forwardRef } from '@nestjs/common';
import { CryptoModule } from '../common/crypto/crypto.module';
import { EmmaModule } from '../emma/emma.module';
import { RoomsService } from './rooms.service';
import { RoomsController } from './rooms.controller';
import { RoomStatusService } from './room-status.service';
import { RoomOccupancyService } from './room-occupancy.service';

@Module({
  imports: [forwardRef(() => EmmaModule), CryptoModule],
  controllers: [RoomsController],
  providers: [RoomsService, RoomStatusService, RoomOccupancyService],
  exports: [RoomsService, RoomStatusService],
})
export class RoomsModule {}
