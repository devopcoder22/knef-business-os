import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import type { RawMetric } from './advertising-provider.interface';

export interface MetricsSummaryQuery {
  provider?: string;
  accountId?: string;
  from: string;
  to: string;
}

export interface MetricsSummaryResult {
  totalSpend: number;
  currency: string;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number | null;
  cpc: number | null;
}

export interface MetricsTimeSeriesQuery {
  provider?: string;
  accountId?: string;
  campaignId?: string;
  from: string;
  to: string;
  groupBy: 'date' | 'campaign' | 'account';
}

@Injectable()
export class AdvertisingMetricsService {
  private readonly logger = new Logger(AdvertisingMetricsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async upsertSnapshot(
    organizationId: string,
    accountId: string,
    provider: string,
    snapshots: RawMetric[],
    campaignId?: string,
  ) {
    const results = [];

    for (const raw of snapshots) {
      const date = new Date(raw.date);

      const record = await this.prisma.advertisingMetricSnapshot.upsert({
        where: {
          advertisingAccountId_campaignId_date_provider: {
            advertisingAccountId: accountId,
            campaignId: campaignId as string,
            date,
            provider,
          },
        },
        create: {
          organizationId,
          advertisingAccountId: accountId,
          campaignId: campaignId ?? undefined,
          date,
          provider,
          impressions: raw.impressions,
          clicks: raw.clicks,
          spend: raw.spend,
          currency: raw.currency,
          conversions: raw.conversions ?? null,
          conversionValue: raw.conversionValue ?? null,
          reach: raw.reach ?? null,
        },
        update: {
          impressions: raw.impressions,
          clicks: raw.clicks,
          spend: raw.spend,
          currency: raw.currency,
          conversions: raw.conversions ?? null,
          conversionValue: raw.conversionValue ?? null,
          reach: raw.reach ?? null,
        },
      });
      results.push(record);
    }

    this.logger.log(
      `Upserted ${results.length} metric snapshots for account ${accountId} (org=${organizationId})`,
    );
    return results;
  }

  async querySummary(
    organizationId: string,
    query: MetricsSummaryQuery,
  ): Promise<MetricsSummaryResult[]> {
    const { provider, accountId, from, to } = query;

    const snapshots = await this.prisma.advertisingMetricSnapshot.findMany({
      where: {
        organizationId,
        ...(provider ? { provider } : {}),
        ...(accountId ? { advertisingAccountId: accountId } : {}),
        date: {
          gte: new Date(from),
          lte: new Date(to),
        },
      },
      select: {
        currency: true,
        impressions: true,
        clicks: true,
        spend: true,
        conversions: true,
      },
    });

    if (snapshots.length === 0) {
      return [
        {
          totalSpend: 0,
          currency: 'USD',
          impressions: 0,
          clicks: 0,
          conversions: 0,
          ctr: null,
          cpc: null,
        },
      ];
    }

    // Group by currency — do NOT mix currencies
    const byCurrency = new Map<
      string,
      { spend: number; impressions: number; clicks: number; conversions: number }
    >();

    for (const snap of snapshots) {
      const cur = snap.currency;
      const existing = byCurrency.get(cur) ?? {
        spend: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
      };
      byCurrency.set(cur, {
        spend: existing.spend + Number(snap.spend),
        impressions: existing.impressions + snap.impressions,
        clicks: existing.clicks + snap.clicks,
        conversions: existing.conversions + Number(snap.conversions ?? 0),
      });
    }

    return Array.from(byCurrency.entries()).map(([currency, totals]) => ({
      totalSpend: totals.spend,
      currency,
      impressions: totals.impressions,
      clicks: totals.clicks,
      conversions: totals.conversions,
      ctr: totals.impressions > 0 ? totals.clicks / totals.impressions : null,
      cpc: totals.clicks > 0 ? totals.spend / totals.clicks : null,
    }));
  }

  async queryTimeSeries(organizationId: string, query: MetricsTimeSeriesQuery) {
    const { provider, accountId, campaignId, from, to } = query;

    return this.prisma.advertisingMetricSnapshot.findMany({
      where: {
        organizationId,
        ...(provider ? { provider } : {}),
        ...(accountId ? { advertisingAccountId: accountId } : {}),
        ...(campaignId ? { campaignId } : {}),
        date: {
          gte: new Date(from),
          lte: new Date(to),
        },
      },
      orderBy: { date: 'asc' },
    });
  }
}
