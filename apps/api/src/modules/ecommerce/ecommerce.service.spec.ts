/**
 * EcommerceService — public order security tests
 *
 * Verifies that the public checkout endpoint is server-authoritative for all
 * monetary values and that forged client input cannot reduce the order total.
 *
 *   A. Negative deliveryFee is rejected at the DTO layer (not whitelisted)
 *   B. Forged totalAmount is rejected at the DTO layer
 *   C. Forged unitPrice is rejected at the DTO layer
 *   D. Normal CASH checkout succeeds with a server-computed total
 *   E. Idempotency: same key returns the same orderId and creates one order
 */

import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { Prisma, OrderStatus } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreatePublicOrderDto,
  PublicOrderItemDto,
} from './dto/create-public-order.dto';
import { EcommerceService } from './ecommerce.service';
import type { PrismaService } from '../../common/services/prisma.service';
import type { InventoryService } from '../inventory/inventory.service';

const ORG_ID = 'org-sec-001';
const LOCATION_ID = 'loc-sec-001';
const CUSTOMER_ID = 'cust-sec-001';
const USER_ID = 'user-sec-001';
const PRODUCT_ID = 'prod-sec-001';

const CLIENT_CHANNEL_GLOBAL_PIPE = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

function validBasePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    customerEmail: 'buyer@example.com',
    customerName: 'Buyer Name',
    customerPhone: '+2348000000001',
    locationId: LOCATION_ID,
    items: [{ productId: PRODUCT_ID, quantity: 1 }],
    paymentMethod: 'CASH',
    ...overrides,
  };
}

// ── A/B/C: DTO-level rejection of forged monetary fields ─────────────────────

describe('CreatePublicOrderDto — forbidNonWhitelisted enforcement', () => {
  async function runGlobalPipe(payload: unknown) {
    return CLIENT_CHANNEL_GLOBAL_PIPE.transform(payload, {
      type: 'body',
      metatype: CreatePublicOrderDto,
      data: '',
    });
  }

  it('A. rejects a client-supplied negative deliveryFee', async () => {
    await expect(
      runGlobalPipe(validBasePayload({ deliveryFee: '-500000' })),
    ).rejects.toThrow(BadRequestException);
  });

  it('A. rejects a client-supplied positive deliveryFee (field not allowed at all)', async () => {
    await expect(
      runGlobalPipe(validBasePayload({ deliveryFee: '1500' })),
    ).rejects.toThrow(BadRequestException);
  });

  it('B. rejects a client-supplied totalAmount', async () => {
    await expect(
      runGlobalPipe(validBasePayload({ totalAmount: '0.01' })),
    ).rejects.toThrow(BadRequestException);
  });

  it('C. rejects a client-supplied unitPrice on a line item', async () => {
    // Line items only allow productId / variantId / quantity. unitPrice is forbidden.
    const payload = validBasePayload({
      items: [{ productId: PRODUCT_ID, quantity: 1, unitPrice: '0.01' }],
    });
    // The nested DTO is also whitelisted — any extra field triggers rejection.
    await expect(runGlobalPipe(payload)).rejects.toThrow(BadRequestException);
  });

  it('accepts a well-formed payload with no monetary fields', async () => {
    const transformed = (await runGlobalPipe(
      validBasePayload({ idempotencyKey: 'k-ok-001' }),
    )) as CreatePublicOrderDto;
    expect(transformed.customerEmail).toBe('buyer@example.com');
    expect(transformed.items[0]).toBeInstanceOf(PublicOrderItemDto);
    expect((transformed as unknown as Record<string, unknown>).deliveryFee).toBeUndefined();
    expect((transformed as unknown as Record<string, unknown>).totalAmount).toBeUndefined();
  });

  it('class-validator rejects deliveryFee at validate() layer too (field is unknown)', async () => {
    const instance = plainToInstance(CreatePublicOrderDto, validBasePayload({ deliveryFee: '100' }));
    const errors = await validate(instance, { forbidNonWhitelisted: true, whitelist: true });
    // Expect at least one error on the deliveryFee property
    const flat = errors.map((e) => e.property);
    expect(flat).toContain('deliveryFee');
  });
});

// ── D/E: service-level behaviour (server-computed totals + idempotency) ──────

type AnyMock = jest.Mock & { mockResolvedValue: (v: unknown) => AnyMock };
function fn(): AnyMock {
  return jest.fn() as unknown as AnyMock;
}

interface MockPrisma {
  salesOrder: {
    findFirst: AnyMock;
    create: AnyMock;
  };
  customer: {
    findFirst: AnyMock;
    create: AnyMock;
  };
  location: { findFirst: AnyMock };
  product: { findFirst: AnyMock };
  productVariant: { findFirst: AnyMock };
  inventoryLevel: { findFirst: AnyMock };
  user: { findFirst: AnyMock };
  payment: { create: AnyMock };
  discountCodeUsage: { create: AnyMock };
  giftCard: { updateMany: AnyMock };
  giftCardRedemption: { create: AnyMock };
  $executeRaw: AnyMock;
  $transaction: AnyMock;
}

function makePrismaMock(): MockPrisma {
  const m = {
    salesOrder: { findFirst: fn(), create: fn() },
    customer: { findFirst: fn(), create: fn() },
    location: { findFirst: fn() },
    product: { findFirst: fn() },
    productVariant: { findFirst: fn() },
    inventoryLevel: { findFirst: fn() },
    user: { findFirst: fn() },
    payment: { create: fn() },
    discountCodeUsage: { create: fn() },
    giftCard: { updateMany: fn() },
    giftCardRedemption: { create: fn() },
    $executeRaw: fn(),
    $transaction: fn(),
  } as MockPrisma;
  // Interactive transaction: run the callback against the same mock client
  m.$transaction.mockImplementation(async (cb: (tx: MockPrisma) => unknown) => cb(m));
  return m;
}

function makeDeps() {
  return {
    eventEmitter: { emit: jest.fn() },
    discount: { validate: jest.fn() },
    giftCards: { validate: jest.fn() },
    paystack: { initialize: jest.fn(), isConfigured: jest.fn(), verifyAndConfirm: jest.fn() },
    auth: {
      resolveAccountIdFromToken: jest.fn().mockResolvedValue(null),
      emailHasAccount: jest.fn().mockResolvedValue(false),
      createAccountForOrder: jest.fn(),
    },
  };
}

function makeService(prisma: MockPrisma, deps: ReturnType<typeof makeDeps>) {
  const inventory: Partial<InventoryService> = {};
  return new EcommerceService(
    prisma as unknown as PrismaService,
    inventory as InventoryService,
    deps.eventEmitter as never,
    { get: () => undefined } as never,
    { resolve: jest.fn().mockResolvedValue(null) } as never,
    deps.discount as never,
    deps.giftCards as never,
    deps.paystack as never,
    deps.auth as never,
  );
}

describe('EcommerceService.createPublicOrder — server-authoritative totals', () => {
  let prisma: MockPrisma;
  let service: EcommerceService;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = makeService(prisma, makeDeps());

    // Common happy-path mocks
    prisma.salesOrder.findFirst.mockResolvedValue(null); // no idempotency hit by default
    prisma.customer.findFirst.mockResolvedValue({
      id: CUSTOMER_ID,
      organizationId: ORG_ID,
      firstName: 'Buyer',
      lastName: 'Name',
      email: 'buyer@example.com',
      phone: '+2348000000001',
    });
    prisma.location.findFirst.mockResolvedValue({
      id: LOCATION_ID,
      organizationId: ORG_ID,
      isActive: true,
    });
    prisma.product.findFirst.mockResolvedValue({
      id: PRODUCT_ID,
      organizationId: ORG_ID,
      name: 'Widget',
      status: 'ACTIVE',
      trackInventory: false,
      sellingPrice: new Prisma.Decimal('5000'),
      costPrice: new Prisma.Decimal('2000'),
    });
    prisma.user.findFirst.mockResolvedValue({ id: USER_ID });
    prisma.payment.create.mockResolvedValue({ id: 'pay-1' });
  });

  it('D. normal CASH checkout succeeds with server-computed total = Σ(unitPrice × qty) + 0 fee', async () => {
    prisma.salesOrder.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'order-1',
      reference: data.reference as string,
      totalAmount: new Prisma.Decimal(data.totalAmount as string),
      status: data.status as OrderStatus,
    }));

    const dto: CreatePublicOrderDto = {
      customerEmail: 'buyer@example.com',
      customerName: 'Buyer Name',
      customerPhone: '+2348000000001',
      locationId: LOCATION_ID,
      items: [{ productId: PRODUCT_ID, quantity: 2 }],
      paymentMethod: 'CASH',
      deliveryMethod: 'PICKUP',
    };

    const result = await service.createPublicOrder(ORG_ID, dto);

    // Server-computed total: 2 × 5000 + 0 = 10000.00
    expect(result.data).toMatchObject({
      orderId: 'order-1',
      totalAmount: '10000',
      status: 'CONFIRMED',
    });

    // Delivery fee passed into prisma must be the server-computed value, not any client input
    const createCall = prisma.salesOrder.create.mock.calls[0][0] as {
      data: { deliveryFee: string; totalAmount: string; subtotal: string };
    };
    expect(createCall.data.deliveryFee).toBe('0');
    expect(createCall.data.subtotal).toBe('10000');
    expect(createCall.data.totalAmount).toBe('10000');
  });

  it('D. DELIVERY method still produces a server-computed total (0 under current policy)', async () => {
    prisma.salesOrder.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'order-del-1',
      reference: data.reference as string,
      totalAmount: new Prisma.Decimal(data.totalAmount as string),
      status: data.status as OrderStatus,
    }));

    const result = await service.createPublicOrder(ORG_ID, {
      customerEmail: 'buyer@example.com',
      customerName: 'Buyer Name',
      customerPhone: '+2348000000001',
      locationId: LOCATION_ID,
      items: [{ productId: PRODUCT_ID, quantity: 1 }],
      paymentMethod: 'CASH',
      deliveryMethod: 'DELIVERY',
      deliveryAddress: '1 Test Rd',
    });

    expect(result.data.totalAmount).toBe('5000');
    const createCall = prisma.salesOrder.create.mock.calls[0][0] as {
      data: { deliveryFee: string };
    };
    expect(createCall.data.deliveryFee).toBe('0');
  });

  it('E. idempotency: same idempotencyKey returns the same orderId and creates only one order', async () => {
    const existingOrder = {
      id: 'order-idem-1',
      reference: 'WEB-20261014-ABCD',
      totalAmount: new Prisma.Decimal('5000'),
      status: OrderStatus.CONFIRMED,
    };

    // First call: no existing order → creates it
    prisma.salesOrder.findFirst
      .mockResolvedValueOnce(null) // idempotency check
      .mockResolvedValueOnce(existingOrder); // second call: idempotency hit
    prisma.salesOrder.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: existingOrder.id,
      reference: data.reference as string,
      totalAmount: new Prisma.Decimal(data.totalAmount as string),
      status: data.status as OrderStatus,
    }));

    const dto: CreatePublicOrderDto = {
      customerEmail: 'buyer@example.com',
      customerName: 'Buyer Name',
      customerPhone: '+2348000000001',
      locationId: LOCATION_ID,
      items: [{ productId: PRODUCT_ID, quantity: 1 }],
      paymentMethod: 'CASH',
      idempotencyKey: 'idem-key-123',
    };

    const first = await service.createPublicOrder(ORG_ID, dto);
    const second = await service.createPublicOrder(ORG_ID, dto);

    expect(first.data.orderId).toBe(existingOrder.id);
    expect(second.data.orderId).toBe(existingOrder.id);

    // salesOrder.create called exactly once across the two requests
    expect(prisma.salesOrder.create).toHaveBeenCalledTimes(1);
  });
});

// ── F–K: coupons, gift cards, Paystack and accounts ──────────────────────────

describe('EcommerceService.createPublicOrder — discounts, card payments and accounts', () => {
  let prisma: MockPrisma;
  let deps: ReturnType<typeof makeDeps>;
  let service: EcommerceService;

  const baseDto = (overrides: Partial<CreatePublicOrderDto> = {}): CreatePublicOrderDto => ({
    customerEmail: 'buyer@example.com',
    customerName: 'Ada Buyer',
    customerPhone: '+2348000000001',
    locationId: LOCATION_ID,
    items: [{ productId: PRODUCT_ID, quantity: 2 }], // 2 × 5000 = 10000
    paymentMethod: 'CASH',
    ...overrides,
  });

  beforeEach(() => {
    prisma = makePrismaMock();
    deps = makeDeps();
    service = makeService(prisma, deps);

    prisma.salesOrder.findFirst.mockResolvedValue(null);
    prisma.customer.findFirst.mockResolvedValue({ id: CUSTOMER_ID, email: 'buyer@example.com' });
    prisma.location.findFirst.mockResolvedValue({ id: LOCATION_ID, isActive: true });
    prisma.product.findFirst.mockResolvedValue({
      id: PRODUCT_ID,
      name: 'Widget',
      status: 'ACTIVE',
      trackInventory: false,
      sellingPrice: new Prisma.Decimal('5000'),
      costPrice: new Prisma.Decimal('2000'),
    });
    prisma.user.findFirst.mockResolvedValue({ id: USER_ID });
    prisma.payment.create.mockResolvedValue({ id: 'pay-1' });
    prisma.salesOrder.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'order-1',
      reference: data.reference as string,
      totalAmount: new Prisma.Decimal(data.totalAmount as string),
      status: data.status as OrderStatus,
    }));
  });

  it('F. coupon is priced on the server and recorded once', async () => {
    deps.discount.validate.mockResolvedValue({ valid: true, discountAmount: 1500, discountCode: { id: 'dc-1' } });
    prisma.$executeRaw.mockResolvedValue(1);

    const res = await service.createPublicOrder(ORG_ID, baseDto({ couponCode: 'save15' }));

    expect(deps.discount.validate).toHaveBeenCalledWith(ORG_ID, 'save15', 10000, 'buyer@example.com');
    expect(res.data).toMatchObject({ totalAmount: '8500', discountAmount: '1500', amountDue: '8500' });
    const order = prisma.salesOrder.create.mock.calls[0][0] as { data: { discountAmount: string } };
    expect(order.data.discountAmount).toBe('1500');
    expect(prisma.discountCodeUsage.create).toHaveBeenCalledTimes(1);
  });

  it('F. coupon that hit its usage limit concurrently rejects the order', async () => {
    deps.discount.validate.mockResolvedValue({ valid: true, discountAmount: 1500, discountCode: { id: 'dc-1' } });
    prisma.$executeRaw.mockResolvedValue(0);
    await expect(service.createPublicOrder(ORG_ID, baseDto({ couponCode: 'SAVE15' }))).rejects.toThrow(
      'usage limit',
    );
  });

  it('G. gift card covers part of the total and is debited conditionally', async () => {
    deps.giftCards.validate.mockResolvedValue({ remainingAmount: new Prisma.Decimal('3000'), giftCard: { id: 'gc-1' } });
    prisma.giftCard.updateMany.mockResolvedValue({ count: 1 });

    const res = await service.createPublicOrder(ORG_ID, baseDto({ giftCardCode: 'gc-abcd' }));

    expect(deps.giftCards.validate).toHaveBeenCalledWith(ORG_ID, 'GC-ABCD');
    expect(res.data).toMatchObject({ totalAmount: '10000', giftCardAmount: '3000', amountDue: '7000' });
    const debit = prisma.giftCard.updateMany.mock.calls[0][0] as {
      where: { remainingAmount: { gte: Prisma.Decimal } };
    };
    expect(debit.where.remainingAmount.gte.toString()).toBe('3000');
    // Gift card payment (completed) + remaining balance (pending)
    expect(prisma.payment.create).toHaveBeenCalledTimes(2);
  });

  it('H. Paystack: server initializes the transaction, order waits in DRAFT, no confirmation yet', async () => {
    deps.paystack.initialize.mockResolvedValue({
      accessCode: 'ac_123',
      authorizationUrl: 'https://checkout.paystack.com/ac_123',
    });

    const res = await service.createPublicOrder(ORG_ID, baseDto({ paymentMethod: 'PAYSTACK' }));

    const init = deps.paystack.initialize.mock.calls[0][0] as { amountKobo: number; reference: string };
    expect(init.amountKobo).toBe(1_000_000); // server-computed, in kobo
    expect(init.reference).toMatch(/^KNEF-[0-9A-F]{20}$/);
    expect(res.data.status).toBe(OrderStatus.DRAFT);
    expect(res.data.payment).toMatchObject({ provider: 'paystack', accessCode: 'ac_123', reference: init.reference });
    const pay = prisma.payment.create.mock.calls[0][0] as {
      data: { status: string; gatewayRef: string; method: string };
    };
    expect(pay.data).toMatchObject({ method: 'PAYSTACK', status: 'PENDING', gatewayRef: init.reference });
    expect(deps.eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('H. Paystack init failure creates nothing', async () => {
    deps.paystack.initialize.mockRejectedValue(new Error('provider down'));
    await expect(service.createPublicOrder(ORG_ID, baseDto({ paymentMethod: 'PAYSTACK' }))).rejects.toThrow();
    expect(prisma.salesOrder.create).not.toHaveBeenCalled();
  });

  it('H. gift card covering the full total skips Paystack and confirms the order', async () => {
    deps.giftCards.validate.mockResolvedValue({ remainingAmount: new Prisma.Decimal('50000'), giftCard: { id: 'gc-1' } });
    prisma.giftCard.updateMany.mockResolvedValue({ count: 1 });

    const res = await service.createPublicOrder(ORG_ID, baseDto({ paymentMethod: 'PAYSTACK', giftCardCode: 'GC-1' }));

    expect(deps.paystack.initialize).not.toHaveBeenCalled();
    expect(res.data).toMatchObject({ status: OrderStatus.CONFIRMED, amountDue: '0', payment: null });
  });

  it('I. logged-in customer: order is linked from the verified token only', async () => {
    deps.auth.resolveAccountIdFromToken.mockResolvedValue('acct-1');

    const res = await service.createPublicOrder(ORG_ID, baseDto(), 'customer.jwt');

    expect(deps.auth.resolveAccountIdFromToken).toHaveBeenCalledWith('customer.jwt', ORG_ID);
    const order = prisma.salesOrder.create.mock.calls[0][0] as { data: { customerAccountId?: string } };
    expect(order.data.customerAccountId).toBe('acct-1');
    expect(res.data.linkedToAccount).toBe(true);
  });

  it('I. invalid token falls back to a guest order', async () => {
    const res = await service.createPublicOrder(ORG_ID, baseDto(), 'bad.jwt');
    const order = prisma.salesOrder.create.mock.calls[0][0] as { data: { customerAccountId?: string } };
    expect(order.data.customerAccountId).toBeUndefined();
    expect(res.data.linkedToAccount).toBe(false);
  });

  it('J. guest can create an account at checkout; tokens are returned', async () => {
    deps.auth.createAccountForOrder.mockResolvedValue({ accessToken: 'a', refreshToken: 'r', customer: { id: 'acct-9' } });

    const res = await service.createPublicOrder(
      ORG_ID,
      baseDto({ createAccount: true, accountPassword: 'secret123' }),
    );

    expect(deps.auth.createAccountForOrder).toHaveBeenCalledWith(
      ORG_ID,
      expect.objectContaining({
        orderId: 'order-1',
        customerId: CUSTOMER_ID,
        email: 'buyer@example.com',
        firstName: 'Ada',
        lastName: 'Buyer',
      }),
    );
    expect(res.data).toMatchObject({ linkedToAccount: true, account: { accessToken: 'a' }, accountError: null });
  });

  it('J. existing account email is rejected before any order is created', async () => {
    deps.auth.emailHasAccount.mockResolvedValue(true);
    await expect(
      service.createPublicOrder(ORG_ID, baseDto({ createAccount: true, accountPassword: 'secret123' })),
    ).rejects.toThrow('already exists');
    expect(prisma.salesOrder.create).not.toHaveBeenCalled();
  });

  it('K. account creation failure after the order does not fail the order', async () => {
    deps.auth.createAccountForOrder.mockRejectedValue(new Error('db hiccup'));
    const res = await service.createPublicOrder(
      ORG_ID,
      baseDto({ createAccount: true, accountPassword: 'secret123' }),
    );
    expect(res.data.reference).toBeDefined();
    expect(res.data.account).toBeNull();
    expect(res.data.accountError).toMatch(/could not create your account/);
  });
});

describe('CreatePublicOrderDto — client cannot choose the linked account', () => {
  it('rejects a client-supplied customerAccountId', async () => {
    await expect(
      CLIENT_CHANNEL_GLOBAL_PIPE.transform(validBasePayload({ customerAccountId: 'someone-else' }), {
        type: 'body',
        metatype: CreatePublicOrderDto,
        data: '',
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
