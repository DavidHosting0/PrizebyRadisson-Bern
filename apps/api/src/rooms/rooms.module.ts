import { Module } from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { RoomsController } from './rooms.controller';
import { RoomStatusService } from './room-status.service';

@Module({
  imports: [],
  controllers: [RoomsController],
  providers: [RoomsService, RoomStatusService],
  exports: [RoomsService, RoomStatusService],
})
export class RoomsModule {}
