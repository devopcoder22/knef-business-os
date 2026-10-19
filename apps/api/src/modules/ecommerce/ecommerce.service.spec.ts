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
}

function makePrismaMock(): MockPrisma {
  return {
    salesOrder: { findFirst: fn(), create: fn() },
    customer: { findFirst: fn(), create: fn() },
    location: { findFirst: fn() },
    product: { findFirst: fn() },
    productVariant: { findFirst: fn() },
    inventoryLevel: { findFirst: fn() },
    user: { findFirst: fn() },
    payment: { create: fn() },
  };
}

describe('EcommerceService.createPublicOrder — server-authoritative totals', () => {
  let prisma: MockPrisma;
  let service: EcommerceService;

  beforeEach(() => {
    prisma = makePrismaMock();
    const inventory: Partial<InventoryService> = {};
    const eventEmitter = { emit: jest.fn() } as never;
    service = new EcommerceService(
      prisma as unknown as PrismaService,
      inventory as InventoryService,
      eventEmitter,
    );

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
