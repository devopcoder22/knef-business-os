/**
 * Stage 17 — Business Documents: Receipt Service + Customer Statement
 *
 * Coverage:
 *   1. listReceipts — returns paginated receipts for org
 *   2. listReceipts — does not leak receipts from other org
 *   3. findReceipt — returns receipt with customer flattened
 *   4. findReceipt — throws NotFoundException for wrong org
 *   5. findReceipt — throws NotFoundException for unknown id
 *   6. getStatement — queries invoices + payments within date range for customer
 *   7. getStatement — throws NotFoundException for customer not in org
 *   8. getStatement — summary totals are calculated correctly
 *   9. getStatement — refunds are split from payments (negative amount)
 *  10. listReceipts — passes organizationId in WHERE clause (cross-org isolation)
 */

import { NotFoundException } from '@nestjs/common';
import { SalesService } from './sales.service';
import { CustomersService } from '../customers/customers.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeEventEmitter() {
  return { emit: jest.fn() } as unknown as EventEmitter2;
}

function makeInventoryService() {
  return { recordMovement: jest.fn() };
}

function makeBusinessRuleService() {
  return {
    checkDiscount: jest.fn(async () => ({ allowed: true, approvalRequired: false })),
    checkMargin: jest.fn(async () => ({ allowed: true, approvalRequired: false })),
    checkPurchaseAmount: jest.fn(async () => ({ allowed: true, approvalRequired: false })),
    checkExpenseAmount: jest.fn(async () => ({ allowed: true, approvalRequired: false })),
    checkRefundAmount: jest.fn(async () => ({ allowed: true, approvalRequired: false })),
  };
}

function makeAuditService() {
  return { log: jest.fn(async () => undefined) };
}

const RECEIPT_STUB = {
  id: 'rcpt-1',
  reference: 'RCP-0001',
  amount: '5000',
  currency: 'NGN',
  method: 'CASH',
  issuedAt: new Date('2026-01-15'),
  notes: null,
  invoiceId: 'inv-1',
  customerId: 'cust-1',
  organizationId: 'org-1',
  invoice: {
    id: 'inv-1',
    reference: 'INV-0001',
    status: 'PAID',
    items: [],
    customer: { id: 'cust-1', firstName: 'Ada', lastName: 'Lovelace', code: 'CUST-00001', email: null, phone: null },
  },
};

// ── 1–5: SalesService receipt methods ─────────────────────────────────────────

describe('SalesService — listReceipts', () => {
  it('1: returns paginated receipts scoped to org', async () => {
    const prisma = {
      receipt: {
        findMany: jest.fn(async () => [RECEIPT_STUB]),
        count: jest.fn(async () => 1),
      },
    };
    const svc = new SalesService(
      prisma as never,
      makeInventoryService() as never,
      makeEventEmitter(),
      makeBusinessRuleService() as never,
      makeAuditService() as never,
    );

    const result = await svc.listReceipts('org-1');
    expect(result.data).toHaveLength(1);
    expect(result.data[0].reference).toBe('RCP-0001');
    expect(result.meta.total).toBe(1);
  });

  it('2: passes organizationId in WHERE (cross-org isolation)', async () => {
    const prisma = {
      receipt: {
        findMany: jest.fn(async () => []),
        count: jest.fn(async () => 0),
      },
    };
    const svc = new SalesService(
      prisma as never,
      makeInventoryService() as never,
      makeEventEmitter(),
      makeBusinessRuleService() as never,
      makeAuditService() as never,
    );

    await svc.listReceipts('org-2');

    const [call] = (prisma.receipt.findMany as jest.Mock).mock.calls;
    expect(call[0].where).toEqual({ organizationId: 'org-2' });
  });

  it('10: does not expose receipts from other org', async () => {
    const prisma = {
      receipt: {
        findMany: jest.fn(async (args: { where: { organizationId: string } }) => {
          if (args.where.organizationId !== 'org-1') return [];
          return [RECEIPT_STUB];
        }),
        count: jest.fn(async () => 0),
      },
    };
    const svc = new SalesService(
      prisma as never,
      makeInventoryService() as never,
      makeEventEmitter(),
      makeBusinessRuleService() as never,
      makeAuditService() as never,
    );

    const result = await svc.listReceipts('org-2');
    expect(result.data).toHaveLength(0);
  });
});

describe('SalesService — findReceipt', () => {
  it('3: returns receipt with customer flattened', async () => {
    const prisma = {
      receipt: {
        findFirst: jest.fn(async () => RECEIPT_STUB),
      },
    };
    const svc = new SalesService(
      prisma as never,
      makeInventoryService() as never,
      makeEventEmitter(),
      makeBusinessRuleService() as never,
      makeAuditService() as never,
    );

    const result = await svc.findReceipt('org-1', 'rcpt-1');
    expect(result.reference).toBe('RCP-0001');
    expect((result as { customer: unknown }).customer).toBeTruthy();
    const cust = (result as { customer: Record<string, unknown> }).customer;
    expect(cust?.['firstName']).toBe('Ada');
  });

  it('4: throws NotFoundException for receipt belonging to another org', async () => {
    const prisma = {
      receipt: {
        findFirst: jest.fn(async () => null),
      },
    };
    const svc = new SalesService(
      prisma as never,
      makeInventoryService() as never,
      makeEventEmitter(),
      makeBusinessRuleService() as never,
      makeAuditService() as never,
    );

    await expect(svc.findReceipt('org-2', 'rcpt-1')).rejects.toThrow(NotFoundException);
  });

  it('5: throws NotFoundException for unknown id', async () => {
    const prisma = {
      receipt: {
        findFirst: jest.fn(async () => null),
      },
    };
    const svc = new SalesService(
      prisma as never,
      makeInventoryService() as never,
      makeEventEmitter(),
      makeBusinessRuleService() as never,
      makeAuditService() as never,
    );

    await expect(svc.findReceipt('org-1', 'rcpt-nonexistent')).rejects.toThrow(NotFoundException);
  });
});

// ── 6–9: CustomersService getStatement ────────────────────────────────────────

const CUSTOMER_STUB = {
  id: 'cust-1',
  firstName: 'Ada',
  lastName: 'Lovelace',
  phone: '08012345678',
  email: 'ada@example.com',
  code: 'CUST-00001',
};

const INVOICE_STUB = {
  id: 'inv-1',
  reference: 'INV-0001',
  status: 'PAID',
  currency: 'NGN',
  totalAmount: '10000',
  paidAmount: '10000',
  dueDate: null,
  issuedAt: new Date('2026-01-10'),
  order: { reference: 'SO-0001' },
};

const PAYMENT_STUB = {
  id: 'pay-1',
  reference: 'PAY-0001',
  amount: '10000',
  method: 'CASH',
  receivedAt: new Date('2026-01-10'),
  invoiceId: 'inv-1',
};

const REFUND_STUB = {
  id: 'ref-1',
  reference: 'REF-0001',
  amount: '-2000',
  method: 'CASH',
  receivedAt: new Date('2026-01-12'),
  invoiceId: 'inv-1',
};

function makePrismaForStatement(opts: {
  customer?: object | null;
  invoices?: object[];
  payments?: object[];
} = {}) {
  return {
    customer: {
      findFirst: jest.fn(async () => 'customer' in opts ? opts.customer : CUSTOMER_STUB),
    },
    invoice: {
      findMany: jest.fn(async () => opts.invoices ?? [INVOICE_STUB]),
    },
    payment: {
      findMany: jest.fn(async () => opts.payments ?? [PAYMENT_STUB]),
    },
  };
}

describe('CustomersService — getStatement', () => {
  it('6: queries invoices + payments within date range for customer', async () => {
    const prisma = makePrismaForStatement();
    const svc = new CustomersService(prisma as never, makeEventEmitter());

    const result = await svc.getStatement('org-1', 'cust-1', '2026-01-01', '2026-01-31');

    expect(result.data.customer.id).toBe('cust-1');
    expect(result.data.invoices).toHaveLength(1);
    expect(result.data.payments).toHaveLength(1);

    const invoiceCall = (prisma.invoice.findMany as jest.Mock).mock.calls[0][0];
    expect(invoiceCall.where.organizationId).toBe('org-1');
    expect(invoiceCall.where.customerId).toBe('cust-1');
    expect(invoiceCall.where.createdAt.gte).toBeInstanceOf(Date);
  });

  it('7: throws NotFoundException when customer not in org', async () => {
    const prisma = makePrismaForStatement({ customer: null });
    const svc = new CustomersService(prisma as never, makeEventEmitter());

    await expect(svc.getStatement('org-2', 'cust-1', '2026-01-01', '2026-01-31')).rejects.toThrow(NotFoundException);
  });

  it('8: summary totals are calculated correctly', async () => {
    const prisma = makePrismaForStatement({
      invoices: [INVOICE_STUB],
      payments: [PAYMENT_STUB],
    });
    const svc = new CustomersService(prisma as never, makeEventEmitter());

    const result = await svc.getStatement('org-1', 'cust-1', '2026-01-01', '2026-01-31');

    expect(result.data.summary.totalBilled).toBe(10000);
    expect(result.data.summary.totalPaid).toBe(10000);
    expect(result.data.summary.totalRefunded).toBe(0);
    expect(result.data.summary.outstandingBalance).toBe(0);
  });

  it('9: refunds (negative amount) are split from regular payments', async () => {
    const prisma = makePrismaForStatement({
      invoices: [INVOICE_STUB],
      payments: [PAYMENT_STUB, REFUND_STUB],
    });
    const svc = new CustomersService(prisma as never, makeEventEmitter());

    const result = await svc.getStatement('org-1', 'cust-1', '2026-01-01', '2026-01-31');

    expect(result.data.payments).toHaveLength(1);
    expect(result.data.payments[0].amount).toBe(10000);
    expect(result.data.refunds).toHaveLength(1);
    expect(result.data.refunds[0].amount).toBe(2000);
    expect(result.data.summary.totalRefunded).toBe(2000);
    expect(result.data.summary.outstandingBalance).toBe(2000); // 10000 - 10000 + 2000
  });
});
