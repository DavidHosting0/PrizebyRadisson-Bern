import { Module } from '@nestjs/common';
import { CryptoModule } from '../common/crypto/crypto.module';
import { ArrivalCheckController } from './arrival-check.controller';
import { ArrivalCheckService } from './arrival-check.service';

@Module({
  imports: [CryptoModule],
  controllers: [ArrivalCheckController],
  providers: [ArrivalCheckService],
  exports: [ArrivalCheckService],
})
export class ArrivalCheckModule {}
