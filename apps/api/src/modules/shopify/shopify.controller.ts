import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@knef/constants';
import { ShopifyConnectionService } from './shopify-connection.service';
import { ShopifyProductSyncService } from './shopify-product-sync.service';
import { ShopifyInventorySyncService } from './shopify-inventory-sync.service';
import { ShopifyOrderImportService } from './shopify-order-import.service';
import { ShopifyWebhookService } from './shopify-webhook.service';
import { ShopifyReconciliationService } from './shopify-reconciliation.service';
import { IsString } from 'class-validator';

interface AuthUser {
  userId: string;
  sub: string;
  organizationId: string;
}

class CreateLocationMappingDto {
  @IsString() locationId!: string;
  @IsString() shopifyLocationId!: string;
}

@ApiTags('shopify')
@ApiBearerAuth('JWT')
@Controller('shopify')
export class ShopifyController {
  constructor(
    private readonly connectionService: ShopifyConnectionService,
    private readonly productSyncService: ShopifyProductSyncService,
    private readonly inventorySyncService: ShopifyInventorySyncService,
    private readonly orderImportService: ShopifyOrderImportService,
    private readonly webhookService: ShopifyWebhookService,
    private readonly reconciliationService: ShopifyReconciliationService,
  ) {}

  private getOrg(req: Request): string {
    return (req.user as AuthUser).organizationId;
  }

  // GET /shopify/connections/:connectionId/overview
  @Get('connections/:connectionId/overview')
  @Permissions(PERMISSIONS.SHOPIFY.VIEW)
  async getOverview(@Param('connectionId') connectionId: string, @Req() req: Request) {
    const organizationId = this.getOrg(req);
    return this.connectionService.getOverview(organizationId, connectionId);
  }

  // GET /shopify/connections/:connectionId/shop
  @Get('connections/:connectionId/shop')
  @Permissions(PERMISSIONS.SHOPIFY.VIEW)
  async getShopInfo(@Param('connectionId') connectionId: string, @Req() req: Request) {
    const organizationId = this.getOrg(req);
    return this.connectionService.getShopInfo(organizationId, connectionId);
  }

  // POST /shopify/connections/:connectionId/health-check
  @Post('connections/:connectionId/health-check')
  @HttpCode(HttpStatus.OK)
  @Permissions(PERMISSIONS.SHOPIFY.MANAGE)
  async healthCheck(@Param('connectionId') connectionId: string, @Req() req: Request) {
    const organizationId = this.getOrg(req);
    return this.connectionService.healthCheck(organizationId, connectionId);
  }

  // GET /shopify/connections/:connectionId/products/mappings
  @Get('connections/:connectionId/products/mappings')
  @Permissions(PERMISSIONS.SHOPIFY.VIEW)
  async getMappings(
    @Param('connectionId') connectionId: string,
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Req() req: Request,
  ) {
    const organizationId = this.getOrg(req);
    return this.productSyncService.getMappings(organizationId, connectionId, page, limit);
  }

  // POST /shopify/connections/:connectionId/products/:productId/publish
  @Post('connections/:connectionId/products/:productId/publish')
  @HttpCode(HttpStatus.OK)
  @Permissions(PERMISSIONS.SHOPIFY.SYNC_PRODUCTS)
  async publishProduct(
    @Param('connectionId') connectionId: string,
    @Param('productId') productId: string,
    @Req() req: Request,
  ) {
    const organizationId = this.getOrg(req);
    await this.productSyncService.publishProduct(organizationId, connectionId, productId);
    return { message: 'Product published to Shopify' };
  }

  // POST /shopify/connections/:connectionId/products/:productId/sync
  @Post('connections/:connectionId/products/:productId/sync')
  @HttpCode(HttpStatus.OK)
  @Permissions(PERMISSIONS.SHOPIFY.SYNC_PRODUCTS)
  async syncProduct(
    @Param('connectionId') connectionId: string,
    @Param('productId') productId: string,
    @Req() req: Request,
  ) {
    const organizationId = this.getOrg(req);
    await this.productSyncService.syncProduct(organizationId, connectionId, productId);
    return { message: 'Product synced to Shopify' };
  }

  // DELETE /shopify/connections/:connectionId/products/:productId/mapping
  @Delete('connections/:connectionId/products/:productId/mapping')
  @Permissions(PERMISSIONS.SHOPIFY.MANAGE)
  async deleteMapping(
    @Param('connectionId') connectionId: string,
    @Param('productId') productId: string,
    @Req() req: Request,
  ) {
    const organizationId = this.getOrg(req);
    await this.productSyncService.deleteMapping(organizationId, connectionId, productId);
    return { message: 'Mapping deleted' };
  }

  // GET /shopify/connections/:connectionId/locations/shopify
  @Get('connections/:connectionId/locations/shopify')
  @Permissions(PERMISSIONS.SHOPIFY.VIEW)
  async getShopifyLocations(@Param('connectionId') connectionId: string, @Req() req: Request) {
    const organizationId = this.getOrg(req);
    return this.inventorySyncService.getShopifyLocations(organizationId, connectionId);
  }

  // GET /shopify/connections/:connectionId/locations/mappings
  @Get('connections/:connectionId/locations/mappings')
  @Permissions(PERMISSIONS.SHOPIFY.VIEW)
  async getLocationMappings(@Param('connectionId') connectionId: string, @Req() req: Request) {
    const organizationId = this.getOrg(req);
    return this.inventorySyncService.getLocationMappings(organizationId, connectionId);
  }

  // POST /shopify/connections/:connectionId/locations/mappings
  @Post('connections/:connectionId/locations/mappings')
  @Permissions(PERMISSIONS.SHOPIFY.SYNC_INVENTORY)
  async createLocationMapping(
    @Param('connectionId') connectionId: string,
    @Body() body: CreateLocationMappingDto,
    @Req() req: Request,
  ) {
    const organizationId = this.getOrg(req);
    return this.inventorySyncService.createLocationMapping(
      organizationId,
      connectionId,
      body.locationId,
      body.shopifyLocationId,
    );
  }

  // DELETE /shopify/connections/:connectionId/locations/mappings/:mappingId
  @Delete('connections/:connectionId/locations/mappings/:mappingId')
  @Permissions(PERMISSIONS.SHOPIFY.SYNC_INVENTORY)
  async deleteLocationMapping(
    @Param('connectionId') connectionId: string,
    @Param('mappingId') mappingId: string,
    @Req() req: Request,
  ) {
    const organizationId = this.getOrg(req);
    await this.inventorySyncService.deleteLocationMapping(organizationId, connectionId, mappingId);
    return { message: 'Location mapping deleted' };
  }

  // GET /shopify/connections/:connectionId/inventory/reconciliation
  @Get('connections/:connectionId/inventory/reconciliation')
  @Permissions(PERMISSIONS.SHOPIFY.VIEW)
  async getInventoryReconciliation(
    @Param('connectionId') connectionId: string,
    @Req() req: Request,
  ) {
    const organizationId = this.getOrg(req);
    return this.inventorySyncService.getInventoryReconciliation(organizationId, connectionId);
  }

  // POST /shopify/connections/:connectionId/inventory/sync
  @Post('connections/:connectionId/inventory/sync')
  @HttpCode(HttpStatus.OK)
  @Permissions(PERMISSIONS.SHOPIFY.SYNC_INVENTORY)
  async syncInventory(
    @Param('connectionId') connectionId: string,
    @Body() body: { productId?: string; variantId?: string },
    @Req() req: Request,
  ) {
    const organizationId = this.getOrg(req);
    if (body.productId) {
      await this.inventorySyncService.syncInventoryForProduct(
        organizationId,
        connectionId,
        body.productId,
        body.variantId,
      );
    }
    return { message: 'Inventory sync initiated' };
  }

  // GET /shopify/connections/:connectionId/orders
  @Get('connections/:connectionId/orders')
  @Permissions(PERMISSIONS.SHOPIFY.MANAGE_ORDERS)
  async getOrders(
    @Param('connectionId') connectionId: string,
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Req() req: Request,
  ) {
    const organizationId = this.getOrg(req);
    return this.orderImportService.getImportedOrders(organizationId, connectionId, page, limit);
  }

  // POST /shopify/connections/:connectionId/reconcile
  @Post('connections/:connectionId/reconcile')
  @HttpCode(HttpStatus.OK)
  @Permissions(PERMISSIONS.SHOPIFY.MANAGE)
  async reconcile(@Param('connectionId') connectionId: string, @Req() req: Request) {
    const organizationId = this.getOrg(req);
    return this.reconciliationService.reconcileAll(organizationId, connectionId);
  }

  // POST /shopify/connections/:connectionId/webhooks/register
  @Post('connections/:connectionId/webhooks/register')
  @HttpCode(HttpStatus.OK)
  @Permissions(PERMISSIONS.SHOPIFY.MANAGE)
  async registerWebhooks(@Param('connectionId') connectionId: string, @Req() req: Request) {
    const organizationId = this.getOrg(req);
    return this.webhookService.registerWebhooks(organizationId, connectionId);
  }
}
