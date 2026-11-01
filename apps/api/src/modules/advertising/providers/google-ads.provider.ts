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
 * Google Ads API v26 — FOUNDATION ONLY — DEVELOPER ACCESS REQUIRED
 *
 * As of September 2026, the separate developer token requirement was sunset.
 * Access is now managed per Google Cloud project with three tiers:
 *   Test Account Access: 15,000 ops/day (test accounts only)
 *   Basic Access:        15,000 ops/day (production, auto-granted to GCP projects)
 *   Standard Access:     Unlimited ops/day (requires Google review application)
 *
 * OAuth scope (single scope for all operations):
 *   https://www.googleapis.com/auth/adwords
 *
 * Once access is provisioned:
 *   Account discovery:  CustomerService.listAccessibleCustomers
 *   Campaign reads:     GoogleAdsService.Search/SearchStream with GAQL
 *   Metrics/reporting:  GoogleAdsService.Search with date ranges and segmentation
 *   Campaign mutations: CampaignService.MutateCampaigns, GoogleAdsService.Mutate
 *   Budget mutations:   CampaignBudgetService.MutateCampaignBudgets
 *   Rate limits:        Token bucket per customer ID + per GCP project (QPS + ops/min)
 *   Pagination:         10,000 rows/page (Search); SearchStream for unbounded results
 *   Webhooks:           Lead Forms only; campaign/metrics require polling
 *   Sandbox:            Dedicated test manager account hierarchy (no billing/serving)
 *
 * Standard Access application: https://developers.google.com/google-ads/api/docs/api-policy/access-levels
 */
@Injectable()
export class GoogleAdsProvider implements IAdvertisingProvider {
  readonly provider = 'GOOGLE_ADS';

  async discoverAccounts(
    _connection: { accessToken: string; metadata?: Record<string, unknown> },
  ): Promise<DiscoveredAccount[]> {
    throw new NotImplementedException(
      'Google Ads: developer token approval required before this provider can be used. ' +
      'Apply at https://developers.google.com/google-ads/api/docs/first-call/dev-token',
    );
  }

  async syncCampaigns(
    _account: { providerAccountId: string; accessToken: string },
  ): Promise<RawCampaign[]> {
    throw new NotImplementedException(
      'Google Ads: developer token approval required before this provider can be used.',
    );
  }

  async syncAdGroups(
    _account: { providerAccountId: string; accessToken: string },
    _campaignId: string,
  ): Promise<RawAdGroup[]> {
    throw new NotImplementedException(
      'Google Ads: developer token approval required before this provider can be used.',
    );
  }

  async syncAds(
    _account: { providerAccountId: string; accessToken: string },
    _adGroupId: string,
  ): Promise<RawAd[]> {
    throw new NotImplementedException(
      'Google Ads: developer token approval required before this provider can be used.',
    );
  }

  async getMetrics(
    _account: { providerAccountId: string; accessToken: string },
    _params: MetricsParams,
  ): Promise<RawMetric[]> {
    throw new NotImplementedException(
      'Google Ads: developer token approval required before this provider can be used.',
    );
  }
}
