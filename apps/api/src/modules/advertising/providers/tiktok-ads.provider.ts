import { Injectable, NotImplementedException } from '@nestjs/common';
import type {
  IAdvertisingProvider,
  DiscoveredAccount,
  RawCampaign,
  RawAdGroup,
  RawAd,
  RawMetric,
  MetricsParams,
} from '../advertising-provider.interface';

/**
 * TikTok Marketing API v1.3 — FOUNDATION ONLY
 *
 * Separate from the TikTok video publishing integration used in Stage 24E.
 * The Marketing API requires a separate developer access tier from TikTok.
 *
 * Base URL: https://business-api.tiktok.com/open_api/v1.3/
 *
 * Relevant endpoints (once approved):
 *   GET  /open_api/v1.3/oauth2/advertiser/get/   — list accessible advertiser accounts
 *   GET  /open_api/v1.3/campaign/get/            — list campaigns
 *   GET  /open_api/v1.3/adgroup/get/             — list ad groups
 *   GET  /open_api/v1.3/ad/get/                  — list ads
 *   POST /open_api/v1.3/report/integrated/get/   — fetch performance metrics
 *
 * Status: FOUNDATION ONLY — pending TikTok separate developer access tier approval
 */
@Injectable()
export class TikTokAdsProvider implements IAdvertisingProvider {
  readonly provider = 'TIKTOK';

  async discoverAccounts(
    _connection: { accessToken: string; metadata?: Record<string, unknown> },
  ): Promise<DiscoveredAccount[]> {
    throw new NotImplementedException(
      'TikTok Ads: separate developer access tier required before this provider can be used.',
    );
  }

  async syncCampaigns(
    _account: { providerAccountId: string; accessToken: string },
  ): Promise<RawCampaign[]> {
    throw new NotImplementedException(
      'TikTok Ads: separate developer access tier required before this provider can be used.',
    );
  }

  async syncAdGroups(
    _account: { providerAccountId: string; accessToken: string },
    _campaignId: string,
  ): Promise<RawAdGroup[]> {
    throw new NotImplementedException(
      'TikTok Ads: separate developer access tier required before this provider can be used.',
    );
  }

  async syncAds(
    _account: { providerAccountId: string; accessToken: string },
    _adGroupId: string,
  ): Promise<RawAd[]> {
    throw new NotImplementedException(
      'TikTok Ads: separate developer access tier required before this provider can be used.',
    );
  }

  async getMetrics(
    _account: { providerAccountId: string; accessToken: string },
    _params: MetricsParams,
  ): Promise<RawMetric[]> {
    throw new NotImplementedException(
      'TikTok Ads: separate developer access tier required before this provider can be used.',
    );
  }
}
