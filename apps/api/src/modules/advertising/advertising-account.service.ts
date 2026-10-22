import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { AuditService } from '../audit/audit.service';
import { QueueService } from '../../common/services/queue.service';
import { QUEUES, JOB_TYPES } from '@knef/constants';
import type { AdvertisingAccountSyncJobData } from '@knef/constants';

export interface LinkAccountDto {
  connectionId: string;
  provider: string;
  providerAccountId: string;
  displayName: string;
  currency?: string;
  timezone?: string;
}

export interface UpdateAccountDto {
  isActive?: boolean;
  displayName?: string;
}

@Injectable()
export class AdvertisingAccountService {
  private readonly logger = new Logger(AdvertisingAccountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listAccounts(organizationId: string) {
    return this.prisma.advertisingAccount.findMany({
      where: { organizationId },
      include: {
        connection: {
          select: {
            id: true,
            displayName: true,
            status: true,
            tokenStatus: true,
            tokenExpiresAt: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getAccount(organizationId: string, id: string) {
    const account = await this.prisma.advertisingAccount.findFirst({
      where: { id, organizationId },
      include: { connection: { select: { id: true, displayName: true, status: true } } },
    });
    if (!account) throw new NotFoundException('Advertising account not found.');
    return account;
  }

  async linkAccount(organizationId: string, userId: string, dto: LinkAccountDto) {
    // Verify connectionId belongs to this org
    const connection = await this.prisma.externalConnection.findFirst({
      where: { id: dto.connectionId, organizationId },
    });
    if (!connection) {
      throw new BadRequestException(
        'Connection not found or does not belong to this organization.',
      );
    }

    const account = await this.prisma.advertisingAccount.create({
      data: {
        organizationId,
        connectionId: dto.connectionId,
        provider: dto.provider,
        providerAccountId: dto.providerAccountId,
        displayName: dto.displayName,
        currency: dto.currency ?? 'USD',
        timezone: dto.timezone ?? 'UTC',
      },
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'ADVERTISING_ACCOUNT_LINKED',
      entity: 'AdvertisingAccount',
      entityId: account.id,
      metadata: {
        provider: dto.provider,
        providerAccountId: dto.providerAccountId,
        displayName: dto.displayName,
      },
    });

    this.logger.log(
      `Linked advertising account ${account.id} (${dto.provider}, org=${organizationId})`,
    );

    return account;
  }

  async updateAccount(organizationId: string, id: string, dto: UpdateAccountDto) {
    await this.getAccount(organizationId, id);
    return this.prisma.advertisingAccount.update({
      where: { id },
      data: {
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.displayName !== undefined ? { displayName: dto.displayName } : {}),
      },
    });
  }

  async removeAccount(organizationId: string, id: string, userId: string) {
    const account = await this.getAccount(organizationId, id);
    await this.prisma.advertisingAccount.update({
      where: { id },
      data: { isActive: false },
    });
    await this.audit.log({
      organizationId,
      userId,
      action: 'ADVERTISING_ACCOUNT_REMOVED',
      entity: 'AdvertisingAccount',
      entityId: id,
      metadata: { provider: account.provider, displayName: account.displayName },
    });
  }

  async triggerSync(organizationId: string, id: string, queueService: QueueService) {
    await this.getAccount(organizationId, id);
    const account = await this.prisma.advertisingAccount.findFirst({
      where: { id, organizationId },
    });
    if (!account) throw new NotFoundException('Advertising account not found.');

    const jobData: AdvertisingAccountSyncJobData = {
      organizationId,
      advertisingAccountId: id,
      provider: account.provider,
    };

    await queueService.enqueue(QUEUES.ADVERTISING, JOB_TYPES.ADVERTISING_ACCOUNT_SYNC, jobData);

    this.logger.log(`Enqueued account sync for ${id} (${account.provider}, org=${organizationId})`);
    return { queued: true, jobType: JOB_TYPES.ADVERTISING_ACCOUNT_SYNC };
  }
}
