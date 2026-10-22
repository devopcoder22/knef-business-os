import { Injectable } from '@nestjs/common';
import { GoogleAdsProvider } from './providers/google-ads.provider';
import { MetaAdsProvider } from './providers/meta-ads.provider';
import { TikTokAdsProvider } from './providers/tiktok-ads.provider';
import type { IAdvertisingProvider } from './advertising-provider.interface';

@Injectable()
export class AdvertisingProviderFactory {
  constructor(
    private readonly google: GoogleAdsProvider,
    private readonly meta: MetaAdsProvider,
    private readonly tiktok: TikTokAdsProvider,
  ) {}

  get(provider: string): IAdvertisingProvider {
    switch (provider) {
      case 'GOOGLE_ADS': return this.google;
      case 'META': return this.meta;
      case 'TIKTOK': return this.tiktok;
      default: throw new Error(`Unknown advertising provider: ${provider}`);
    }
  }
}
