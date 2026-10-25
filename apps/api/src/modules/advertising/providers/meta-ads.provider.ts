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
 * Meta Marketing API v26.0 — FOUNDATION ONLY — MARKETING API ACCESS REQUIRED
 *
 * NOTE: v21.0 expired September 2025. Current stable version is v26.0 (Graph API v26.0).
 *
 * Required OAuth scopes (separate from Stage 24E social publishing scopes):
 *   ads_read        — read ad account data and Insights API (read-only)
 *   ads_management  — create/manage campaigns, ad sets, ads, budgets (write)
 *   business_management — business asset access
 *
 * Access tiers:
 *   Development:   300 calls/hr/account (limited, no App Review required for testing)
 *   Full Access:   100,000 calls/hr/account + 40×active ads (requires App Review + Business Verification)
 *
 * Once approved:
 *   Account discovery:  GET /v26.0/me/adaccounts
 *   Campaign reads:     GET /v26.0/act_{id}/campaigns, /adsets, /ads
 *   Metrics/reporting:  GET /v26.0/{object-id}/insights (flexible breakdowns, date ranges)
 *   Campaign mutations: POST /v26.0/act_{id}/campaigns; POST /v26.0/{campaign-id} (update status/budget)
 *   Rate limits:        Read=1pt, Write=3pts per BUC score; Dev tier max 60pts/300s; 100 req/s hard cap
 *   Pagination:         Cursor-based (before/after cursors in paging object)
 *   Webhooks:           Available for ad account status changes and Lead Ads
 *   Test accounts:      Test ad accounts available in Meta Business Suite (no ad serving)
 *
 * App Review application required for ads_management:
 *   https://developers.facebook.com/docs/marketing-api/overview/permission-requirements
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
