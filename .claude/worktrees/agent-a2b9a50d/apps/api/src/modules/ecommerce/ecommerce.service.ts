import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { randomBytes, createHash } from 'crypto';
import { OrderStatus, Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import type { PublicProductsQueryDto } from './dto/public-products-query.dto';
import type { CreatePublicOrderDto } from './dto/create-public-order.dto';
import type { CreateApiKeyDto } from './dto/create-api-key.dto';
import type { ListEcommerceOrdersDto } from './dto/list-ecommerce-orders.dto';

function publicResponse<T>(data: T, meta?: Record<string, unknown>) {
  return {
    success: true,
    data,
    meta: { timestamp: new Date().toISOString(), ...meta },
  };
}

function generateReference(prefix: string): string {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${dateStr}-${rand}`;
}

@Injectable()
export class EcommerceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
  ) {}

  // ── Public: Products ─────────────────────────────────────────

  async getPublicProducts(organizationId: string, query: PublicProductsQueryDto) {
    const page = parseInt(query.page ?? '1', 10);
    const limit = Math.min(parseInt(query.limit ?? '20', 10), 100);
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {
      organizationId,
      status: ProductStatus.ACTIVE,
    };

    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.brandId) where.brandId = query.brandId;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { sku: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
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
          gtin: true,
          barcode: true,
          description: true,
          shortDesc: true,
          sellingPrice: true,
          comparePrice: true,
          status: true,
          trackInventory: true,
          category: { select: { id: true, name: true } },
          brand: { select: { id: true, name: true } },
          images: {
            where: { isPrimary: true },
            select: { url: true },
            take: 1,
          },
          variants: {
            where: { isActive: true },
            select: {
              id: true,
              name: true,
              sku: true,
              sellingPrice: true,
              options: true,
            },
          },
          inventoryLevels: {
            select: { quantity: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.product.count({ where }),
    ]);

    const mappedProducts = products.map((p) => {
      const totalStock = p.inventoryLevels.reduce((sum, l) => sum + l.quantity, 0);
      return {
        id: p.id,
        name: p.name,
        sku: p.sku,
        gtin: p.gtin,
        barcode: p.barcode,
        description: p.description,
        shortDesc: p.shortDesc,
        sellingPrice: p.sellingPrice.toString(),
        comparePrice: p.comparePrice?.toString() ?? null,
        status: p.status,
        category: p.category,
        brand: p.brand,
        primaryImage: p.images[0] ?? null,
        variants: p.variants.map((v) => ({
          ...v,
          sellingPrice: v.sellingPrice.toString(),
        })),
        stock: p.trackInventory ? totalStock : null,
      };
    });

    // Apply inStock filter after mapping (needs computed stock)
    const filtered = query.inStock
      ? mappedProducts.filter((p) => (p.stock ?? 1) > 0)
      : mappedProducts;

    return publicResponse(filtered, {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  }

  async getPublicProduct(organizationId: string, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, organizationId, status: ProductStatus.ACTIVE },
      select: {
        id: true,
        name: true,
        sku: true,
        gtin: true,
        barcode: true,
        description: true,
        shortDesc: true,
        sellingPrice: true,
        comparePrice: true,
        status: true,
        trackInventory: true,
        metaTitle: true,
        metaDesc: true,
        weight: true,
        weightUnit: true,
        category: { select: { id: true, name: true, slug: true } },
        brand: { select: { id: true, name: true } },
        images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }] },
        variants: {
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            sku: true,
            sellingPrice: true,
            options: true,
          },
        },
        inventoryLevels: {
          select: {
            quantity: true,
            reserved: true,
            locationId: true,
            location: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!product) throw new NotFoundException('Product not found');

    return publicResponse({
      ...product,
      sellingPrice: product.sellingPrice.toString(),
      comparePrice: product.comparePrice?.toString() ?? null,
      weight: product.weight?.toString() ?? null,
      variants: product.variants.map((v) => ({
        ...v,
        sellingPrice: v.sellingPrice.toString(),
      })),
      inventoryByLocation: product.inventoryLevels.map((l) => ({
        locationId: l.locationId,
        locationName: l.location.name,
        quantity: l.quantity,
        reserved: l.reserved,
        available: l.quantity - l.reserved,
      })),
    });
  }

  async getPublicCategories(organizationId: string) {
    const categories = await this.prisma.category.findMany({
      where: { organizationId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        imageUrl: true,
        parentId: true,
        sortOrder: true,
        children: {
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            slug: true,
            description: true,
            imageUrl: true,
            parentId: true,
            sortOrder: true,
          },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        },
      },
    });

    // Build tree: only top-level (no parent)
    const tree = categories.filter((c) => !c.parentId);
    return publicResponse(tree);
  }

  async searchPublicProducts(organizationId: string, q: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [results, total] = await Promise.all([
      this.prisma.$queryRaw<Array<{
        id: string;
        name: string;
        sku: string;
        selling_price: string;
        status: string;
      }>>`
        SELECT id, name, sku, selling_price::text, status
        FROM products
        WHERE organization_id = ${organizationId}
          AND status = 'ACTIVE'
          AND search_vector @@ plainto_tsquery('english', ${q})
        ORDER BY ts_rank(search_vector, plainto_tsquery('english', ${q})) DESC
        LIMIT ${limit} OFFSET ${skip}
      `,
      this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count
        FROM products
        WHERE organization_id = ${organizationId}
          AND status = 'ACTIVE'
          AND search_vector @@ plainto_tsquery('english', ${q})
      `,
    ]);

    const totalCount = Number(total[0]?.count ?? 0);

    return publicResponse(
      results.map((r) => ({
        id: r.id,
        name: r.name,
        sku: r.sku,
        sellingPrice: r.selling_price,
        status: r.status,
      })),
      { total: totalCount, page, limit, totalPages: Math.ceil(totalCount / limit) },
    );
  }

  // ── Public: Orders ────────────────────────────────────────────

  async createPublicOrder(organizationId: string, dto: CreatePublicOrderDto) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Order must have at least one item');
    }

    // Find or create customer by phone
    let customer = await this.prisma.customer.findFirst({
      where: { organizationId, phone: dto.customerPhone },
    });

    if (!customer) {
      const nameParts = dto.customerName.trim().split(' ');
      const firstName = nameParts[0] ?? dto.customerName;
      const lastName = nameParts.slice(1).join(' ') || '-';

      const code = `EC-${Date.now()}`;
      customer = await this.prisma.customer.create({
        data: {
          id: createId(),
          organizationId,
          code,
          firstName,
          lastName,
          email: dto.customerEmail,
          phone: dto.customerPhone,
        },
      });
    }

    // Validate location
    const location = await this.prisma.location.findFirst({
      where: { id: dto.locationId, organizationId, isActive: true },
    });
    if (!location) throw new NotFoundException('Location not found');

    // Validate & price items
    let totalAmount = new Prisma.Decimal(0);
    const itemsData: Array<{
      id: string;
      productId: string;
      variantId: string | null;
      quantity: number;
      unitPrice: string;
      costPrice: string;
      discountRate: string;
      taxRate: string;
      totalPrice: string;
    }> = [];

    for (const item of dto.items) {
      const product = await this.prisma.product.findFirst({
        where: { id: item.productId, organizationId, status: ProductStatus.ACTIVE },
      });
      if (!product) throw new NotFoundException(`Product ${item.productId} not found`);

      let unitPrice = product.sellingPrice;
      let costPrice = product.costPrice;

      if (item.variantId) {
        const variant = await this.prisma.productVariant.findFirst({
          where: { id: item.variantId, productId: item.productId, isActive: true },
        });
        if (!variant) throw new NotFoundException(`Variant ${item.variantId} not found`);
        unitPrice = variant.sellingPrice;
        costPrice = variant.costPrice;
      }

      const lineTotal = unitPrice.mul(item.quantity);
      totalAmount = totalAmount.add(lineTotal);

      itemsData.push({
        id: createId(),
        productId: item.productId,
        variantId: item.variantId ?? null,
        quantity: item.quantity,
        unitPrice: unitPrice.toString(),
        costPrice: costPrice.toString(),
        discountRate: '0',
        taxRate: '0',
        totalPrice: lineTotal.toString(),
      });
    }

    const reference = generateReference('WEB');

    // Use a system userId from org (we pick a user from the org to satisfy the FK)
    const orgUser = await this.prisma.user.findFirst({
      where: { organizationId, isActive: true },
      select: { id: true },
    });
    if (!orgUser) throw new BadRequestException('Organization has no active users');

    const order = await this.prisma.salesOrder.create({
      data: {
        id: createId(),
        organizationId,
        reference,
        customerId: customer.id,
        locationId: dto.locationId,
        userId: orgUser.id,
        status: OrderStatus.CONFIRMED,
        channel: 'ONLINE',
        currency: 'NGN',
        subtotal: totalAmount.toString(),
        discountAmount: '0',
        taxAmount: '0',
        totalAmount: totalAmount.toString(),
        notes: dto.notes,
        items: { create: itemsData },
      },
    });

    return publicResponse({
      orderId: order.id,
      reference: order.reference,
      totalAmount: totalAmount.toString(),
      status: order.status,
    });
  }

  async getPublicOrder(organizationId: string, reference: string, email: string) {
    const order = await this.prisma.salesOrder.findFirst({
      where: { reference, organizationId },
      include: {
        customer: { select: { id: true, firstName: true, lastName: true, email: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true } },
            variant: { select: { id: true, name: true, sku: true } },
          },
        },
      },
    });

    if (!order) throw new NotFoundException('Order not found');

    // Verify customer email
    if (!order.customer?.email || order.customer.email.toLowerCase() !== email.toLowerCase()) {
      throw new UnauthorizedException('Email does not match order');
    }

    return publicResponse({
      id: order.id,
      reference: order.reference,
      status: order.status,
      totalAmount: order.totalAmount.toString(),
      currency: order.currency,
      createdAt: order.createdAt,
      items: order.items.map((i) => ({
        product: i.product,
        variant: i.variant,
        quantity: i.quantity,
        unitPrice: i.unitPrice.toString(),
        totalPrice: i.totalPrice.toString(),
      })),
    });
  }

  async getPublicInventory(
    organizationId: string,
    productIds?: string,
    locationId?: string,
  ) {
    const where: Prisma.InventoryLevelWhereInput = {
      product: { organizationId, status: ProductStatus.ACTIVE },
      quantity: { gt: 0 },
    };

    if (locationId) where.locationId = locationId;
    if (productIds) {
      const ids = productIds.split(',').map((s) => s.trim()).filter(Boolean);
      where.productId = { in: ids };
    }

    const levels = await this.prisma.inventoryLevel.findMany({
      where,
      select: {
        productId: true,
        variantId: true,
        locationId: true,
        quantity: true,
        reserved: true,
      },
    });

    return publicResponse(
      levels.map((l) => ({
        productId: l.productId,
        variantId: l.variantId,
        locationId: l.locationId,
        quantity: l.quantity,
        available: l.quantity - l.reserved,
      })),
    );
  }

  // ── Internal: Online Orders ───────────────────────────────────

  async listOnlineOrders(organizationId: string, query: ListEcommerceOrdersDto) {
    const page = parseInt(query.page ?? '1', 10);
    const limit = parseInt(query.limit ?? '20', 10);
    const skip = (page - 1) * limit;

    const where: Prisma.SalesOrderWhereInput = {
      organizationId,
      channel: 'ONLINE',
    };
    if (query.status) where.status = query.status as OrderStatus;

    const [orders, total] = await Promise.all([
      this.prisma.salesOrder.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          reference: true,
          status: true,
          channel: true,
          totalAmount: true,
          currency: true,
          createdAt: true,
          completedAt: true,
          customer: {
            select: { id: true, firstName: true, lastName: true, phone: true, email: true },
          },
          location: { select: { id: true, name: true } },
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.salesOrder.count({ where }),
    ]);

    return {
      data: orders.map((o) => ({
        ...o,
        totalAmount: o.totalAmount.toString(),
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async fulfillOnlineOrder(organizationId: string, id: string, userId: string) {
    const order = await this.prisma.salesOrder.findFirst({
      where: { id, organizationId, channel: 'ONLINE' },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Online order not found');
    if (order.status !== OrderStatus.CONFIRMED) {
      throw new BadRequestException('Only CONFIRMED orders can be fulfilled');
    }

    // Deduct stock for each item
    for (const item of order.items) {
      await this.inventoryService.recordMovement(organizationId, {
        productId: item.productId,
        variantId: item.variantId ?? undefined,
        locationId: order.locationId,
        type: 'SALE',
        quantity: -item.quantity,
        referenceType: 'SalesOrder',
        referenceId: id,
        notes: `Online fulfillment: ${order.reference}`,
        createdBy: userId,
      });
    }

    await this.prisma.salesOrder.update({
      where: { id },
      data: { status: OrderStatus.COMPLETED, completedAt: new Date() },
    });

    // Update customer totalSpent
    if (order.customerId) {
      await this.prisma.customer.update({
        where: { id: order.customerId },
        data: { totalSpent: { increment: order.totalAmount } },
      });
    }

    return { message: 'Order fulfilled successfully', orderId: id };
  }

  // ── API Key Management ────────────────────────────────────────

  async listApiKeys(organizationId: string) {
    const keys = await this.prisma.aPIKey.findMany({
      where: { organizationId, isActive: true },
      select: {
        id: true,
        name: true,
        prefix: true,
        scopes: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
        createdBy: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return { data: keys };
  }

  async createApiKey(organizationId: string, dto: CreateApiKeyDto, userId: string) {
    const prefixRandom = randomBytes(4).toString('hex'); // 8 chars
    const prefix = `knef_${prefixRandom}`;
    const rawKey = `${prefix}_${randomBytes(16).toString('hex')}`; // 32 hex chars
    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    const key = await this.prisma.aPIKey.create({
      data: {
        id: createId(),
        organizationId,
        name: dto.name,
        keyHash,
        prefix,
        scopes: dto.scopes,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        createdBy: userId,
      },
    });

    return {
      id: key.id,
      name: key.name,
      prefix,
      key: rawKey, // shown once only
    };
  }

  async revokeApiKey(organizationId: string, id: string) {
    const key = await this.prisma.aPIKey.findFirst({
      where: { id, organizationId },
    });
    if (!key) throw new NotFoundException('API key not found');

    await this.prisma.aPIKey.update({
      where: { id },
      data: { isActive: false },
    });

    return { message: 'API key revoked' };
  }
}
