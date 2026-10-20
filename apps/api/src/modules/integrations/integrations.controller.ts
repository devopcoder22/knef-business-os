import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { MarketplaceService, MarketplaceProvider } from './marketplace.service';
import { ExternalConnectionsService } from './external-connections.service';
import { InitiateOAuthDto, DisconnectConnectionDto } from './dto/external-connection.dto';
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
  constructor(
    private readonly marketplaceService: MarketplaceService,
    private readonly connections: ExternalConnectionsService,
  ) {}

  // ── Marketplace (existing) ─────────────────────────────────────────────────

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

  // ── External connections (OAuth providers) ─────────────────────────────────

  @Get('providers')
  @Permissions(PERMISSIONS.INTEGRATIONS.VIEW)
  @ApiOperation({ summary: 'List supported OAuth providers' })
  listProviders() {
    return this.connections.listProviders();
  }

  @Get('connections')
  @Permissions(PERMISSIONS.INTEGRATIONS.VIEW)
  @ApiOperation({ summary: 'List all external connections for the organization' })
  listConnections(@CurrentUser() user: AuthUser) {
    return this.connections.listConnections(user.organizationId);
  }

  @Get('connections/:id')
  @Permissions(PERMISSIONS.INTEGRATIONS.VIEW)
  @ApiOperation({ summary: 'Get a single external connection' })
  getConnection(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.connections.getConnection(user.organizationId, id);
  }

  @Post('connections/oauth/initiate')
  @Permissions(PERMISSIONS.INTEGRATIONS.MANAGE)
  @ApiOperation({ summary: 'Start OAuth flow for a provider' })
  initiateOAuth(@CurrentUser() user: AuthUser, @Body() dto: InitiateOAuthDto) {
    return this.connections.initiateOAuth(user.id, user.organizationId, dto);
  }

  @Delete('connections/:id')
  @Permissions(PERMISSIONS.INTEGRATIONS.MANAGE)
  @ApiOperation({ summary: 'Disconnect an external integration' })
  disconnect(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: DisconnectConnectionDto,
    @Query('revoke') revoke?: string,
  ) {
    const revokeAtProvider = dto.revokeAtProvider ?? revoke === 'true';
    return this.connections.disconnect(user.organizationId, user.id, id, revokeAtProvider);
  }

  @Post('connections/:id/health-check')
  @Permissions(PERMISSIONS.INTEGRATIONS.MANAGE)
  @ApiOperation({ summary: 'Run a health check on an external connection' })
  healthCheck(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.connections.runHealthCheck(id);
  }
}
