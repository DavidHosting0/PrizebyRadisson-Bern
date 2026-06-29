import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from '../prisma/prisma.module';
import { ActivityLogController } from './activity-log.controller';
import { ActivityLogInterceptor } from './activity-log.interceptor';
import { ActivityLogService } from './activity-log.service';

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [ActivityLogController],
  providers: [
    ActivityLogService,
    { provide: APP_INTERCEPTOR, useClass: ActivityLogInterceptor },
  ],
  exports: [ActivityLogService],
})
export class ActivityLogModule {}
