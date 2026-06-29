import { Module, forwardRef } from '@nestjs/common';
import { CryptoModule } from '../common/crypto/crypto.module';
import { ReservationsModule } from '../reservations/reservations.module';
import { DeparturesController } from './departures.controller';
import { DeparturesService } from './departures.service';

@Module({
  imports: [CryptoModule, forwardRef(() => ReservationsModule)],
  controllers: [DeparturesController],
  providers: [DeparturesService],
  exports: [DeparturesService],
})
export class DeparturesModule {}
