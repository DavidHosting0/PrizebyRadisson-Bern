import { Module } from '@nestjs/common';
import { CryptoModule } from '../common/crypto/crypto.module';
import { EmmaModule } from '../emma/emma.module';
import { RoomsModule } from '../rooms/rooms.module';
import { FrontOfficeController } from './front-office.controller';
import { FrontOfficeBackupService } from './front-office-backup.service';

@Module({
  imports: [CryptoModule, EmmaModule, RoomsModule],
  controllers: [FrontOfficeController],
  providers: [FrontOfficeBackupService],
})
export class FrontOfficeModule {}
