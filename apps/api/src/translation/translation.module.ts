import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { TranslationService } from './translation.service';

@Module({
  imports: [SettingsModule],
  providers: [TranslationService],
  exports: [TranslationService],
})
export class TranslationModule {}
