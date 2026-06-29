import { Module } from '@nestjs/common';
import { LostFoundService } from './lost-found.service';
import { LostFoundController } from './lost-found.controller';

@Module({
  controllers: [LostFoundController],
  providers: [LostFoundService],
  exports: [LostFoundService],
})
export class LostFoundModule {}
