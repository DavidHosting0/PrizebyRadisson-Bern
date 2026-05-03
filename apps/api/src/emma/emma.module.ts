import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { EmmaController } from './emma.controller';
import { EmmaService } from './emma.service';
import { EmmaBrowserSessionService } from './emma-session.service';

/**
 * EMMA = SAP Fiori Launchpad for Radisson Hotel Group properties.
 *
 * This module owns:
 *   - the four-stage login automation (`emma-scraper.ts`)
 *   - a long-lived Playwright session (`emma-session.service.ts`)
 *   - the high-level service used by HTTP controllers only — no schedulers call EMMA
 *     (`emma.service.ts`)
 *
 * Future EMMA actions (room status, reservations, check-in/out, etc.) should
 * be added as new methods on `EmmaService` reusing the same session service.
 */
@Module({
  imports: [SettingsModule],
  controllers: [EmmaController],
  providers: [EmmaService, EmmaBrowserSessionService],
  exports: [EmmaService],
})
export class EmmaModule {}
