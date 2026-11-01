import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import type { RawCampaign } from './advertising-provider.interface';

export interface ListCampaignsQuery {
  accountId?: string;
  provider?: string;
  status?: string;
  skip?: number;
  take?: number;
}

@Injectable()
export class AdvertisingCampaignService {
  private readonly logger = new Logger(AdvertisingCampaignService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listCampaigns(organizationId: string, query: ListCampaignsQuery = {}) {
    const { accountId, provider, status, skip = 0, take = 50 } = query;

    return this.prisma.advertisingCampaign.findMany({
      where: {
        organizationId,
        ...(accountId ? { advertisingAccountId: accountId } : {}),
        ...(provider ? { provider } : {}),
        ...(status ? { status } : {}),
      },
      skip,
      take,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getCampaign(organizationId: string, id: string) {
    const campaign = await this.prisma.advertisingCampaign.findFirst({
      where: { id, organizationId },
    });
    if (!campaign) throw new NotFoundException('Advertising campaign not found.');
    return campaign;
  }

  async upsertFromSync(
    organizationId: string,
    accountId: string,
    campaigns: RawCampaign[],
  ) {
    const now = new Date();
    const results = [];

    for (const raw of campaigns) {
      const record = await this.prisma.advertisingCampaign.upsert({
        where: {
          advertisingAccountId_providerCampaignId: {
            advertisingAccountId: accountId,
            providerCampaignId: raw.providerCampaignId,
          },
        },
        create: {
          organizationId,
          advertisingAccountId: accountId,
          provider: (await this.prisma.advertisingAccount.findFirst({
            where: { id: accountId },
            select: { provider: true },
          }))?.provider ?? '',
          providerCampaignId: raw.providerCampaignId,
          name: raw.name,
          status: raw.status,
          objective: raw.objective,
          budgetType: raw.budgetType,
          budgetAmountMicros: raw.budgetAmountMicros,
          currency: raw.currency,
          startDate: raw.startDate,
          endDate: raw.endDate,
          providerStatus: raw.providerStatus,
          rawMeta: (raw.rawMeta as object) ?? {},
          lastSyncedAt: now,
        },
        update: {
          name: raw.name,
          status: raw.status,
          objective: raw.objective,
          budgetType: raw.budgetType,
          budgetAmountMicros: raw.budgetAmountMicros,
          currency: raw.currency,
          startDate: raw.startDate,
          endDate: raw.endDate,
          providerStatus: raw.providerStatus,
          rawMeta: (raw.rawMeta as object) ?? {},
          lastSyncedAt: now,
        },
      });
      results.push(record);
    }

    this.logger.log(
      `Upserted ${results.length} campaigns for account ${accountId} (org=${organizationId})`,
    );

    return results;
  }
}
