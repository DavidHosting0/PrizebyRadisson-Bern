import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { CryptoModule } from '../common/crypto/crypto.module';
import { MirusController } from './mirus.controller';
import { MirusService } from './mirus.service';
import { MirusScheduler } from './mirus.scheduler';

@Module({
  imports: [PrismaModule, StorageModule, CryptoModule],
  controllers: [MirusController],
  providers: [MirusService, MirusScheduler],
  exports: [MirusService],
})
export class MirusModule {}
