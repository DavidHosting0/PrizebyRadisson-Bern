import { Module, forwardRef } from '@nestjs/common';
import { EmmaModule } from '../emma/emma.module';
import { RoomsService } from './rooms.service';
import { RoomsController } from './rooms.controller';
import { RoomStatusService } from './room-status.service';

@Module({
  imports: [forwardRef(() => EmmaModule)],
  controllers: [RoomsController],
  providers: [RoomsService, RoomStatusService],
  exports: [RoomsService, RoomStatusService],
})
export class RoomsModule {}
