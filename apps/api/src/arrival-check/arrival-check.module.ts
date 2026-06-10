import { Module, forwardRef } from '@nestjs/common';
import { CryptoModule } from '../common/crypto/crypto.module';
import { ReservationsModule } from '../reservations/reservations.module';
import { ArrivalCheckController } from './arrival-check.controller';
import { ArrivalCheckService } from './arrival-check.service';

@Module({
  imports: [CryptoModule, forwardRef(() => ReservationsModule)],
  controllers: [ArrivalCheckController],
  providers: [ArrivalCheckService],
  exports: [ArrivalCheckService],
})
export class ArrivalCheckModule {}
