import { Module } from '@nestjs/common';
import { SecretCipherService } from './secret-cipher.service';

@Module({
  providers: [SecretCipherService],
  exports: [SecretCipherService],
})
export class CryptoModule {}
