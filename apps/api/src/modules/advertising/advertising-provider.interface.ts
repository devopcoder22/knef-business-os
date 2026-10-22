export interface IAdvertisingProvider {
  readonly provider: string;
  discoverAccounts(connection: { accessToken: string; metadata?: Record<string, unknown> }): Promise<DiscoveredAccount[]>;
  syncCampaigns(account: { providerAccountId: string; accessToken: string }): Promise<RawCampaign[]>;
  syncAdGroups(account: { providerAccountId: string; accessToken: string }, campaignId: string): Promise<RawAdGroup[]>;
  syncAds(account: { providerAccountId: string; accessToken: string }, adGroupId: string): Promise<RawAd[]>;
  getMetrics(account: { providerAccountId: string; accessToken: string }, params: MetricsParams): Promise<RawMetric[]>;
}

export interface DiscoveredAccount {
  providerAccountId: string;
  displayName: string;
  currency: string;
  timezone: string;
  accountStatus: string;
}

export interface RawCampaign {
  providerCampaignId: string;
  name: string;
  status: string;
  objective?: string;
  budgetType?: string;
  budgetAmountMicros?: bigint;
  currency?: string;
  startDate?: Date;
  endDate?: Date;
  providerStatus?: string;
  rawMeta?: Record<string, unknown>;
}

export interface RawAdGroup {
  providerAdGroupId: string;
  name: string;
  status: string;
  bidAmountMicros?: bigint;
  rawMeta?: Record<string, unknown>;
}

export interface RawAd {
  providerAdId: string;
  name?: string;
  status: string;
  rawMeta?: Record<string, unknown>;
}

export interface RawMetric {
  date: string;
  impressions: number;
  clicks: number;
  spend: number;
  currency: string;
  conversions?: number;
  conversionValue?: number;
  reach?: number;
}

export interface MetricsParams {
  fromDate: string;
  toDate: string;
  campaignId?: string;
}
