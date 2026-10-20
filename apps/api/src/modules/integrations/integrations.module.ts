import { Module } from '@nestjs/common';
import { MarketplaceService } from './marketplace.service';
import { ExternalConnectionsService } from './external-connections.service';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsOAuthController } from './integrations-oauth.controller';
import { ExternalProviderFactory } from './providers/external-provider.factory';
import { GoogleExternalProvider } from './providers/google.provider';
import { MetaExternalProvider } from './providers/meta.provider';
import { TikTokExternalProvider } from './providers/tiktok.provider';
import { ShopifyExternalProvider } from './providers/shopify.provider';

@Module({
  providers: [
    MarketplaceService,
    ExternalConnectionsService,
    ExternalProviderFactory,
    GoogleExternalProvider,
    MetaExternalProvider,
    TikTokExternalProvider,
    ShopifyExternalProvider,
  ],
  controllers: [IntegrationsController, IntegrationsOAuthController],
  exports: [MarketplaceService, ExternalConnectionsService],
})
export class IntegrationsModule {}
