import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { randomBytes, createHash } from 'crypto';
import { OrderStatus, Prisma, ProductStatus } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/services/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { CredentialService } from '../credentials/credential.service';
import type { AppConfig } from '../../config/app.config';
import { DiscountService } from '../discounts/discount.service';
import { GiftCardService } from '../gift-cards/gift-card.service';
import { StorefrontAuthService } from '../storefront/storefront-auth.service';
import { PaystackService } from './paystack.service';
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

import { generateReference } from '../../common/utils/references';

/** True when the delivery address is in Lagos State, Nigeria (state may arrive as "Lagos" or "Lagos State"). */
export function isLagosAddress(dto: Pick<CreatePublicOrderDto, 'deliveryState' | 'deliveryCountry'>): boolean {
  const country = dto.deliveryCountry?.trim().toLowerCase();
  if (country && country !== 'nigeria') return false;
  const state = (dto.deliveryState ?? '').split(',')[0].trim().toLowerCase();
  return state === 'lagos' || state === 'lagos state';
}

export interface PublicCardPayment {
  provider: 'paystack';
  reference: string;
  accessCode: string;
  authorizationUrl: string;
}
export type CheckoutAccount = Awaited<ReturnType<StorefrontAuthService['createAccountForOrder']>>;

@Injectable()
export class EcommerceService {
  private readonly logger = new Logger(EcommerceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly credentialService: CredentialService,
    private readonly discountService: DiscountService,
    private readonly giftCardService: GiftCardService,
    private readonly paystackService: PaystackService,
    private readonly storefrontAuth: StorefrontAuthService,
  ) {}

  /**
   * Server-authoritative delivery fee calculator.
   *
   * The public checkout DTO MUST NOT accept a client-supplied delivery fee —
   * all monetary values on an order are computed on the server from trusted
   * inputs (delivery method, address/zone, configured rates).
   *
   * Current pricing policy (no shipping engine configured yet):
   *   - PICKUP            → 0
   *   - DELIVERY          → 0  (returned as-is until Stage 25 adds courier/zone pricing)
   *   - unspecified/other → 0
   */
  private calculateDeliveryFee(_deliveryMethod?: string | null): Prisma.Decimal {
    return new Prisma.Decimal(0);
  }

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
    if (query.inStock) {
      where.inventoryLevels = { some: { quantity: { gt: 0 } } };
    }
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

  /**
   * Public checkout.
   *
   * @param customerToken optional customer access token (from the Authorization header).
   *   A logged-in customer is identified ONLY from this verified token, never from the body.
   */
  async createPublicOrder(organizationId: string, dto: CreatePublicOrderDto, customerToken?: string) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Order must have at least one item');
    }

    // Payment on delivery is only offered within Lagos, Nigeria.
    if (dto.deliveryMethod === 'DELIVERY' && dto.paymentMethod === 'CASH' && !isLagosAddress(dto)) {
      throw new BadRequestException(
        'Payment on delivery is only available for delivery addresses in Lagos. Please pay online instead.',
      );
    }

    // Idempotency check
    if (dto.idempotencyKey) {
      const existing = await this.prisma.salesOrder.findFirst({
        where: { organizationId, idempotencyKey: dto.idempotencyKey },
      });
      if (existing) {
        // Replay of the same submission: same order, same response shape (no new side effects).
        return publicResponse({
          orderId: existing.id,
          reference: existing.reference,
          totalAmount: existing.totalAmount.toString(),
          discountAmount: (existing.discountAmount ?? 0).toString(),
          giftCardAmount: '0',
          amountDue: existing.totalAmount.toString(),
          status: existing.status,
          payment: null as PublicCardPayment | null,
          linkedToAccount: !!existing.customerAccountId,
          account: null as CheckoutAccount | null,
          accountError: null as string | null,
        });
      }
    }

    const loggedInAccountId = customerToken
      ? await this.storefrontAuth.resolveAccountIdFromToken(customerToken, organizationId)
      : null;

    // Guest asked to create an account: check up front so we fail before creating anything.
    const wantsAccount = !loggedInAccountId && dto.createAccount === true;
    if (wantsAccount) {
      if (!dto.accountPassword || dto.accountPassword.length < 8) {
        throw new BadRequestException('Choose a password of at least 8 characters to create your account');
      }
      if (await this.storefrontAuth.emailHasAccount(organizationId, dto.customerEmail)) {
        throw new ConflictException(
          'An account with this email already exists. Please log in to continue checking out.',
        );
      }
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
    let subtotal = new Prisma.Decimal(0);
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

      // Stock validation
      if (product.trackInventory) {
        const inv = await this.prisma.inventoryLevel.findFirst({
          where: {
            productId: item.productId,
            variantId: item.variantId ?? null,
            locationId: dto.locationId,
          },
        });
        const available = inv ? inv.quantity - inv.reserved : 0;
        if (available < item.quantity) {
          throw new BadRequestException(
            `Insufficient stock for ${product.name}: requested ${item.quantity}, available ${available}`,
          );
        }
      }

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
      subtotal = subtotal.add(lineTotal);

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

    // Server-authoritative delivery fee — NEVER accept from client.
    // Current behaviour: zero fee for all methods (no delivery pricing engine yet).
    // When Stage 25 adds courier/zone pricing, extend this helper.
    const deliveryFee = this.calculateDeliveryFee(dto.deliveryMethod);

    // ── Coupon: validated and priced on the server against the item subtotal ──
    let discountAmount = new Prisma.Decimal(0);
    let discountCodeId: string | null = null;
    if (dto.couponCode?.trim()) {
      const result = await this.discountService.validate(
        organizationId,
        dto.couponCode,
        subtotal.toNumber(),
        dto.customerEmail,
      );
      discountAmount = new Prisma.Decimal(result.discountAmount);
      discountCodeId = (result.discountCode as { id: string }).id;
    }

    const totalAmount = Prisma.Decimal.max(subtotal.add(deliveryFee).sub(discountAmount), 0);

    // ── Gift card: covers as much as possible of what's left after the coupon ──
    let giftCardAmount = new Prisma.Decimal(0);
    let giftCard: { id: string; code: string } | null = null;
    if (dto.giftCardCode?.trim()) {
      const code = dto.giftCardCode.trim().toUpperCase();
      const result = await this.giftCardService.validate(organizationId, code);
      giftCardAmount = Prisma.Decimal.min(result.remainingAmount, totalAmount);
      giftCard = { id: result.giftCard.id, code };
    }

    const amountDue = totalAmount.sub(giftCardAmount);
    const needsCardPayment = dto.paymentMethod === 'PAYSTACK' && amountDue.gt(0);

    const reference = generateReference('WEB');

    // Use a system userId from org (we pick a user from the org to satisfy the FK)
    const orgUser = await this.prisma.user.findFirst({
      where: { organizationId, isActive: true },
      select: { id: true },
    });
    if (!orgUser) throw new BadRequestException('Organization has no active users');

    // Start the Paystack transaction before writing anything, so a provider failure
    // leaves no half-created order. Amount and reference are server-generated.
    let paystack: { reference: string; accessCode: string; authorizationUrl: string } | null = null;
    if (needsCardPayment) {
      const gatewayRef = `KNEF-${randomBytes(10).toString('hex').toUpperCase()}`;
      const init = await this.paystackService.initialize({
        email: dto.customerEmail,
        amountKobo: Math.round(amountDue.toNumber() * 100),
        reference: gatewayRef,
        callbackUrl: dto.paystackCallbackUrl,
        metadata: { orderReference: reference, customerName: dto.customerName, customerPhone: dto.customerPhone },
      });
      paystack = { reference: gatewayRef, ...init };
    }

    const customerId = customer.id;
    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.salesOrder.create({
      data: {
        id: createId(),
        organizationId,
        reference,
        customerId: customerId,
        locationId: dto.locationId,
        userId: orgUser.id,
        // Card orders wait in DRAFT until Paystack confirms payment.
        status: needsCardPayment ? OrderStatus.DRAFT : OrderStatus.CONFIRMED,
        channel: 'ONLINE',
        currency: 'NGN',
        subtotal: subtotal.toString(),
        discountAmount: discountAmount.toString(),
        taxAmount: '0',
        totalAmount: totalAmount.toString(),
        notes: dto.notes,
        deliveryFee: deliveryFee.toString(),
        deliveryAddress: dto.deliveryAddress,
        deliveryCity: dto.deliveryCity,
        deliveryState: dto.deliveryState,
        deliveryPhone: dto.deliveryPhone,
        deliveryLandmark: dto.deliveryLandmark,
        deliveryCountry: dto.deliveryCountry,
        deliveryPlaceId: dto.deliveryPlaceId,
        deliveryLatitude: dto.deliveryLatitude ?? null,
        deliveryLongitude: dto.deliveryLongitude ?? null,
        deliveryAddressSource: (dto.deliveryAddressSource as 'GOOGLE_PLACE' | 'MANUAL' | 'SAVED_ADDRESS' | undefined) ?? null,
        idempotencyKey: dto.idempotencyKey,
        customerAccountId: loggedInAccountId ?? undefined,
        items: { create: itemsData },
      },
      });

      // Coupon usage — conditional increment so concurrent orders can't exceed maxUses
      if (discountCodeId) {
        const claimed = await tx.$executeRaw`
          UPDATE discount_codes SET "usedCount" = "usedCount" + 1, "updatedAt" = NOW()
          WHERE id = ${discountCodeId} AND "organizationId" = ${organizationId} AND "isActive" = true
            AND ("maxUses" IS NULL OR "usedCount" < "maxUses")`;
        if (claimed === 0) throw new BadRequestException('This discount code has reached its usage limit');
        await tx.discountCodeUsage.create({
          data: {
            id: createId(),
            discountCodeId,
            orderId: created.id,
            customerEmail: dto.customerEmail,
            discountAmount,
          },
        });
      }

      // Gift card — conditional debit so the balance can never go negative
      if (giftCard && giftCardAmount.gt(0)) {
        const debited = await tx.giftCard.updateMany({
          where: { id: giftCard.id, organizationId, isActive: true, remainingAmount: { gte: giftCardAmount } },
          data: { remainingAmount: { decrement: giftCardAmount } },
        });
        if (debited.count === 0) {
          throw new BadRequestException('Your gift card balance has changed. Please re-apply the gift card.');
        }
        await tx.giftCardRedemption.create({
          data: { giftCardId: giftCard.id, orderId: created.id, amount: giftCardAmount },
        });
        await tx.payment.create({
          data: {
            id: createId(),
            organizationId,
            reference: generateReference('PAY'),
            orderId: created.id,
            customerId: customerId,
            amount: giftCardAmount,
            currency: 'NGN',
            method: 'OTHER',
            status: 'COMPLETED',
            notes: `Gift card ${giftCard.code}`,
            receivedAt: new Date(),
          },
        });
      }

      // Remaining balance: PENDING until Paystack confirms, or until staff record cash/transfer
      if (amountDue.gt(0)) {
        await tx.payment.create({
          data: {
            id: createId(),
            organizationId,
            reference: generateReference('PAY'),
            orderId: created.id,
            customerId: customerId,
            amount: amountDue,
            currency: 'NGN',
            method: needsCardPayment ? 'PAYSTACK' : (dto.paymentMethod as 'CASH' | 'BANK_TRANSFER' | 'OTHER'),
            status: 'PENDING',
            gatewayRef: paystack?.reference ?? null,
            receivedAt: null,
          },
        });
      }

      return created;
    });

    // Card orders send their confirmation only once Paystack payment is verified.
    if (!needsCardPayment) {
      this.eventEmitter.emit('storefront.order.created', {
        organizationId,
        orderId: order.id,
        reference: order.reference,
        customerName: dto.customerName,
        customerEmail: dto.customerEmail ?? null,
        customerPhone: dto.customerPhone,
        totalAmount: totalAmount.toString(),
      });
    }

    // Create the account after the order exists. If this fails the order still stands.
    let account: CheckoutAccount | null = null;
    let accountError: string | null = null;
    if (wantsAccount && dto.accountPassword) {
      const nameParts = dto.customerName.trim().split(/\s+/);
      try {
        account = await this.storefrontAuth.createAccountForOrder(organizationId, {
          orderId: order.id,
          customerId,
          email: dto.customerEmail,
          password: dto.accountPassword,
          firstName: nameParts[0] ?? dto.customerName,
          lastName: nameParts.slice(1).join(' ') || '-',
          phone: dto.customerPhone,
        });
      } catch (err) {
        this.logger.warn(`Checkout account creation failed for order ${order.reference}: ${(err as Error).message}`);
        accountError = 'Your order was placed, but we could not create your account. You can register later.';
      }
    }

    return publicResponse({
      orderId: order.id,
      reference: order.reference,
      totalAmount: totalAmount.toString(),
      discountAmount: discountAmount.toString(),
      giftCardAmount: giftCardAmount.toString(),
      amountDue: amountDue.toString(),
      status: order.status,
      payment: (paystack
        ? {
            provider: 'paystack',
            reference: paystack.reference,
            accessCode: paystack.accessCode,
            authorizationUrl: paystack.authorizationUrl,
          }
        : null) as PublicCardPayment | null,
      linkedToAccount: !!loggedInAccountId || !!account,
      account,
      accountError,
    });
  }

  /** Storefront calls this after the Paystack popup reports success (or on return from Paystack). */
  async verifyPaystackPayment(organizationId: string, reference: string) {
    const result = await this.paystackService.verifyAndConfirm(reference, organizationId);
    if (result.status === 'not_found') throw new NotFoundException('Payment not found');
    return publicResponse(result);
  }

  async getPaymentConfig() {
    return publicResponse({ paystackEnabled: await this.paystackService.isConfigured() });
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
