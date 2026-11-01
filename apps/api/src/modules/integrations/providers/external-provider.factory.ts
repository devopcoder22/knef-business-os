import { Injectable, BadRequestException } from '@nestjs/common';
import { GoogleExternalProvider } from './google.provider';
import { MetaExternalProvider } from './meta.provider';
import { TikTokExternalProvider } from './tiktok.provider';
import { ShopifyExternalProvider } from './shopify.provider';
import type { ExternalProviderInterface } from './external-provider.interface';

export const SUPPORTED_PROVIDERS = ['google', 'meta', 'tiktok', 'shopify'] as const;
export type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number];

@Injectable()
export class ExternalProviderFactory {
  private readonly registry: Map<string, ExternalProviderInterface>;

  constructor(
    private readonly google: GoogleExternalProvider,
    private readonly meta: MetaExternalProvider,
    private readonly tiktok: TikTokExternalProvider,
    private readonly shopify: ShopifyExternalProvider,
  ) {
    this.registry = new Map<string, ExternalProviderInterface>([
      ['google', this.google],
      ['meta', this.meta],
      ['tiktok', this.tiktok],
      ['shopify', this.shopify],
    ]);
  }

  getProvider(provider: string): ExternalProviderInterface {
    const impl = this.registry.get(provider);
    if (!impl) throw new BadRequestException(`Unsupported integration provider: ${provider}`);
    return impl;
  }

  isSupported(provider: string): boolean {
    return this.registry.has(provider);
  }

  listProviders(): string[] {
    return [...this.registry.keys()];
  }
}
