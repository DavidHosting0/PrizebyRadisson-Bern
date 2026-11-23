import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { BernTicketService } from './bernticket.service';

@Module({
  imports: [SettingsModule],
  providers: [BernTicketService],
  exports: [BernTicketService],
})
export class BernTicketModule {}
