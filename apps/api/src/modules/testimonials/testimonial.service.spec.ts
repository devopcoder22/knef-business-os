/**
 * TestimonialService — unit tests
 *
 * Coverage:
 *  1.  list returns all testimonials ordered by displayOrder
 *  2.  create with valid data creates testimonial
 *  3.  create with rating > 5 throws BadRequestException
 *  4.  create with rating < 1 throws BadRequestException
 *  5.  create with rating = null is allowed
 *  6.  update throws NotFoundException for wrong org
 *  7.  setActive(true) sets isActive = true
 *  8.  setActive(false) sets isActive = false
 *  9.  remove deletes the record
 * 10.  listPublic returns only isActive=true records
 * 11.  listPublic does NOT return isActive=false records
 * 12.  listPublic does NOT return internal fields (createdBy)
 * 13.  reorder updates displayOrder for multiple items
 * 14.  XSS script tags in customerName are stripped
 */

import { NotFoundException, BadRequestException } from '@nestjs/common';
import { TestimonialService } from './testimonial.service';
import type { AuditService } from '../audit/audit.service';

// ── Helpers ──────────────────────────────────────────────────────────────────

const ORG = 'org-test-1';
const USER = 'user-test-1';

function makeAudit(): AuditService {
  return { log: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
}

/**
 * Build a minimal fake prisma that exercises the StorefrontTestimonial model.
 * Each method is independently overridable via the `overrides` map.
 */
function makePrisma(overrides: {
  findMany?: jest.Mock;
  findFirst?: jest.Mock;
  create?: jest.Mock;
  update?: jest.Mock;
  updateMany?: jest.Mock;
  delete?: jest.Mock;
} = {}) {
  const model = {
    findMany: overrides.findMany ?? jest.fn().mockResolvedValue([]),
    findFirst: overrides.findFirst ?? jest.fn().mockResolvedValue(null),
    create: overrides.create ?? jest.fn().mockResolvedValue({}),
    update: overrides.update ?? jest.fn().mockResolvedValue({}),
    updateMany: overrides.updateMany ?? jest.fn().mockResolvedValue({ count: 1 }),
    delete: overrides.delete ?? jest.fn().mockResolvedValue({}),
  };

  return {
    storefrontTestimonial: model,
  };
}

function buildService(prismaOverrides = {}, auditOverride?: AuditService) {
  const prisma = makePrisma(prismaOverrides);
  const audit = auditOverride ?? makeAudit();
  return {
    svc: new TestimonialService(prisma as never, audit),
    prisma,
    audit,
  };
}

// ── Seed data ────────────────────────────────────────────────────────────────

const TESTIMONIAL_ACTIVE = {
  id: 'test-1',
  organizationId: ORG,
  customerName: 'Alice',
  quote: 'Great product!',
  rating: 5,
  location: 'Lagos',
  productName: 'Widget Pro',
  avatarUrl: null,
  displayOrder: 1,
  isActive: true,
  createdBy: USER,
  updatedBy: USER,
  createdAt: new Date('2026-10-01'),
  updatedAt: new Date('2026-10-01'),
};

const TESTIMONIAL_INACTIVE = {
  ...TESTIMONIAL_ACTIVE,
  id: 'test-2',
  customerName: 'Bob',
  displayOrder: 2,
  isActive: false,
};

// ── 1: list ──────────────────────────────────────────────────────────────────

describe('TestimonialService — list', () => {
  it('1: returns all testimonials ordered by displayOrder', async () => {
    const rows = [TESTIMONIAL_ACTIVE, TESTIMONIAL_INACTIVE];
    const findMany = jest.fn().mockResolvedValue(rows);
    const { svc } = buildService({ findMany });

    const result = await svc.list(ORG);

    expect(result.data).toEqual(rows);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: ORG },
        orderBy: { displayOrder: 'asc' },
      }),
    );
  });
});

// ── 2–5: create ──────────────────────────────────────────────────────────────

describe('TestimonialService — create', () => {
  it('2: valid data creates a testimonial', async () => {
    const created = { ...TESTIMONIAL_ACTIVE };
    const createMock = jest.fn().mockResolvedValue(created);
    const { svc, audit } = buildService({ create: createMock });

    const result = await svc.create(
      ORG,
      { customerName: 'Alice', quote: 'Great product!', rating: 5 },
      USER,
    );

    expect(result.data).toEqual(created);
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'TESTIMONIAL_CREATED', organizationId: ORG }),
    );
  });

  it('3: rating > 5 throws BadRequestException', async () => {
    const { svc } = buildService();
    await expect(
      svc.create(ORG, { customerName: 'Alice', quote: 'Great!', rating: 6 }, USER),
    ).rejects.toThrow(BadRequestException);
  });

  it('4: rating < 1 throws BadRequestException', async () => {
    const { svc } = buildService();
    await expect(
      svc.create(ORG, { customerName: 'Alice', quote: 'Great!', rating: 0 }, USER),
    ).rejects.toThrow(BadRequestException);
  });

  it('5: rating = null is allowed', async () => {
    const created = { ...TESTIMONIAL_ACTIVE, rating: null };
    const createMock = jest.fn().mockResolvedValue(created);
    const { svc } = buildService({ create: createMock });

    const result = await svc.create(
      ORG,
      { customerName: 'Alice', quote: 'Great product!', rating: null },
      USER,
    );

    expect(result.data.rating).toBeNull();
    expect(createMock).toHaveBeenCalledTimes(1);
  });
});

// ── 6: update ────────────────────────────────────────────────────────────────

describe('TestimonialService — update', () => {
  it('6: throws NotFoundException for wrong org (findFirst returns null)', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const { svc } = buildService({ findFirst });

    await expect(
      svc.update('other-org', TESTIMONIAL_ACTIVE.id, { quote: 'New quote' }, USER),
    ).rejects.toThrow(NotFoundException);
  });
});

// ── 7–8: setActive ───────────────────────────────────────────────────────────

describe('TestimonialService — setActive', () => {
  it('7: setActive(true) sets isActive = true', async () => {
    const findFirst = jest.fn().mockResolvedValue(TESTIMONIAL_INACTIVE);
    const updated = { ...TESTIMONIAL_INACTIVE, isActive: true };
    const update = jest.fn().mockResolvedValue(updated);
    const { svc, audit } = buildService({ findFirst, update });

    const result = await svc.setActive(ORG, TESTIMONIAL_INACTIVE.id, true, USER);

    expect(result.data.isActive).toBe(true);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isActive: true }),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'TESTIMONIAL_ACTIVATED' }),
    );
  });

  it('8: setActive(false) sets isActive = false', async () => {
    const findFirst = jest.fn().mockResolvedValue(TESTIMONIAL_ACTIVE);
    const updated = { ...TESTIMONIAL_ACTIVE, isActive: false };
    const update = jest.fn().mockResolvedValue(updated);
    const { svc, audit } = buildService({ findFirst, update });

    const result = await svc.setActive(ORG, TESTIMONIAL_ACTIVE.id, false, USER);

    expect(result.data.isActive).toBe(false);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'TESTIMONIAL_DEACTIVATED' }),
    );
  });
});

// ── 9: remove ────────────────────────────────────────────────────────────────

describe('TestimonialService — remove', () => {
  it('9: remove deletes the record', async () => {
    const findFirst = jest.fn().mockResolvedValue(TESTIMONIAL_ACTIVE);
    const deleteMock = jest.fn().mockResolvedValue(TESTIMONIAL_ACTIVE);
    const { svc, audit } = buildService({ findFirst, delete: deleteMock });

    const result = await svc.remove(ORG, TESTIMONIAL_ACTIVE.id, USER);

    expect(result.data.deleted).toBe(true);
    expect(deleteMock).toHaveBeenCalledWith({ where: { id: TESTIMONIAL_ACTIVE.id } });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'TESTIMONIAL_DELETED' }),
    );
  });
});

// ── 10–12: listPublic ────────────────────────────────────────────────────────

describe('TestimonialService — listPublic', () => {
  const PUBLIC_FIELDS = {
    id: TESTIMONIAL_ACTIVE.id,
    customerName: TESTIMONIAL_ACTIVE.customerName,
    quote: TESTIMONIAL_ACTIVE.quote,
    rating: TESTIMONIAL_ACTIVE.rating,
    location: TESTIMONIAL_ACTIVE.location,
    productName: TESTIMONIAL_ACTIVE.productName,
    avatarUrl: TESTIMONIAL_ACTIVE.avatarUrl,
    displayOrder: TESTIMONIAL_ACTIVE.displayOrder,
  };

  it('10: listPublic returns only isActive=true records', async () => {
    const findMany = jest.fn().mockResolvedValue([PUBLIC_FIELDS]);
    const { svc } = buildService({ findMany });

    const result = await svc.listPublic(ORG);

    expect(result.data).toHaveLength(1);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: ORG, isActive: true },
      }),
    );
  });

  it('11: listPublic does NOT return isActive=false records', async () => {
    // Simulate DB filtering: findMany only returns active rows
    const findMany = jest.fn().mockResolvedValue([]);
    const { svc } = buildService({ findMany });

    const result = await svc.listPublic(ORG);

    // The query must filter by isActive: true
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isActive: true }),
      }),
    );
    expect(result.data).toHaveLength(0);
  });

  it('12: listPublic does NOT return internal fields (createdBy)', async () => {
    const findMany = jest.fn().mockResolvedValue([PUBLIC_FIELDS]);
    const { svc } = buildService({ findMany });

    const result = await svc.listPublic(ORG);

    // The select clause passed to Prisma must NOT include createdBy
    const call = findMany.mock.calls[0][0] as { select: Record<string, unknown> };
    expect(call.select).not.toHaveProperty('createdBy');
    expect(call.select).not.toHaveProperty('updatedBy');
    expect(call.select).not.toHaveProperty('organizationId');

    // And the returned record should not have those fields either
    const row = result.data[0] as Record<string, unknown>;
    expect(row).not.toHaveProperty('createdBy');
    expect(row).not.toHaveProperty('organizationId');
  });
});

// ── 13: reorder ──────────────────────────────────────────────────────────────

describe('TestimonialService — reorder', () => {
  it('13: reorder updates displayOrder for multiple items', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const { svc, audit } = buildService({ updateMany });

    const items = [
      { id: 'test-1', displayOrder: 2 },
      { id: 'test-2', displayOrder: 1 },
    ];

    const result = await svc.reorder(ORG, items, USER);

    expect(updateMany).toHaveBeenCalledTimes(2);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'test-1', organizationId: ORG },
        data: expect.objectContaining({ displayOrder: 2 }),
      }),
    );
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'test-2', organizationId: ORG },
        data: expect.objectContaining({ displayOrder: 1 }),
      }),
    );
    expect(result.data.updated).toBe(2);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'TESTIMONIALS_REORDERED' }),
    );
  });
});

// ── 14: XSS sanitization ────────────────────────────────────────────────────

describe('TestimonialService — XSS sanitization', () => {
  it('14: script tags in customerName are stripped on create', async () => {
    const createMock = jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'test-xss',
      ...data,
    }));
    const { svc } = buildService({ create: createMock });

    await svc.create(
      ORG,
      {
        customerName: 'Alice<script>alert("xss")</script>',
        quote: 'Great!',
      },
      USER,
    );

    const passedData = createMock.mock.calls[0][0].data as Record<string, unknown>;
    expect(passedData['customerName']).not.toContain('<script>');
    expect(passedData['customerName']).not.toContain('alert');
    // The plain text part should be preserved
    expect(passedData['customerName']).toContain('Alice');
  });
});
