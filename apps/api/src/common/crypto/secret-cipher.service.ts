import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

/**
 * Symmetric envelope encryption for small secrets stored in the database
 * (e.g. third-party integration passwords).
 *
 * Format: base64(iv (12 bytes) || authTag (16 bytes) || ciphertext)
 *
 * Key derivation:
 *   - Prefer FAVUR_ENCRYPTION_KEY env var (any length; we hash to 32 bytes).
 *   - Fall back to JWT_ACCESS_SECRET so dev environments work out of the box.
 *
 * Rotating the key invalidates old ciphertexts; that's intentional.
 */
@Injectable()
export class SecretCipherService {
  private readonly logger = new Logger(SecretCipherService.name);
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const raw =
      config.get<string>('crypto.secretKey') ??
      process.env.FAVUR_ENCRYPTION_KEY ??
      process.env.JWT_ACCESS_SECRET ??
      'dev-encryption-key-change-me';
    if (raw === 'dev-encryption-key-change-me') {
      this.logger.warn(
        'Using fallback encryption key. Set FAVUR_ENCRYPTION_KEY in production.',
      );
    }
    this.key = createHash('sha256').update(raw).digest();
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]).toString('base64');
  }

  decrypt(payload: string): string {
    const buf = Buffer.from(payload, 'base64');
    if (buf.length < 12 + 16 + 1) {
      throw new Error('Cipher payload too short');
    }
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return dec.toString('utf8');
  }

  /** Decrypt or return null if the payload is missing/corrupt. */
  decryptSafe(payload: string | null | undefined): string | null {
    if (!payload) return null;
    try {
      return this.decrypt(payload);
    } catch (e) {
      this.logger.warn(`Failed to decrypt secret: ${(e as Error).message}`);
      return null;
    }
  }
}
