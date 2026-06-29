import { Module, forwardRef } from '@nestjs/common';
import { CryptoModule } from '../common/crypto/crypto.module';
import { DamageReportsModule } from '../damage-reports/damage-reports.module';
import { LostFoundModule } from '../lost-found/lost-found.module';
import { PhotosModule } from '../photos/photos.module';
import { RoomsModule } from '../rooms/rooms.module';
import { RoomManagementController } from './room-management.controller';
import { RoomGuestStayService } from './room-guest-stay.service';
import { RoomManagementService } from './room-management.service';

@Module({
  imports: [
    forwardRef(() => RoomsModule),
    forwardRef(() => PhotosModule),
    DamageReportsModule,
    LostFoundModule,
    CryptoModule,
  ],
  controllers: [RoomManagementController],
  providers: [RoomManagementService, RoomGuestStayService],
  exports: [RoomGuestStayService],
})
export class RoomManagementModule {}
