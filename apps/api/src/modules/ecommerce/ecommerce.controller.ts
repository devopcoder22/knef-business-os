import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiSecurity } from '@nestjs/swagger';
import { Request } from 'express';
import { EcommerceService } from './ecommerce.service';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { ApiKeyScopeGuard } from '../../common/guards/api-key-scope.guard';
import { RequireApiScope } from '../../common/decorators/require-api-scope.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { PERMISSIONS } from '@knef/constants';
import type { AuthUser } from '@knef/types';
import type { PublicProductsQueryDto } from './dto/public-products-query.dto';
import { CreatePublicOrderDto } from './dto/create-public-order.dto';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import type { ListEcommerceOrdersDto } from './dto/list-ecommerce-orders.dto';

// Extended request with API key context
interface ApiKeyRequest extends Request {
  organizationId: string;
}

// ─── Public E-commerce endpoints (API key authenticated) ──────────────────────

@ApiTags('ecommerce-public')
@ApiSecurity('x-api-key')
@Public() // JWT guard skips this controller; ApiKeyGuard handles auth
@UseGuards(ApiKeyGuard, ApiKeyScopeGuard)
@Controller('ecommerce/public')
export class EcommercePublicController {
  constructor(private readonly ecommerceService: EcommerceService) {}

  @Get('products')
  @RequireApiScope('products:read')
  @ApiOperation({ summary: 'List active products (public)' })
  getProducts(
    @Req() req: ApiKeyRequest,
    @Query() query: PublicProductsQueryDto,
  ) {
    return this.ecommerceService.getPublicProducts(req.organizationId, query);
  }

  @Get('products/:id')
  @RequireApiScope('products:read')
  @ApiOperation({ summary: 'Get a single active product (public)' })
  getProduct(
    @Req() req: ApiKeyRequest,
    @Param('id') id: string,
  ) {
    return this.ecommerceService.getPublicProduct(req.organizationId, id);
  }

  @Get('categories')
  @RequireApiScope('products:read')
  @ApiOperation({ summary: 'Get category tree (public)' })
  getCategories(@Req() req: ApiKeyRequest) {
    return this.ecommerceService.getPublicCategories(req.organizationId);
  }

  @Get('search')
  @RequireApiScope('products:read')
  @ApiOperation({ summary: 'Full-text product search (public)' })
  searchProducts(
    @Req() req: ApiKeyRequest,
    @Query('q') q: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.ecommerceService.searchPublicProducts(
      req.organizationId,
      q ?? '',
      parseInt(page ?? '1', 10),
      Math.min(parseInt(limit ?? '20', 10), 100),
    );
  }

  @Post('orders')
  @RequireApiScope('sales:write')
  @ApiOperation({ summary: 'Create online order (public)' })
  createOrder(
    @Req() req: ApiKeyRequest,
    @Body() dto: CreatePublicOrderDto,
  ) {
    return this.ecommerceService.createPublicOrder(req.organizationId, dto);
  }

  @Get('orders/:reference')
  @RequireApiScope('sales:read')
  @ApiOperation({ summary: 'Get order status (public, email verification)' })
  getOrder(
    @Req() req: ApiKeyRequest,
    @Param('reference') reference: string,
    @Query('email') email: string,
  ) {
    return this.ecommerceService.getPublicOrder(req.organizationId, reference, email);
  }

  @Get('inventory')
  @RequireApiScope('inventory:read')
  @ApiOperation({ summary: 'Get inventory levels (public)' })
  getInventory(
    @Req() req: ApiKeyRequest,
    @Query('productIds') productIds?: string,
    @Query('locationId') locationId?: string,
  ) {
    return this.ecommerceService.getPublicInventory(req.organizationId, productIds, locationId);
  }
}

// ─── Internal E-commerce management endpoints (JWT authenticated) ─────────────

@ApiTags('ecommerce')
@ApiBearerAuth('JWT')
@Controller('ecommerce')
export class EcommerceManagementController {
  constructor(private readonly ecommerceService: EcommerceService) {}

  @Get('orders')
  @Permissions(PERMISSIONS.SALES.VIEW)
  @ApiOperation({ summary: 'List online orders' })
  listOrders(
    @CurrentUser() user: AuthUser,
    @Query() query: ListEcommerceOrdersDto,
  ) {
    return this.ecommerceService.listOnlineOrders(user.organizationId, query);
  }

  @Post('orders/:id/fulfill')
  @Permissions(PERMISSIONS.SALES.MANAGE)
  @ApiOperation({ summary: 'Fulfill a confirmed online order' })
  fulfillOrder(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.ecommerceService.fulfillOnlineOrder(user.organizationId, id, user.id);
  }

  @Get('api-keys')
  @Permissions(PERMISSIONS.SETTINGS.MANAGE_INTEGRATIONS)
  @ApiOperation({ summary: 'List organization API keys' })
  listApiKeys(@CurrentUser() user: AuthUser) {
    return this.ecommerceService.listApiKeys(user.organizationId);
  }

  @Post('api-keys')
  @Permissions(PERMISSIONS.SETTINGS.MANAGE_INTEGRATIONS)
  @ApiOperation({ summary: 'Create a new API key' })
  createApiKey(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateApiKeyDto,
  ) {
    return this.ecommerceService.createApiKey(user.organizationId, dto, user.id);
  }

  @Delete('api-keys/:id')
  @Permissions(PERMISSIONS.SETTINGS.MANAGE_INTEGRATIONS)
  @ApiOperation({ summary: 'Revoke an API key' })
  revokeApiKey(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.ecommerceService.revokeApiKey(user.organizationId, id);
  }
}
