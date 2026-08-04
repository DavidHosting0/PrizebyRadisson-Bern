import { Module, forwardRef } from '@nestjs/common';
import { CryptoModule } from '../common/crypto/crypto.module';
import { DamageReportsModule } from '../damage-reports/damage-reports.module';
import { LostFoundModule } from '../lost-found/lost-found.module';
import { RoomsModule } from '../rooms/rooms.module';
import { RoomManagementController } from './room-management.controller';
import { RoomGuestStayService } from './room-guest-stay.service';
import { RoomManagementService } from './room-management.service';

/**
 * Intentionally does NOT import PhotosModule — that created a Nest circular:
 * RoomsModule → ReservationsModule → RoomManagementModule → PhotosModule → RoomsModule
 * PhotosService is resolved via ModuleRef (PhotosModule is registered on AppModule).
 */
@Module({
  imports: [
    forwardRef(() => RoomsModule),
    DamageReportsModule,
    LostFoundModule,
    CryptoModule,
  ],
  controllers: [RoomManagementController],
  providers: [RoomManagementService, RoomGuestStayService],
  exports: [RoomGuestStayService],
})
export class RoomManagementModule {}
