import { Module } from '@nestjs/common';
import { CryptoModule } from '../common/crypto/crypto.module';
import { EmmaModule } from '../emma/emma.module';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';
import { ReservationsScheduler } from './reservations.scheduler';

@Module({
  imports: [EmmaModule, CryptoModule],
  controllers: [ReservationsController],
  providers: [ReservationsService, ReservationsScheduler],
  exports: [ReservationsService],
})
export class ReservationsModule {}
