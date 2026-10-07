import { Module } from '@nestjs/common';
import { MarketplaceService } from './marketplace.service';
import { IntegrationsController } from './integrations.controller';

@Module({
  providers: [MarketplaceService],
  controllers: [IntegrationsController],
  exports: [MarketplaceService],
})
export class IntegrationsModule {}
