import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const PREFIX = 'enc:v1:';

@Injectable()
export class CredentialCryptoService implements OnModuleInit {
  private readonly logger = new Logger(CredentialCryptoService.name);
  private key!: Buffer;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const hex =
      this.config.get<string>('CREDENTIALS_ENCRYPTION_KEY') ??
      this.config.get<string>('ENCRYPTION_KEY');

    if (!hex || hex.length !== 64) {
      throw new Error(
        'ENCRYPTION_KEY must be present and exactly 64 hex characters (32 bytes). ' +
        'Generate one with: openssl rand -hex 32',
      );
    }
    this.key = Buffer.from(hex, 'hex');
    this.logger.log('Credential encryption key loaded');
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGO, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    // Format: enc:v1:<iv_hex>:<tag_hex>:<ciphertext_hex>
    return `${PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  decrypt(stored: string): string {
    if (!stored.startsWith(PREFIX)) {
      throw new Error('Invalid credential format: missing enc:v1: prefix');
    }
    const body = stored.slice(PREFIX.length);
    const parts = body.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid credential format: expected iv:tag:ciphertext');
    }
    const [ivHex, tagHex, ciphertextHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const ciphertext = Buffer.from(ciphertextHex, 'hex');

    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
      throw new Error('Invalid credential format: wrong IV or tag length');
    }

    const decipher = createDecipheriv(ALGO, this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }

  isEncrypted(value: string): boolean {
    return value.startsWith(PREFIX);
  }

  mask(plaintext: string): string {
    if (plaintext.length <= 4) return '••••';
    const visible = plaintext.slice(-4);
    const dots = '•'.repeat(Math.min(plaintext.length - 4, 16));
    return `${dots}${visible}`;
  }
}
