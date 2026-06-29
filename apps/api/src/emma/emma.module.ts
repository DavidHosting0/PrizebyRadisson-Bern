import { Module, forwardRef } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { RoomsModule } from '../rooms/rooms.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { CryptoModule } from '../common/crypto/crypto.module';
import { EmmaController } from './emma.controller';
import { EmmaService } from './emma.service';
import { EmmaScheduler } from './emma.scheduler';
import { EmmaIntegrationAlertService } from './emma-integration-alert.service';
import { EmmaPushOutboxService } from './emma-push-outbox.service';
/** EMMA: HTTP session + OData room-status sync (no browser automation). */
@Module({
  imports: [SettingsModule, CryptoModule, forwardRef(() => RoomsModule), RealtimeModule],
  controllers: [EmmaController],
  providers: [
    EmmaService,
    EmmaScheduler,
    EmmaIntegrationAlertService,
    EmmaPushOutboxService,
  ],
  exports: [EmmaService],
})
export class EmmaModule {}
