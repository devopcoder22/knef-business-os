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
 * Meta Marketing API v21.0 — FOUNDATION ONLY
 *
 * Requires Meta App Review for ads-specific scopes, which are separate from
 * the social publishing scopes used in Stage 24E:
 *   - ads_read       — read ad account data and insights
 *   - ads_management — create/manage campaigns, ad sets, ads
 *
 * These are Business-level permissions requiring Meta App Review at:
 *   https://developers.facebook.com/docs/marketing-api/overview/permission-requirements
 *
 * Relevant endpoints (once approved):
 *   GET /v21.0/me/adaccounts                — list accessible ad accounts
 *   GET /v21.0/act_{id}/campaigns           — list campaigns
 *   GET /v21.0/act_{id}/insights            — fetch metrics/insights
 *   POST /v21.0/act_{id}/campaigns          — create campaign
 *
 * Status: FOUNDATION ONLY — pending Meta App Review for ads_read/ads_management scopes
 */
@Injectable()
export class MetaAdsProvider implements IAdvertisingProvider {
  readonly provider = 'META';

  async discoverAccounts(
    _connection: { accessToken: string; metadata?: Record<string, unknown> },
  ): Promise<DiscoveredAccount[]> {
    throw new NotImplementedException(
      'Meta Ads: app review for ads_read/ads_management scopes required before this provider can be used.',
    );
  }

  async syncCampaigns(
    _account: { providerAccountId: string; accessToken: string },
  ): Promise<RawCampaign[]> {
    throw new NotImplementedException(
      'Meta Ads: app review for ads_read/ads_management scopes required before this provider can be used.',
    );
  }

  async syncAdGroups(
    _account: { providerAccountId: string; accessToken: string },
    _campaignId: string,
  ): Promise<RawAdGroup[]> {
    throw new NotImplementedException(
      'Meta Ads: app review for ads_read/ads_management scopes required before this provider can be used.',
    );
  }

  async syncAds(
    _account: { providerAccountId: string; accessToken: string },
    _adGroupId: string,
  ): Promise<RawAd[]> {
    throw new NotImplementedException(
      'Meta Ads: app review for ads_read/ads_management scopes required before this provider can be used.',
    );
  }

  async getMetrics(
    _account: { providerAccountId: string; accessToken: string },
    _params: MetricsParams,
  ): Promise<RawMetric[]> {
    throw new NotImplementedException(
      'Meta Ads: app review for ads_read/ads_management scopes required before this provider can be used.',
    );
  }
}
