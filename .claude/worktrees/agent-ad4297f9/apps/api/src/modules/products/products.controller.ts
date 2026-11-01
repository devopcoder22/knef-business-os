import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ProductStatus } from '@prisma/client';
import { ProductsService } from './products.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@knef/constants';
import type { AuthUser } from '@knef/types';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ListProductsDto } from './dto/list-products.dto';
import { CreateProductVariantDto } from './dto/create-product-variant.dto';
import { UpdateProductVariantDto } from './dto/update-product-variant.dto';
import { AddProductImageDto } from './dto/add-product-image.dto';

@ApiTags('products')
@ApiBearerAuth('JWT')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get('low-stock')
  @Permissions(PERMISSIONS.INVENTORY.VIEW)
  @ApiOperation({ summary: 'List products below low stock threshold' })
  getLowStock(
    @CurrentUser() user: AuthUser,
    @Query('locationId') locationId?: string,
  ) {
    return this.productsService.getLowStockProducts(user.organizationId, locationId);
  }

  @Get()
  @Permissions(PERMISSIONS.PRODUCTS.VIEW)
  @ApiOperation({ summary: 'List products (paginated + filterable)' })
  findAll(@CurrentUser() user: AuthUser, @Query() query: ListProductsDto) {
    return this.productsService.findAll(user.organizationId, query);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.PRODUCTS.VIEW)
  @ApiOperation({ summary: 'Get product detail with variants, images, inventory' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.productsService.findOne(user.organizationId, id);
  }

  @Post()
  @Permissions(PERMISSIONS.PRODUCTS.CREATE)
  @ApiOperation({ summary: 'Create a product' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateProductDto) {
    return this.productsService.create(user.organizationId, dto, user.id);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.PRODUCTS.EDIT)
  @ApiOperation({ summary: 'Update a product' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(user.organizationId, id, dto, user.id);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.PRODUCTS.DELETE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete a product' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.productsService.softDelete(user.organizationId, id, user.id);
  }

  @Patch(':id/status')
  @Permissions(PERMISSIONS.PRODUCTS.EDIT)
  @ApiOperation({ summary: 'Change product status' })
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { status: ProductStatus },
  ) {
    return this.productsService.updateStatus(user.organizationId, id, body.status, user.id);
  }

  // ── Variants ──────────────────────────────────────────────────

  @Get(':id/variants')
  @Permissions(PERMISSIONS.PRODUCTS.VIEW)
  @ApiOperation({ summary: 'List product variants' })
  getVariants(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.productsService.getVariants(user.organizationId, id);
  }

  @Post(':id/variants')
  @Permissions(PERMISSIONS.PRODUCTS.EDIT)
  @ApiOperation({ summary: 'Add a variant to a product' })
  addVariant(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateProductVariantDto,
  ) {
    return this.productsService.addVariant(user.organizationId, id, dto, user.id);
  }

  @Patch(':id/variants/:variantId')
  @Permissions(PERMISSIONS.PRODUCTS.EDIT)
  @ApiOperation({ summary: 'Update a product variant' })
  updateVariant(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('variantId') variantId: string,
    @Body() dto: UpdateProductVariantDto,
  ) {
    return this.productsService.updateVariant(user.organizationId, id, variantId, dto, user.id);
  }

  @Delete(':id/variants/:variantId')
  @Permissions(PERMISSIONS.PRODUCTS.EDIT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate a product variant' })
  removeVariant(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('variantId') variantId: string,
  ) {
    return this.productsService.removeVariant(user.organizationId, id, variantId);
  }

  // ── Images ────────────────────────────────────────────────────

  @Get(':id/images')
  @Permissions(PERMISSIONS.PRODUCTS.VIEW)
  @ApiOperation({ summary: 'Get product images' })
  getImages(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.productsService.getImages(user.organizationId, id);
  }

  @Post(':id/images')
  @Permissions(PERMISSIONS.PRODUCTS.EDIT)
  @ApiOperation({ summary: 'Add an image to a product' })
  addImage(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AddProductImageDto,
  ) {
    return this.productsService.addImage(user.organizationId, id, dto);
  }

  @Delete(':id/images/:imageId')
  @Permissions(PERMISSIONS.PRODUCTS.EDIT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a product image' })
  removeImage(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('imageId') imageId: string,
  ) {
    return this.productsService.removeImage(user.organizationId, id, imageId);
  }

  // ── Inventory ─────────────────────────────────────────────────

  @Get(':id/inventory')
  @Permissions(PERMISSIONS.INVENTORY.VIEW)
  @ApiOperation({ summary: 'Get inventory levels per location for a product' })
  getInventory(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.productsService.getInventorySummary(user.organizationId, id);
  }
}
