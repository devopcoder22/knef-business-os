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
 * Google Ads API v18 — FOUNDATION ONLY
 *
 * Requires a separate developer token approval process from Google, distinct from
 * the standard OAuth token. The developer token must be approved via:
 *   https://developers.google.com/google-ads/api/docs/first-call/dev-token
 *
 * OAuth scope required: https://www.googleapis.com/auth/adwords
 *
 * Once the developer token is approved:
 * - API calls use GAQL (Google Ads Query Language) via GoogleAdsService.Search()
 * - Base endpoint: https://googleads.googleapis.com/v18/customers/{customerId}/googleAds:search
 * - Customer list: https://googleads.googleapis.com/v18/customers:listAccessibleCustomers
 *
 * Status: FOUNDATION ONLY — pending Google developer token approval
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
