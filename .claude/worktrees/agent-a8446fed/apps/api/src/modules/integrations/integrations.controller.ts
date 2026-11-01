import {
  Controller,
  Get,
  Post,
  Body,
  Param,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { MarketplaceService, MarketplaceProvider } from './marketplace.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@knef/constants';
import type { AuthUser } from '@knef/types';

class ConfigureProviderDto {
  @IsString()
  apiKey!: string;

  @IsString()
  secretKey!: string;

  @IsString()
  sellerId!: string;
}

@ApiTags('integrations')
@ApiBearerAuth('JWT')
@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly marketplaceService: MarketplaceService) {}

  @Get('marketplace/status')
  @Permissions(PERMISSIONS.SETTINGS.MANAGE_INTEGRATIONS)
  @ApiOperation({ summary: 'Get marketplace integration status' })
  getStatus(@CurrentUser() user: AuthUser) {
    return this.marketplaceService.getStatus(user.organizationId);
  }

  @Post('marketplace/:provider/configure')
  @Permissions(PERMISSIONS.SETTINGS.MANAGE_INTEGRATIONS)
  @ApiOperation({ summary: 'Configure marketplace credentials' })
  configure(
    @CurrentUser() user: AuthUser,
    @Param('provider') provider: string,
    @Body() dto: ConfigureProviderDto,
  ) {
    return this.marketplaceService.configureProvider(
      user.organizationId,
      provider as MarketplaceProvider,
      dto,
      user.id,
    );
  }

  @Post('marketplace/:provider/sync-products')
  @Permissions(PERMISSIONS.SETTINGS.MANAGE_INTEGRATIONS)
  @ApiOperation({ summary: 'Sync products to marketplace' })
  syncProducts(
    @CurrentUser() user: AuthUser,
    @Param('provider') provider: string,
  ) {
    return this.marketplaceService.syncProducts(
      user.organizationId,
      provider as MarketplaceProvider,
    );
  }

  @Get('marketplace/:provider/orders')
  @Permissions(PERMISSIONS.SALES.CREATE)
  @ApiOperation({ summary: 'Fetch marketplace orders' })
  fetchOrders(
    @CurrentUser() user: AuthUser,
    @Param('provider') provider: string,
  ) {
    return this.marketplaceService.fetchOrders(
      user.organizationId,
      provider as MarketplaceProvider,
    );
  }
}
