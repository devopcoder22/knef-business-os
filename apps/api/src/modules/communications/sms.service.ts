import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createId } from '@paralleldrive/cuid2';
import { PrismaService } from '../../common/services/prisma.service';
import { QueueService } from '../../common/services/queue.service';
import { AuditService } from '../audit/audit.service';
import { encrypt, decrypt } from '@knef/utils';
import { QUEUES, JOB_TYPES } from '@knef/constants';
import type { AppConfig } from '../../config/app.config';

export interface SendSmsParams {
  organizationId: string;
  to: string;
  message: string;
  messageType?: 'TRANSACTIONAL' | 'MARKETING';
  providerId?: string;
  idempotencyKey?: string;
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<AppConfig>,
  ) {}

  // ── Provider CRUD ─────────────────────────────────────────────────────────

  async listProviders(organizationId: string) {
    return this.prisma.smsProvider.findMany({
      where: { organizationId, isActive: true },
      select: {
        id: true,
        name: true,
        provider: true,
        senderId: true,
        isDefault: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  async createProvider(
    organizationId: string,
    userId: string,
    dto: { name: string; provider: string; apiKey: string; senderId?: string; isDefault?: boolean },
  ) {
    const existing = await this.prisma.smsProvider.findFirst({
      where: { organizationId, provider: dto.provider },
    });
    if (existing) {
      throw new BadRequestException(`SMS provider '${dto.provider}' is already configured`);
    }

    const encKey = this.encryptionKey;
    if (dto.isDefault) {
      await this.prisma.smsProvider.updateMany({
        where: { organizationId },
        data: { isDefault: false },
      });
    }

    const record = await this.prisma.smsProvider.create({
      data: {
        id: createId(),
        organizationId,
        name: dto.name,
        provider: dto.provider,
        apiKeyEncrypted: encrypt(dto.apiKey, encKey),
        senderId: dto.senderId ?? null,
        isDefault: dto.isDefault ?? false,
      },
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'SMS_PROVIDER_CREATED',
      entity: 'SmsProvider',
      entityId: record.id,
      metadata: { provider: dto.provider },
    });

    return { id: record.id, name: record.name, provider: record.provider, isDefault: record.isDefault };
  }

  async updateProvider(
    organizationId: string,
    userId: string,
    id: string,
    dto: { name?: string; apiKey?: string; senderId?: string; isDefault?: boolean; isActive?: boolean },
  ) {
    const existing = await this.prisma.smsProvider.findFirst({
      where: { id, organizationId },
    });
    if (!existing) throw new NotFoundException('SMS provider not found');

    const encKey = this.encryptionKey;
    if (dto.isDefault) {
      await this.prisma.smsProvider.updateMany({
        where: { organizationId, NOT: { id } },
        data: { isDefault: false },
      });
    }

    const updated = await this.prisma.smsProvider.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.apiKey && { apiKeyEncrypted: encrypt(dto.apiKey, encKey) }),
        ...(dto.senderId !== undefined && { senderId: dto.senderId }),
        ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'SMS_PROVIDER_UPDATED',
      entity: 'SmsProvider',
      entityId: id,
    });

    return { id: updated.id, name: updated.name, isDefault: updated.isDefault };
  }

  async deleteProvider(organizationId: string, userId: string, id: string) {
    const existing = await this.prisma.smsProvider.findFirst({
      where: { id, organizationId },
    });
    if (!existing) throw new NotFoundException('SMS provider not found');

    await this.prisma.smsProvider.delete({ where: { id } });

    await this.audit.log({
      organizationId,
      userId,
      action: 'SMS_PROVIDER_DELETED',
      entity: 'SmsProvider',
      entityId: id,
    });

    return { message: 'SMS provider deleted' };
  }

  // ── Queue SMS send ─────────────────────────────────────────────────────────

  async queueSms(params: SendSmsParams): Promise<{ logId: string }> {
    const log = await this.prisma.communicationLog.create({
      data: {
        id: createId(),
        organizationId: params.organizationId,
        channel: 'SMS',
        messageType: params.messageType ?? 'TRANSACTIONAL',
        recipient: params.to,
        status: 'queued',
      },
    });

    await this.queue.enqueue(QUEUES.NOTIFICATIONS, JOB_TYPES.SEND_SMS, {
      organizationId: params.organizationId,
      to: params.to,
      message: params.message,
      messageType: params.messageType ?? 'TRANSACTIONAL',
      providerId: params.providerId,
      logId: log.id,
      idempotencyKey: params.idempotencyKey,
    });

    return { logId: log.id };
  }

  // ── Resolve provider credentials (called by worker) ───────────────────────

  async resolveProviderCredentials(
    organizationId: string,
    providerId?: string,
  ): Promise<{ provider: string; apiKey: string; senderId: string | null } | null> {
    const record = providerId
      ? await this.prisma.smsProvider.findFirst({ where: { id: providerId, organizationId } })
      : await this.prisma.smsProvider.findFirst({ where: { organizationId, isDefault: true, isActive: true } });

    if (!record) return null;

    const encKey = this.encryptionKey;
    return {
      provider: record.provider,
      apiKey: decrypt(record.apiKeyEncrypted, encKey),
      senderId: record.senderId,
    };
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private get encryptionKey(): string {
    return this.config.get<string>('ENCRYPTION_KEY')!;
  }
}
