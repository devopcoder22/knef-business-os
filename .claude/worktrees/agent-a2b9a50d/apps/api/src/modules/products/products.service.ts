import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { ProductStatus } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { CreateProductDto } from './dto/create-product.dto';
import type { UpdateProductDto } from './dto/update-product.dto';
import type { ListProductsDto } from './dto/list-products.dto';
import type { CreateProductVariantDto } from './dto/create-product-variant.dto';
import type { UpdateProductVariantDto } from './dto/update-product-variant.dto';
import type { AddProductImageDto } from './dto/add-product-image.dto';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-')
    .replace(/^-+|-+$/g, '');
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async findAll(organizationId: string, query: ListProductsDto) {
    const { page = 1, limit = 20, search, categoryId, brandId, status, locationId } = query;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {
      organizationId,
    };
    if (categoryId) where['categoryId'] = categoryId;
    if (brandId) where['brandId'] = brandId;
    if (status) where['status'] = status;
    if (search) {
      where['OR'] = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
        { barcode: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          sku: true,
          barcode: true,
          costPrice: true,
          sellingPrice: true,
          status: true,
          isSerialized: true,
          hasVariants: true,
          trackInventory: true,
          lowStockAlert: true,
          createdAt: true,
          updatedAt: true,
          category: { select: { id: true, name: true } },
          brand: { select: { id: true, name: true } },
          images: {
            where: { isPrimary: true },
            select: { url: true, altText: true },
            take: 1,
          },
          inventoryLevels: locationId
            ? { where: { locationId }, select: { quantity: true, reserved: true, locationId: true } }
            : { select: { quantity: true, reserved: true, locationId: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      data: products,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(organizationId: string, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, organizationId },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        brand: { select: { id: true, name: true, logoUrl: true } },
        taxRate: { select: { id: true, name: true, rate: true } },
        variants: {
          where: { isActive: true },
          orderBy: { createdAt: 'asc' },
        },
        images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }] },
        inventoryLevels: {
          include: {
            location: { select: { id: true, name: true, code: true } },
          },
        },
      },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async create(organizationId: string, dto: CreateProductDto, userId: string) {
    // Check SKU uniqueness
    const existing = await this.prisma.product.findFirst({
      where: { organizationId, sku: dto.sku },
    });
    if (existing) {
      throw new ConflictException(`SKU '${dto.sku}' already exists in this organization`);
    }

    const slug = await this.generateUniqueSlug(organizationId, dto.name);

    // Validate category and brand if provided
    if (dto.categoryId) {
      const cat = await this.prisma.category.findFirst({
        where: { id: dto.categoryId, organizationId },
      });
      if (!cat) throw new NotFoundException('Category not found');
    }
    if (dto.brandId) {
      const brand = await this.prisma.brand.findFirst({
        where: { id: dto.brandId, organizationId },
      });
      if (!brand) throw new NotFoundException('Brand not found');
    }

    const product = await this.prisma.product.create({
      data: {
        id: createId(),
        organizationId,
        name: dto.name,
        slug,
        sku: dto.sku,
        barcode: dto.barcode,
        gtin: dto.gtin,
        categoryId: dto.categoryId,
        brandId: dto.brandId,
        description: dto.description,
        shortDesc: dto.shortDesc,
        costPrice: dto.costPrice,
        sellingPrice: dto.sellingPrice,
        comparePrice: dto.comparePrice,
        taxRateId: dto.taxRateId,
        isSerialized: dto.isSerialized ?? false,
        hasVariants: dto.hasVariants ?? false,
        trackInventory: dto.trackInventory ?? true,
        lowStockAlert: dto.lowStockAlert ?? 5,
        weight: dto.weight,
        weightUnit: dto.weightUnit ?? 'kg',
        status: dto.status ?? ProductStatus.ACTIVE,
        metaTitle: dto.metaTitle,
        metaDesc: dto.metaDesc,
      },
    });

    // Create inventory levels for all org locations
    await this.createInventoryLevelsForAllLocations(organizationId, product.id);

    // Update search vector
    await this.updateSearchVector(product.id);

    await this.auditService.log({
      organizationId,
      userId,
      action: 'PRODUCT_CREATED',
      entity: 'Product',
      entityId: product.id,
      newValues: { name: product.name, sku: product.sku },
    });

    return product;
  }

  async update(
    organizationId: string,
    id: string,
    dto: UpdateProductDto,
    userId: string,
  ) {
    const product = await this.prisma.product.findFirst({
      where: { id, organizationId },
    });
    if (!product) throw new NotFoundException('Product not found');

    // Check SKU uniqueness if changing
    if (dto.sku && dto.sku !== product.sku) {
      const existing = await this.prisma.product.findFirst({
        where: { organizationId, sku: dto.sku, NOT: { id } },
      });
      if (existing) {
        throw new ConflictException(`SKU '${dto.sku}' already exists`);
      }
    }

    let slug = product.slug;
    if (dto.name && dto.name !== product.name) {
      slug = await this.generateUniqueSlug(organizationId, dto.name, id);
    }

    const oldValues: Record<string, unknown> = {};
    const newValues: Record<string, unknown> = {};

    // Track price changes
    if (dto.sellingPrice && dto.sellingPrice !== product.sellingPrice.toString()) {
      oldValues['sellingPrice'] = product.sellingPrice;
      newValues['sellingPrice'] = dto.sellingPrice;
    }
    if (dto.costPrice && dto.costPrice !== product.costPrice.toString()) {
      oldValues['costPrice'] = product.costPrice;
      newValues['costPrice'] = dto.costPrice;
    }

    const updated = await this.prisma.product.update({
      where: { id },
      data: {
        name: dto.name,
        slug,
        sku: dto.sku,
        barcode: dto.barcode,
        gtin: dto.gtin,
        categoryId: dto.categoryId,
        brandId: dto.brandId,
        description: dto.description,
        shortDesc: dto.shortDesc,
        costPrice: dto.costPrice,
        sellingPrice: dto.sellingPrice,
        comparePrice: dto.comparePrice,
        taxRateId: dto.taxRateId,
        isSerialized: dto.isSerialized,
        hasVariants: dto.hasVariants,
        trackInventory: dto.trackInventory,
        lowStockAlert: dto.lowStockAlert,
        weight: dto.weight,
        weightUnit: dto.weightUnit,
        status: dto.status,
        metaTitle: dto.metaTitle,
        metaDesc: dto.metaDesc,
      },
    });

    await this.updateSearchVector(id);

    await this.auditService.log({
      organizationId,
      userId,
      action: 'PRODUCT_UPDATED',
      entity: 'Product',
      entityId: id,
      oldValues: Object.keys(oldValues).length ? oldValues : undefined,
      newValues: Object.keys(newValues).length ? newValues : { name: updated.name },
    });

    return updated;
  }

  async softDelete(organizationId: string, id: string, userId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, organizationId },
    });
    if (!product) throw new NotFoundException('Product not found');

    // Since the schema has no deletedAt, we mark as DISCONTINUED to effectively "delete" it
    await this.prisma.product.update({
      where: { id },
      data: { status: ProductStatus.DISCONTINUED },
    });

    await this.auditService.log({
      organizationId,
      userId,
      action: 'PRODUCT_DELETED',
      entity: 'Product',
      entityId: id,
      oldValues: { name: product.name, sku: product.sku, status: product.status },
      newValues: { status: ProductStatus.DISCONTINUED },
    });

    return { message: 'Product deleted successfully' };
  }

  async updateStatus(
    organizationId: string,
    id: string,
    status: ProductStatus,
    userId: string,
  ) {
    const product = await this.prisma.product.findFirst({
      where: { id, organizationId },
    });
    if (!product) throw new NotFoundException('Product not found');

    const updated = await this.prisma.product.update({
      where: { id },
      data: { status },
      select: { id: true, status: true },
    });

    await this.auditService.log({
      organizationId,
      userId,
      action: 'PRODUCT_STATUS_CHANGED',
      entity: 'Product',
      entityId: id,
      oldValues: { status: product.status },
      newValues: { status },
    });

    return updated;
  }

  // ── Variants ──────────────────────────────────────────────────

  async getVariants(organizationId: string, productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, organizationId },
    });
    if (!product) throw new NotFoundException('Product not found');

    return this.prisma.productVariant.findMany({
      where: { productId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async addVariant(
    organizationId: string,
    productId: string,
    dto: CreateProductVariantDto,
    userId: string,
  ) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, organizationId },
    });
    if (!product) throw new NotFoundException('Product not found');

    // Check variant SKU uniqueness within product
    const existing = await this.prisma.productVariant.findFirst({
      where: { productId, sku: dto.sku },
    });
    if (existing) {
      throw new ConflictException(`Variant SKU '${dto.sku}' already exists for this product`);
    }

    const variant = await this.prisma.productVariant.create({
      data: {
        id: createId(),
        productId,
        name: dto.name,
        sku: dto.sku,
        barcode: dto.barcode,
        gtin: dto.gtin,
        costPrice: dto.costPrice,
        sellingPrice: dto.sellingPrice,
        options: dto.options ?? {},
      },
    });

    // Create inventory levels for this variant at all locations
    await this.createInventoryLevelsForAllLocations(organizationId, productId, variant.id);

    return variant;
  }

  async updateVariant(
    organizationId: string,
    productId: string,
    variantId: string,
    dto: UpdateProductVariantDto,
    _userId: string,
  ) {
    const variant = await this.prisma.productVariant.findFirst({
      where: { id: variantId, productId, product: { organizationId } },
    });
    if (!variant) throw new NotFoundException('Variant not found');

    if (dto.sku && dto.sku !== variant.sku) {
      const existing = await this.prisma.productVariant.findFirst({
        where: { productId, sku: dto.sku, NOT: { id: variantId } },
      });
      if (existing) throw new ConflictException(`Variant SKU '${dto.sku}' already exists`);
    }

    return this.prisma.productVariant.update({
      where: { id: variantId },
      data: {
        name: dto.name,
        sku: dto.sku,
        barcode: dto.barcode,
        gtin: dto.gtin,
        costPrice: dto.costPrice,
        sellingPrice: dto.sellingPrice,
        options: dto.options,
      },
    });
  }

  async removeVariant(
    organizationId: string,
    productId: string,
    variantId: string,
  ) {
    const variant = await this.prisma.productVariant.findFirst({
      where: { id: variantId, productId, product: { organizationId } },
    });
    if (!variant) throw new NotFoundException('Variant not found');

    await this.prisma.productVariant.update({
      where: { id: variantId },
      data: { isActive: false },
    });

    return { message: 'Variant removed' };
  }

  // ── Images ────────────────────────────────────────────────────

  async getImages(organizationId: string, productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, organizationId },
    });
    if (!product) throw new NotFoundException('Product not found');

    return this.prisma.productImage.findMany({
      where: { productId },
      orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
    });
  }

  async addImage(
    organizationId: string,
    productId: string,
    dto: AddProductImageDto,
  ) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, organizationId },
    });
    if (!product) throw new NotFoundException('Product not found');

    // Unset existing primary if this one is primary
    if (dto.isPrimary) {
      await this.prisma.productImage.updateMany({
        where: { productId },
        data: { isPrimary: false },
      });
    }

    const count = await this.prisma.productImage.count({ where: { productId } });

    return this.prisma.productImage.create({
      data: {
        id: createId(),
        productId,
        url: dto.url,
        altText: dto.altText,
        isPrimary: dto.isPrimary ?? count === 0,
        sortOrder: count,
      },
    });
  }

  async reorderImages(
    organizationId: string,
    productId: string,
    imageIds: string[],
  ) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, organizationId },
    });
    if (!product) throw new NotFoundException('Product not found');

    await Promise.all(
      imageIds.map((imageId, index) =>
        this.prisma.productImage.update({
          where: { id: imageId },
          data: { sortOrder: index },
        }),
      ),
    );

    return { message: 'Images reordered' };
  }

  async removeImage(
    organizationId: string,
    productId: string,
    imageId: string,
  ) {
    const image = await this.prisma.productImage.findFirst({
      where: { id: imageId, productId, product: { organizationId } },
    });
    if (!image) throw new NotFoundException('Image not found');

    await this.prisma.productImage.delete({ where: { id: imageId } });

    // Promote next image to primary if this was primary
    if (image.isPrimary) {
      const next = await this.prisma.productImage.findFirst({
        where: { productId },
        orderBy: { sortOrder: 'asc' },
      });
      if (next) {
        await this.prisma.productImage.update({
          where: { id: next.id },
          data: { isPrimary: true },
        });
      }
    }

    return { message: 'Image removed' };
  }

  // ── Inventory summary ─────────────────────────────────────────

  async getInventorySummary(organizationId: string, productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, organizationId },
    });
    if (!product) throw new NotFoundException('Product not found');

    return this.prisma.inventoryLevel.findMany({
      where: { productId },
      include: {
        location: { select: { id: true, name: true, code: true } },
        variant: { select: { id: true, name: true, sku: true } },
      },
    });
  }

  async getLowStockProducts(organizationId: string, locationId?: string) {
    const where: Record<string, unknown> = {
      organizationId,
      trackInventory: true,
    };

    const products = await this.prisma.product.findMany({
      where,
      include: {
        inventoryLevels: locationId
          ? {
              where: { locationId },
              include: { location: { select: { id: true, name: true } } },
            }
          : { include: { location: { select: { id: true, name: true } } } },
      },
    });

    return products.filter((p) => {
      const totalQty = p.inventoryLevels.reduce((sum, l) => sum + l.quantity, 0);
      return totalQty <= p.lowStockAlert;
    });
  }

  async getProductsByCategory(organizationId: string, categoryId: string) {
    return this.prisma.product.findMany({
      where: { organizationId, categoryId, status: ProductStatus.ACTIVE },
      select: {
        id: true,
        name: true,
        sku: true,
        sellingPrice: true,
        status: true,
        images: {
          where: { isPrimary: true },
          select: { url: true },
          take: 1,
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  // ── Barcode / code lookup ─────────────────────────────────────

  async lookupByCode(organizationId: string, code: string) {
    // 1. Product by barcode
    const byBarcode = await this.prisma.product.findFirst({
      where: { organizationId, barcode: code, status: { not: 'DELETED' } },
      select: { id: true, name: true, sku: true, barcode: true, gtin: true, sellingPrice: true, costPrice: true, isSerialized: true, hasVariants: true },
    });
    if (byBarcode) return { type: 'PRODUCT' as const, product: byBarcode };

    // 2. Product by GTIN
    const byGtin = await this.prisma.product.findFirst({
      where: { organizationId, gtin: code, status: { not: 'DELETED' } },
      select: { id: true, name: true, sku: true, barcode: true, gtin: true, sellingPrice: true, costPrice: true, isSerialized: true, hasVariants: true },
    });
    if (byGtin) return { type: 'PRODUCT' as const, product: byGtin };

    // 3. ProductVariant by barcode
    const variantByBarcode = await this.prisma.productVariant.findFirst({
      where: { product: { organizationId }, barcode: code },
      select: { id: true, name: true, sku: true, barcode: true, sellingPrice: true, product: { select: { id: true, name: true, sku: true, sellingPrice: true, costPrice: true, isSerialized: true, hasVariants: true } } },
    });
    if (variantByBarcode) {
      return {
        type: 'VARIANT' as const,
        product: variantByBarcode.product,
        variant: { id: variantByBarcode.id, name: variantByBarcode.name, sku: variantByBarcode.sku, sellingPrice: variantByBarcode.sellingPrice?.toString() },
      };
    }

    // 4. ProductVariant by GTIN
    const variantByGtin = await this.prisma.productVariant.findFirst({
      where: { product: { organizationId }, gtin: code },
      select: { id: true, name: true, sku: true, gtin: true, sellingPrice: true, product: { select: { id: true, name: true, sku: true, sellingPrice: true, costPrice: true, isSerialized: true, hasVariants: true } } },
    });
    if (variantByGtin) {
      return {
        type: 'VARIANT' as const,
        product: variantByGtin.product,
        variant: { id: variantByGtin.id, name: variantByGtin.name, sku: variantByGtin.sku, sellingPrice: variantByGtin.sellingPrice?.toString() },
      };
    }

    // 5. SerializedUnit by IMEI1, IMEI2, or serialNumber
    const unit = await this.prisma.serializedUnit.findFirst({
      where: { organizationId, OR: [{ imei1: code }, { imei2: code }, { serialNumber: code }] },
      select: { id: true, imei1: true, imei2: true, serialNumber: true, status: true, locationId: true, product: { select: { id: true, name: true, sku: true, sellingPrice: true, costPrice: true, isSerialized: true, hasVariants: true } } },
    });
    if (unit) {
      return {
        type: 'SERIALIZED_UNIT' as const,
        product: unit.product,
        unit: { id: unit.id, imei1: unit.imei1, status: unit.status, locationId: unit.locationId },
      };
    }

    throw new NotFoundException('No product found for code');
  }

  // ── Helpers ───────────────────────────────────────────────────

  private async createInventoryLevelsForAllLocations(
    organizationId: string,
    productId: string,
    variantId?: string,
  ) {
    const locations = await this.prisma.location.findMany({
      where: { organizationId, isActive: true },
      select: { id: true },
    });

    for (const location of locations) {
      // Check if level already exists before creating
      const existing = await this.prisma.inventoryLevel.findFirst({
        where: {
          productId,
          variantId: variantId ?? null,
          locationId: location.id,
        },
      });

      if (!existing) {
        await this.prisma.inventoryLevel.create({
          data: {
            id: createId(),
            productId,
            variantId: variantId ?? null,
            locationId: location.id,
            quantity: 0,
            reserved: 0,
            incoming: 0,
          },
        }).catch(() => {
          // Race condition – level was created between our check and insert; safe to ignore
        });
      }
    }
  }

  private async updateSearchVector(productId: string) {
    await this.prisma.$executeRaw`
      UPDATE products SET search_vector = to_tsvector('english',
        coalesce(name,'') || ' ' || coalesce(sku,'') || ' ' ||
        coalesce(barcode,'') || ' ' || coalesce(gtin,'') || ' ' ||
        coalesce(description,'')
      ) WHERE id = ${productId}
    `;
  }

  private async generateUniqueSlug(
    organizationId: string,
    name: string,
    excludeId?: string,
  ): Promise<string> {
    const base = slugify(name);
    let slug = base;
    let counter = 1;

    while (true) {
      const existing = await this.prisma.product.findFirst({
        where: {
          organizationId,
          slug,
          ...(excludeId ? { NOT: { id: excludeId } } : {}),
        },
      });
      if (!existing) break;
      slug = `${base}-${counter++}`;
    }

    return slug;
  }
}
