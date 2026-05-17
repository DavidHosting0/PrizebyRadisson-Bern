import { Module, forwardRef } from '@nestjs/common';
import { DamageReportsController } from './damage-reports.controller';
import { DamageReportsService } from './damage-reports.service';
import { EmmaModule } from '../emma/emma.module';

@Module({
  imports: [forwardRef(() => EmmaModule)],
  controllers: [DamageReportsController],
  providers: [DamageReportsService],
})
export class DamageReportsModule {}
