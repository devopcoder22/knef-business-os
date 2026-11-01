/**
 * Stage 18 — CRM Service: Customer Metrics, Segmentation, Notes, Tags, Timeline
 *
 * Coverage:
 *  1.  getMetrics — zero orders customer returns null dates, null frequency
 *  2.  getMetrics — single completed order sets firstPurchaseDate = latestPurchaseDate
 *  3.  getMetrics — two completed orders produces REPEAT segment + purchaseFrequency
 *  4.  getMetrics — outstanding balance produces OUTSTANDING_BALANCE segment
 *  5.  getMetrics — throws NotFoundException for customer not in org
 *  6.  segment NEW — customer created within 30 days
 *  7.  segment ACTIVE — last purchase within 60 days
 *  8.  segment AT_RISK — last purchase 61–180 days ago with prior orders
 *  9.  segment INACTIVE — no purchase and customer older than 30 days
 * 10.  segment HIGH_VALUE — totalSalesValue >= 100,000 NGN
 * 11.  listNotes — returns notes scoped to org+customer
 * 12.  addNote — creates note with correct content and createdBy
 * 13.  deleteNote — author can delete own note
 * 14.  deleteNote — non-author gets ForbiddenException
 * 15.  deleteNote — throws NotFoundException for unknown note
 * 16.  listOrgTags — returns tags scoped to org
 * 17.  createTag — creates tag with default color when none provided
 * 18.  createTag — throws ConflictException when name already exists in org
 * 19.  assignTag — idempotent: returns existing assignment if already assigned
 * 20.  assignTag — throws NotFoundException when tag belongs to different org
 * 21.  removeTag — throws NotFoundException when assignment not found
 * 22.  getTimeline — events sorted newest-first with correct types
 * 23.  getTimeline — CUSTOMER_CREATED event always present at customer.createdAt
 * 24.  getTimeline — throws NotFoundException for customer not in org
 */

import {
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CustomersService } from './customers.service';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeEventEmitter() {
  return { emit: jest.fn() } as unknown as EventEmitter2;
}

const ORG = 'org-1';
const CUST_ID = 'cust-1';

const BASE_CUSTOMER = {
  id: CUST_ID,
  createdAt: new Date('2026-09-01'),
  outstandingBalance: '0',
  totalSpent: '0',
};

function makePrismaForMetrics(opts: {
  customer?: object | null;
  orders?: object[];
  payments?: object[];
}) {
  return {
    customer: {
      findFirst: jest.fn(async () => ('customer' in opts ? opts.customer : BASE_CUSTOMER)),
    },
    salesOrder: {
      findMany: jest.fn(async () => opts.orders ?? []),
    },
    payment: {
      findMany: jest.fn(async () => opts.payments ?? []),
    },
  };
}

// ── 1–5: getMetrics ────────────────────────────────────────────────────────────

describe('CustomersService — getMetrics', () => {
  it('1: zero orders → null dates and null frequency', async () => {
    const prisma = makePrismaForMetrics({});
    const svc = new CustomersService(prisma as never, makeEventEmitter());
    const { data } = await svc.getMetrics(ORG, CUST_ID);
    expect(data.orderCount).toBe(0);
    expect(data.firstPurchaseDate).toBeNull();
    expect(data.latestPurchaseDate).toBeNull();
    expect(data.purchaseFrequencyPerMonth).toBeNull();
    expect(data.averageOrderValue).toBe(0);
  });

  it('2: single completed order → firstPurchaseDate equals latestPurchaseDate', async () => {
    const orderDate = new Date('2026-09-15');
    const prisma = makePrismaForMetrics({
      orders: [
        { id: 'so-1', status: 'COMPLETED', totalAmount: '5000', paidAmount: '5000', createdAt: orderDate, completedAt: orderDate },
      ],
    });
    const svc = new CustomersService(prisma as never, makeEventEmitter());
    const { data } = await svc.getMetrics(ORG, CUST_ID);
    expect(data.completedOrders).toBe(1);
    expect(data.firstPurchaseDate).toEqual(orderDate);
    expect(data.latestPurchaseDate).toEqual(orderDate);
    expect(data.purchaseFrequencyPerMonth).toBeNull(); // needs >= 2 orders
  });

  it('3: two completed orders → REPEAT segment and frequency calculated', async () => {
    const d1 = new Date('2026-07-01');
    const d2 = new Date('2026-09-01');
    const prisma = makePrismaForMetrics({
      orders: [
        { id: 'so-1', status: 'COMPLETED', totalAmount: '20000', paidAmount: '20000', createdAt: d1, completedAt: d1 },
        { id: 'so-2', status: 'COMPLETED', totalAmount: '30000', paidAmount: '30000', createdAt: d2, completedAt: d2 },
      ],
    });
    const svc = new CustomersService(prisma as never, makeEventEmitter());
    const { data } = await svc.getMetrics(ORG, CUST_ID);
    expect(data.completedOrders).toBe(2);
    expect(data.segments).toContain('REPEAT');
    expect(data.purchaseFrequencyPerMonth).toBeGreaterThan(0);
    expect(data.totalSalesValue).toBe(50000);
    expect(data.averageOrderValue).toBe(25000);
  });

  it('4: outstanding balance > 0 → OUTSTANDING_BALANCE segment', async () => {
    const prisma = makePrismaForMetrics({
      customer: { ...BASE_CUSTOMER, outstandingBalance: '5000' },
    });
    const svc = new CustomersService(prisma as never, makeEventEmitter());
    const { data } = await svc.getMetrics(ORG, CUST_ID);
    expect(data.outstandingAmount).toBe(5000);
    expect(data.segments).toContain('OUTSTANDING_BALANCE');
  });

  it('5: throws NotFoundException when customer not in org', async () => {
    const prisma = makePrismaForMetrics({ customer: null });
    const svc = new CustomersService(prisma as never, makeEventEmitter());
    await expect(svc.getMetrics('org-other', CUST_ID)).rejects.toThrow(NotFoundException);
  });
});

// ── 6–10: Segmentation boundary cases ────────────────────────────────────────

describe('CustomersService — segmentation boundary cases', () => {
  const now = new Date('2026-10-05T12:00:00Z');

  function metricsBase(overrides: Partial<{
    customerCreatedAt: Date;
    daysSinceLastPurchase: number | null;
    completedOrders: number;
    totalSalesValue: number;
    outstandingAmount: number;
    firstPurchaseDate: Date | null;
    latestPurchaseDate: Date | null;
  }>) {
    const base = {
      orderCount: 0,
      completedOrders: 0,
      totalSalesValue: 0,
      totalAmountPaid: 0,
      outstandingAmount: 0,
      totalRefunds: 0,
      averageOrderValue: 0,
      firstPurchaseDate: null as Date | null,
      latestPurchaseDate: null as Date | null,
      daysSinceLastPurchase: null as number | null,
      purchaseFrequencyPerMonth: null as number | null,
      customerCreatedAt: new Date('2026-01-01'),
      ...overrides,
    };
    return base;
  }

  // Access private method via cast
  function callComputeSegments(svc: CustomersService, m: ReturnType<typeof metricsBase>) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (svc as any).computeSegmentsFromMetrics(m, now) as string[];
  }

  it('6: NEW — customer created 15 days ago (within 30-day window)', () => {
    const created = new Date(now.getTime() - 15 * 86_400_000);
    const prisma = makePrismaForMetrics({});
    const svc = new CustomersService(prisma as never, makeEventEmitter());
    const segs = callComputeSegments(svc, metricsBase({ customerCreatedAt: created }));
    expect(segs).toContain('NEW');
  });

  it('6b: NOT NEW — customer created 31 days ago with no first purchase', () => {
    const created = new Date(now.getTime() - 31 * 86_400_000);
    const prisma = makePrismaForMetrics({});
    const svc = new CustomersService(prisma as never, makeEventEmitter());
    const segs = callComputeSegments(svc, metricsBase({ customerCreatedAt: created }));
    expect(segs).not.toContain('NEW');
  });

  it('7: ACTIVE — last purchase 30 days ago (within 60-day window)', () => {
    const d = new Date(now.getTime() - 30 * 86_400_000);
    const prisma = makePrismaForMetrics({});
    const svc = new CustomersService(prisma as never, makeEventEmitter());
    const segs = callComputeSegments(svc, metricsBase({
      customerCreatedAt: new Date('2025-01-01'),
      completedOrders: 1,
      daysSinceLastPurchase: 30,
      latestPurchaseDate: d,
      firstPurchaseDate: d,
    }));
    expect(segs).toContain('ACTIVE');
    expect(segs).not.toContain('AT_RISK');
  });

  it('8: AT_RISK — last purchase 90 days ago (61–180 day window)', () => {
    const prisma = makePrismaForMetrics({});
    const svc = new CustomersService(prisma as never, makeEventEmitter());
    const d = new Date(now.getTime() - 90 * 86_400_000);
    const segs = callComputeSegments(svc, metricsBase({
      customerCreatedAt: new Date('2025-01-01'),
      completedOrders: 2,
      daysSinceLastPurchase: 90,
      latestPurchaseDate: d,
      firstPurchaseDate: new Date('2025-06-01'),
    }));
    expect(segs).toContain('AT_RISK');
    expect(segs).not.toContain('ACTIVE');
    expect(segs).not.toContain('INACTIVE');
  });

  it('9: INACTIVE — no purchases and customer 200 days old', () => {
    const created = new Date(now.getTime() - 200 * 86_400_000);
    const prisma = makePrismaForMetrics({});
    const svc = new CustomersService(prisma as never, makeEventEmitter());
    const segs = callComputeSegments(svc, metricsBase({
      customerCreatedAt: created,
      daysSinceLastPurchase: null,
    }));
    expect(segs).toContain('INACTIVE');
    expect(segs).not.toContain('NEW');
    expect(segs).not.toContain('AT_RISK');
  });

  it('10: HIGH_VALUE — totalSalesValue exactly 100,000 NGN', () => {
    const prisma = makePrismaForMetrics({});
    const svc = new CustomersService(prisma as never, makeEventEmitter());
    const segs = callComputeSegments(svc, metricsBase({
      customerCreatedAt: new Date('2025-01-01'),
      completedOrders: 3,
      totalSalesValue: 100_000,
      daysSinceLastPurchase: 10,
      latestPurchaseDate: new Date(now.getTime() - 10 * 86_400_000),
      firstPurchaseDate: new Date('2026-01-01'),
    }));
    expect(segs).toContain('HIGH_VALUE');
  });
});

// ── 11–15: Notes ──────────────────────────────────────────────────────────────

const NOTE_STUB = {
  id: 'note-1',
  organizationId: ORG,
  customerId: CUST_ID,
  content: 'Prefers WhatsApp contact',
  createdBy: 'user-1',
  createdAt: new Date('2026-10-01'),
};

function makePrismaForNotes(opts: {
  customerExists?: boolean;
  notes?: object[];
  note?: object | null;
} = {}) {
  const { customerExists = true } = opts;
  return {
    customer: {
      findFirst: jest.fn(async () => (customerExists ? { id: CUST_ID } : null)),
    },
    customerNote: {
      findMany: jest.fn(async () => opts.notes ?? [NOTE_STUB]),
      create: jest.fn(async (args: { data: Record<string, unknown> }) => ({
        id: 'note-new',
        ...args.data,
        createdAt: new Date(),
      })),
      findFirst: jest.fn(async () => ('note' in opts ? opts.note : NOTE_STUB)),
      delete: jest.fn(async () => ({})),
    },
  };
}

describe('CustomersService — notes', () => {
  it('11: listNotes returns notes scoped to org+customer', async () => {
    const prisma = makePrismaForNotes();
    const svc = new CustomersService(prisma as never, makeEventEmitter());
    const result = await svc.listNotes(ORG, CUST_ID);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].content).toBe('Prefers WhatsApp contact');
    const call = (prisma.customerNote.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.organizationId).toBe(ORG);
    expect(call.where.customerId).toBe(CUST_ID);
  });

  it('12: addNote creates note with correct content and createdBy', async () => {
    const prisma = makePrismaForNotes();
    const svc = new CustomersService(prisma as never, makeEventEmitter());
    const note = await svc.addNote(ORG, CUST_ID, { content: 'Follow up on order' }, 'user-2');
    expect(note.content).toBe('Follow up on order');
    expect((note as { createdBy: string }).createdBy).toBe('user-2');
  });

  it('13: deleteNote — author can delete own note', async () => {
    const prisma = makePrismaForNotes();
    const svc = new CustomersService(prisma as never, makeEventEmitter());
    const result = await svc.deleteNote(ORG, CUST_ID, 'note-1', 'user-1');
    expect(result.message).toBe('Note deleted');
    expect(prisma.customerNote.delete).toHaveBeenCalledWith({ where: { id: 'note-1' } });
  });

  it('14: deleteNote — non-author gets ForbiddenException', async () => {
    const prisma = makePrismaForNotes();
    const svc = new CustomersService(prisma as never, makeEventEmitter());
    await expect(svc.deleteNote(ORG, CUST_ID, 'note-1', 'other-user')).rejects.toThrow(ForbiddenException);
  });

  it('15: deleteNote — throws NotFoundException for unknown note', async () => {
    const prisma = makePrismaForNotes({ note: null });
    const svc = new CustomersService(prisma as never, makeEventEmitter());
    await expect(svc.deleteNote(ORG, CUST_ID, 'note-nonexistent', 'user-1')).rejects.toThrow(NotFoundException);
  });
});

// ── 16–21: Tags ───────────────────────────────────────────────────────────────

const TAG_STUB = { id: 'tag-1', organizationId: ORG, name: 'VIP', color: '#FFD700' };

function makePrismaForTags(opts: {
  existingTag?: object | null;
  tagById?: object | null;
  assignment?: object | null;
  customerExists?: boolean;
} = {}) {
  const { customerExists = true } = opts;
  return {
    customer: {
      findFirst: jest.fn(async () => (customerExists ? { id: CUST_ID } : null)),
    },
    customerTag: {
      findMany: jest.fn(async () => [TAG_STUB]),
      findFirst: jest.fn(async (args: { where: Record<string, unknown> }) => {
        // If asked by id (for assignTag), return tagById; otherwise return existingTag
        if ('id' in args.where) return 'tagById' in opts ? opts.tagById : TAG_STUB;
        return 'existingTag' in opts ? opts.existingTag : null;
      }),
      create: jest.fn(async (args: { data: Record<string, unknown> }) => ({
        id: 'tag-new',
        ...args.data,
      })),
    },
    customerTagAssignment: {
      findFirst: jest.fn(async () => ('assignment' in opts ? opts.assignment : null)),
      create: jest.fn(async (args: { data: Record<string, unknown> }) => ({ id: 'assign-1', ...args.data })),
      delete: jest.fn(async () => ({})),
    },
  };
}

describe('CustomersService — tags', () => {
  it('16: listOrgTags returns tags scoped to org', async () => {
    const prisma = makePrismaForTags();
    const svc = new CustomersService(prisma as never, makeEventEmitter());
    const result = await svc.listOrgTags(ORG);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].name).toBe('VIP');
    const call = (prisma.customerTag.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.organizationId).toBe(ORG);
  });

  it('17: createTag — uses default color #6B7280 when none provided', async () => {
    const prisma = makePrismaForTags({ existingTag: null });
    const svc = new CustomersService(prisma as never, makeEventEmitter());
    const result = await svc.createTag(ORG, { name: 'Wholesale' });
    expect((result as { color: string }).color).toBe('#6B7280');
  });

  it('18: createTag — ConflictException when name already exists in org', async () => {
    const prisma = makePrismaForTags({ existingTag: TAG_STUB });
    const svc = new CustomersService(prisma as never, makeEventEmitter());
    await expect(svc.createTag(ORG, { name: 'VIP' })).rejects.toThrow(ConflictException);
  });

  it('19: assignTag — idempotent, returns existing assignment without creating duplicate', async () => {
    const existing = { id: 'assign-existing', tagId: 'tag-1', customerId: CUST_ID };
    const prisma = makePrismaForTags({ tagById: TAG_STUB, assignment: existing });
    const svc = new CustomersService(prisma as never, makeEventEmitter());
    const result = await svc.assignTag(ORG, CUST_ID, 'tag-1');
    expect(result.id).toBe('assign-existing');
    expect(prisma.customerTagAssignment.create).not.toHaveBeenCalled();
  });

  it('20: assignTag — NotFoundException when tag belongs to different org', async () => {
    const prisma = makePrismaForTags({ tagById: null });
    const svc = new CustomersService(prisma as never, makeEventEmitter());
    await expect(svc.assignTag(ORG, CUST_ID, 'tag-other-org')).rejects.toThrow(NotFoundException);
  });

  it('21: removeTag — NotFoundException when assignment not found', async () => {
    const prisma = {
      customer: { findFirst: jest.fn(async () => ({ id: CUST_ID })) },
      customerTag: { findFirst: jest.fn(async () => TAG_STUB) },
      customerTagAssignment: {
        findFirst: jest.fn(async () => null),
        delete: jest.fn(),
      },
    };
    const svc = new CustomersService(prisma as never, makeEventEmitter());
    await expect(svc.removeTag(ORG, CUST_ID, 'tag-1')).rejects.toThrow(NotFoundException);
  });
});

// ── 22–24: Timeline ───────────────────────────────────────────────────────────

const EARLY = new Date('2026-07-01T10:00:00Z');
const LATE = new Date('2026-09-01T10:00:00Z');

function makePrismaForTimeline(opts: {
  customerExists?: boolean;
} = {}) {
  const { customerExists = true } = opts;
  return {
    customer: {
      findFirst: jest.fn(async () => (customerExists ? { id: CUST_ID, createdAt: EARLY } : null)),
    },
    salesOrder: {
      findMany: jest.fn(async () => [
        { id: 'so-1', reference: 'SO-001', status: 'COMPLETED', channel: 'POS', totalAmount: '5000', createdAt: LATE },
      ]),
    },
    invoice: {
      findMany: jest.fn(async () => []),
    },
    payment: {
      findMany: jest.fn(async () => []),
    },
    receipt: {
      findMany: jest.fn(async () => []),
    },
    customerNote: {
      findMany: jest.fn(async () => []),
    },
    task: {
      findMany: jest.fn(async () => []),
    },
  };
}

describe('CustomersService — getTimeline', () => {
  it('22: events sorted newest-first; ORDER comes before CUSTOMER_CREATED', async () => {
    const prisma = makePrismaForTimeline();
    const svc = new CustomersService(prisma as never, makeEventEmitter());
    const { data } = await svc.getTimeline(ORG, CUST_ID);
    expect(data[0].type).toBe('ORDER');
    expect(data[data.length - 1].type).toBe('CUSTOMER_CREATED');
  });

  it('23: CUSTOMER_CREATED event always present with correct date', async () => {
    const prisma = makePrismaForTimeline();
    const svc = new CustomersService(prisma as never, makeEventEmitter());
    const { data } = await svc.getTimeline(ORG, CUST_ID);
    const created = data.find((e) => e.type === 'CUSTOMER_CREATED');
    expect(created).toBeDefined();
    expect(created!.date).toBe(EARLY.toISOString());
  });

  it('24: throws NotFoundException for customer not in org', async () => {
    const prisma = makePrismaForTimeline({ customerExists: false });
    const svc = new CustomersService(prisma as never, makeEventEmitter());
    await expect(svc.getTimeline('org-other', CUST_ID)).rejects.toThrow(NotFoundException);
  });
});
