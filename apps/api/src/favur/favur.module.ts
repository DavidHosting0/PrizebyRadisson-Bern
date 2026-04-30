import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { CryptoModule } from '../common/crypto/crypto.module';
import { FavurController } from './favur.controller';
import { FavurService } from './favur.service';
import { FavurScraperService } from './favur-scraper.service';
import { FavurScheduler } from './favur.scheduler';

@Module({
  imports: [PrismaModule, StorageModule, CryptoModule],
  controllers: [FavurController],
  providers: [FavurService, FavurScraperService, FavurScheduler],
  exports: [FavurService],
})
export class FavurModule {}
