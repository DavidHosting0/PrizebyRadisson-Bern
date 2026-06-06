import { Module, forwardRef } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { RoomsModule } from '../rooms/rooms.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { CryptoModule } from '../common/crypto/crypto.module';
import { EmmaController } from './emma.controller';
import { EmmaService } from './emma.service';
import { EmmaScheduler } from './emma.scheduler';
/** EMMA: HTTP session + OData room-status sync (no browser automation). */
@Module({
  imports: [SettingsModule, CryptoModule, forwardRef(() => RoomsModule), RealtimeModule],
  controllers: [EmmaController],
  providers: [EmmaService, EmmaScheduler],
  exports: [EmmaService],
})
export class EmmaModule {}
