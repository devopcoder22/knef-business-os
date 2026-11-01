import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/services/prisma.service';
import { CredentialCryptoService } from './credential-crypto.service';
import { CREDENTIAL_CATALOG, CREDENTIAL_KEYS } from './credential.catalog';

export interface CredentialListItem {
  key: string;
  label: string;
  group: string;
  groupLabel: string;
  description: string;
  sensitive: boolean;
  source: 'db' | 'env' | 'not_set';
  maskedValue: string | null;
}

@Injectable()
export class CredentialService {
  private readonly logger = new Logger(CredentialService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CredentialCryptoService,
    private readonly config: ConfigService,
  ) {}

  async list(): Promise<CredentialListItem[]> {
    const dbRows = await this.prisma.systemCredential.findMany({
      select: { key: true, ciphertext: true },
    });
    const dbMap = new Map(dbRows.map((r) => [r.key, r.ciphertext]));

    return CREDENTIAL_CATALOG.map((slot) => {
      const ciphertext = dbMap.get(slot.key);
      if (ciphertext) {
        let maskedValue: string | null = null;
        try {
          const plain = this.crypto.decrypt(ciphertext);
          maskedValue = slot.sensitive ? this.crypto.mask(plain) : plain;
        } catch {
          maskedValue = '(decryption error)';
        }
        return { ...slot, source: 'db' as const, maskedValue };
      }

      const envVal = this.config.get<string>(slot.key);
      if (envVal) {
        return {
          ...slot,
          source: 'env' as const,
          maskedValue: slot.sensitive ? this.crypto.mask(envVal) : envVal,
        };
      }

      return { ...slot, source: 'not_set' as const, maskedValue: null };
    });
  }

  async resolve(key: string): Promise<string | null> {
    const row = await this.prisma.systemCredential.findUnique({
      where: { key },
      select: { ciphertext: true },
    });

    if (row) {
      try {
        return this.crypto.decrypt(row.ciphertext);
      } catch (err) {
        this.logger.error(`Failed to decrypt credential ${key}: ${(err as Error).message}`);
      }
    }

    return this.config.get<string>(key) ?? null;
  }

  async set(key: string, value: string, updatedBy: string): Promise<void> {
    if (!CREDENTIAL_KEYS.has(key)) {
      throw new BadRequestException(`Unknown credential key: ${key}`);
    }
    if (!value || value.trim().length === 0) {
      throw new BadRequestException('Credential value must not be empty');
    }

    const ciphertext = this.crypto.encrypt(value.trim());

    await this.prisma.systemCredential.upsert({
      where: { key },
      create: { key, ciphertext, updatedBy },
      update: { ciphertext, updatedBy },
    });

    this.logger.log(`Credential ${key} updated by ${updatedBy}`);
  }

  async delete(key: string): Promise<void> {
    if (!CREDENTIAL_KEYS.has(key)) {
      throw new BadRequestException(`Unknown credential key: ${key}`);
    }

    const existing = await this.prisma.systemCredential.findUnique({ where: { key } });
    if (!existing) {
      throw new NotFoundException(`No DB credential found for key: ${key}. Env var fallback still applies.`);
    }

    await this.prisma.systemCredential.delete({ where: { key } });
    this.logger.log(`Credential ${key} removed from DB (env fallback now applies)`);
  }
}
