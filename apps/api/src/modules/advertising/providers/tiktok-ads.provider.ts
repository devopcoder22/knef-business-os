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
 * TikTok Marketing API v1.3 — FOUNDATION ONLY — BUSINESS/MARKETING API ACCESS REQUIRED
 *
 * Separate from the TikTok video publishing integration used in Stage 24E.
 * The Marketing API requires a separate developer access tier and Business Center account.
 *
 * OAuth flow: Authorization Code; tokens via /v1.3/oauth2/access_token/ (short-lived)
 * and refreshed via /v1.3/oauth2/refresh_token/; long-term tokens also supported.
 *
 * Key permission scopes (hierarchical three-level tree):
 *   Scope 10  — Ad Account Info (read)
 *   Scope 20  — Campaign read/write
 *   Scope 21  — Ad Group read/write
 *   Scope 22  — Ad read/write
 *   Plus scopes for Reports, Custom Audiences, Creative
 *
 * Access tiers (rate limits per endpoint):
 *   Basic:    10 QPS / 600 QPM / 864K QPD
 *   Advanced: 20 QPS / 1200 QPM / 1.7M QPD
 *   Premium:  30 QPS / 1800 QPM / 2.6M QPD
 *   Ultimate: 50 QPS / 3000 QPM / 4.3M QPD
 *
 * Base URL: https://business-api.tiktok.com/open_api/v1.3/
 *
 * Once approved:
 *   Account discovery:  GET /open_api/v1.3/oauth2/advertiser/get/
 *   Campaign reads:     GET /open_api/v1.3/campaign/get/
 *   Metrics/reporting:  GET /open_api/v1.3/report/integrated/get/
 *   Campaign mutations: POST /open_api/v1.3/campaign/create/, /campaign/update/, /campaign/status/update/
 *   Pagination:         page + page_size offset-based
 *   Webhooks:           Available for lead updates, ad review status changes
 *   Sandbox:            Dedicated sandbox environment (1 QPS / 30 QPM / 1000 QPD)
 *
 * App review by TikTok required; Business Center account required for production access.
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
