import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createId } from '@paralleldrive/cuid2';
import { PrismaService } from '../../common/services/prisma.service';
import { AuditService } from '../audit/audit.service';
import { QueueService } from '../../common/services/queue.service';
import { encrypt, decrypt } from '@knef/utils';
import { QUEUES, JOB_TYPES } from '@knef/constants';
import type { AppConfig } from '../../config/app.config';
import { MetaWhatsAppProvider } from './providers/meta-whatsapp.provider';

export interface ConfigureWhatsAppDto {
  phoneNumberId: string;
  businessAccountId: string;
  accessToken: string;
  appSecret?: string;
  webhookVerifyToken?: string;
  displayPhoneNumber?: string;
  businessAccountName?: string;
}

@Injectable()
export class WhatsAppConfigService {
  private readonly logger = new Logger(WhatsAppConfigService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly queue: QueueService,
    private readonly config: ConfigService<AppConfig>,
    private readonly metaProvider: MetaWhatsAppProvider,
  ) {}

  private get encKey(): string {
    return this.config.getOrThrow<string>('ENCRYPTION_KEY');
  }

  async getConfig(organizationId: string) {
    const cfg = await this.prisma.whatsAppConfig.findUnique({
      where: { organizationId },
      select: {
        id: true,
        organizationId: true,
        phoneNumberId: true,
        businessAccountId: true,
        displayPhoneNumber: true,
        businessAccountName: true,
        status: true,
        webhookVerifiedAt: true,
        lastHealthCheckAt: true,
        qualityRating: true,
        messagingLimit: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!cfg) return null;
    return cfg;
  }

  async configure(organizationId: string, userId: string, dto: ConfigureWhatsAppDto) {
    if (!dto.phoneNumberId.trim()) throw new BadRequestException('phoneNumberId is required');
    if (!dto.businessAccountId.trim()) throw new BadRequestException('businessAccountId is required');
    if (!dto.accessToken.trim()) throw new BadRequestException('accessToken is required');

    const encKey = this.encKey;
    const existing = await this.prisma.whatsAppConfig.findUnique({ where: { organizationId } });

    const data = {
      phoneNumberId: dto.phoneNumberId.trim(),
      businessAccountId: dto.businessAccountId.trim(),
      accessTokenEncrypted: encrypt(dto.accessToken, encKey),
      ...(dto.appSecret ? { appSecretEncrypted: encrypt(dto.appSecret, encKey) } : {}),
      ...(dto.webhookVerifyToken !== undefined ? { webhookVerifyToken: dto.webhookVerifyToken } : {}),
      ...(dto.displayPhoneNumber ? { displayPhoneNumber: dto.displayPhoneNumber.trim() } : {}),
      ...(dto.businessAccountName ? { businessAccountName: dto.businessAccountName.trim() } : {}),
      status: 'CONNECTING',
      isActive: true,
    };

    let cfg;
    if (existing) {
      cfg = await this.prisma.whatsAppConfig.update({
        where: { organizationId },
        data,
      });
      await this.audit.log({ organizationId, userId, action: 'WHATSAPP_RECONFIGURED', entity: 'WhatsAppConfig', entityId: cfg.id }).catch(() => {});
    } else {
      cfg = await this.prisma.whatsAppConfig.create({
        data: { id: createId(), organizationId, ...data },
      });
      await this.audit.log({ organizationId, userId, action: 'WHATSAPP_CONFIGURED', entity: 'WhatsAppConfig', entityId: cfg.id }).catch(() => {});
    }

    // Enqueue health check to validate connection
    await this.queue.enqueue(QUEUES.INTEGRATIONS, JOB_TYPES.WHATSAPP_HEALTH_CHECK, {
      organizationId,
      configId: cfg.id,
    }).catch(() => {});

    return this.getConfig(organizationId);
  }

  async markWebhookVerified(organizationId: string) {
    const cfg = await this.prisma.whatsAppConfig.findUnique({ where: { organizationId } });
    if (!cfg) return;
    await this.prisma.whatsAppConfig.update({
      where: { organizationId },
      data: { webhookVerifiedAt: new Date(), status: cfg.status === 'CONNECTING' ? 'CONNECTED' : cfg.status },
    });
  }

  async resolveAccessToken(organizationId: string): Promise<string> {
    const cfg = await this.prisma.whatsAppConfig.findUnique({ where: { organizationId } });
    if (!cfg) throw new NotFoundException('WhatsApp not configured for this organization');
    return decrypt(cfg.accessTokenEncrypted, this.encKey);
  }

  async resolveAppSecret(organizationId: string): Promise<string | null> {
    const cfg = await this.prisma.whatsAppConfig.findUnique({ where: { organizationId } });
    if (!cfg?.appSecretEncrypted) return null;
    return decrypt(cfg.appSecretEncrypted, this.encKey);
  }

  async performHealthCheck(organizationId: string): Promise<void> {
    const cfg = await this.prisma.whatsAppConfig.findUnique({ where: { organizationId } });
    if (!cfg) return;

    try {
      const accessToken = decrypt(cfg.accessTokenEncrypted, this.encKey);
      const health = await this.metaProvider.getPhoneHealth(cfg.phoneNumberId, accessToken);

      await this.prisma.whatsAppConfig.update({
        where: { organizationId },
        data: {
          status: health.status === 'CONNECTED' || health.status === 'UNKNOWN' ? 'CONNECTED' : 'DEGRADED',
          qualityRating: health.qualityRating,
          messagingLimit: health.messagingLimit,
          displayPhoneNumber: health.displayPhoneNumber || cfg.displayPhoneNumber,
          lastHealthCheckAt: new Date(),
        },
      });
    } catch (err) {
      await this.prisma.whatsAppConfig.update({
        where: { organizationId },
        data: { status: 'DEGRADED', lastHealthCheckAt: new Date() },
      }).catch(() => {});
      this.logger.warn(`WhatsApp health check failed for org ${organizationId}: ${(err as Error).message}`);
    }
  }

  async findByVerifyToken(
    verifyToken: string,
  ): Promise<{ organizationId: string; phoneNumberId: string } | null> {
    return this.prisma.whatsAppConfig.findFirst({
      where: { webhookVerifyToken: verifyToken, isActive: true },
      select: { organizationId: true, phoneNumberId: true },
    });
  }

  async findByWabaId(
    wabaId: string,
  ): Promise<{ organizationId: string; phoneNumberId: string } | null> {
    return this.prisma.whatsAppConfig.findFirst({
      where: { businessAccountId: wabaId, isActive: true },
      select: { organizationId: true, phoneNumberId: true },
    });
  }

  async disconnect(organizationId: string, userId: string): Promise<void> {
    const cfg = await this.prisma.whatsAppConfig.findUnique({ where: { organizationId } });
    if (!cfg) throw new NotFoundException('WhatsApp not configured');

    await this.prisma.whatsAppConfig.update({
      where: { organizationId },
      data: { status: 'DISCONNECTED', isActive: false },
    });
    await this.audit.log({ organizationId, userId, action: 'WHATSAPP_DISCONNECTED', entity: 'WhatsAppConfig', entityId: cfg.id }).catch(() => {});
  }
}
