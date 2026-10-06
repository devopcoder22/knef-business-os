/**
 * Stage 18 Remediation — CRM Location Security Tests
 *
 * Coverage:
 *  1.  getInvoices — locationIds=['L1'] excludes invoices for L2 orders
 *  2.  getInvoices — locationIds=[] returns empty
 *  3.  getInvoices — locationIds=null returns all (org-wide)
 *  4.  getReceipts — locationIds=['L1'] excludes receipts via L2 invoice/order chain
 *  5.  getReceipts — locationIds=[] returns empty
 *  6.  getTimeline — locationIds=['L1'] excludes L2 INVOICE events
 *  7.  getTimeline — locationIds=['L1'] excludes L2 PAYMENT events
 *  8.  getTimeline — locationIds=['L1'] excludes L2 RECEIPT events
 *  9.  getTimeline — locationIds=[] returns only CUSTOMER_CREATED, NOTE, TASK (non-transactional)
 * 10.  getTimeline — locationIds=null includes all event types
 */

import { NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CustomersService } from './customers.service';

const ORG = 'org-1';
const CUST_ID = 'cust-1';
const L1 = 'loc-1';
const L2 = 'loc-2';

const BASE_CUSTOMER = { id: CUST_ID, createdAt: new Date('2026-09-01') };

function makeEventEmitter() {
  return { emit: jest.fn() } as unknown as EventEmitter2;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function makePrismaForInvoices(opts: {
  invoices?: object[];
} = {}) {
  return {
    customer: { findFirst: jest.fn(async () => ({ id: CUST_ID })) },
    invoice: { findMany: jest.fn(async () => opts.invoices ?? []) },
  };
}

function makePrismaForReceipts(opts: {
  receipts?: object[];
} = {}) {
  return {
    customer: { findFirst: jest.fn(async () => ({ id: CUST_ID })) },
    receipt: { findMany: jest.fn(async () => opts.receipts ?? []) },
  };
}

function makePrismaForTimeline(opts: {
  orders?: object[];
  invoices?: object[];
  payments?: object[];
  receipts?: object[];
  notes?: object[];
  tasks?: object[];
} = {}) {
  return {
    customer: { findFirst: jest.fn(async () => BASE_CUSTOMER) },
    salesOrder: { findMany: jest.fn(async () => opts.orders ?? []) },
    invoice: { findMany: jest.fn(async () => opts.invoices ?? []) },
    payment: { findMany: jest.fn(async () => opts.payments ?? []) },
    receipt: { findMany: jest.fn(async () => opts.receipts ?? []) },
    customerNote: { findMany: jest.fn(async () => opts.notes ?? []) },
    task: { findMany: jest.fn(async () => opts.tasks ?? []) },
  };
}

// ── 1–3: getInvoices ─────────────────────────────────────────────────────────

describe('CustomersService — getInvoices location security', () => {
  it('1: locationIds=[L1] passes order.locationId IN filter', async () => {
    const prisma = makePrismaForInvoices();
    const svc = new CustomersService(prisma as never, makeEventEmitter());
    await svc.getInvoices(ORG, CUST_ID, [L1]);
    const call = (prisma.invoice.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.order).toEqual({ locationId: { in: [L1] } });
  });

  it('2: locationIds=[] passes deny-all order.locationId filter', async () => {
    const prisma = makePrismaForInvoices();
    const svc = new CustomersService(prisma as never, makeEventEmitter());
    await svc.getInvoices(ORG, CUST_ID, []);
    const call = (prisma.invoice.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.order).toEqual({ locationId: '__none__' });
  });

  it('3: locationIds=null passes no order location filter (org-wide)', async () => {
    const prisma = makePrismaForInvoices();
    const svc = new CustomersService(prisma as never, makeEventEmitter());
    await svc.getInvoices(ORG, CUST_ID, null);
    const call = (prisma.invoice.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.order).toBeUndefined();
  });
});

// ── 4–5: getReceipts ─────────────────────────────────────────────────────────

describe('CustomersService — getReceipts location security', () => {
  it('4: locationIds=[L1] passes invoice.order.locationId IN filter', async () => {
    const prisma = makePrismaForReceipts();
    const svc = new CustomersService(prisma as never, makeEventEmitter());
    await svc.getReceipts(ORG, CUST_ID, [L1]);
    const call = (prisma.receipt.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.invoice).toEqual({ order: { locationId: { in: [L1] } } });
  });

  it('5: locationIds=[] passes deny-all invoice.order.locationId filter', async () => {
    const prisma = makePrismaForReceipts();
    const svc = new CustomersService(prisma as never, makeEventEmitter());
    await svc.getReceipts(ORG, CUST_ID, []);
    const call = (prisma.receipt.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.invoice).toEqual({ order: { locationId: '__none__' } });
  });
});

// ── 6–10: getTimeline ────────────────────────────────────────────────────────

describe('CustomersService — getTimeline location security', () => {
  it('6: locationIds=[L1] passes order.locationId IN to invoice query', async () => {
    const prisma = makePrismaForTimeline();
    const svc = new CustomersService(prisma as never, makeEventEmitter());
    await svc.getTimeline(ORG, CUST_ID, 50, [L1]);
    const call = (prisma.invoice.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.order).toEqual({ locationId: { in: [L1] } });
  });

  it('7: locationIds=[L1] passes invoice.order.locationId IN to payment query', async () => {
    const prisma = makePrismaForTimeline();
    const svc = new CustomersService(prisma as never, makeEventEmitter());
    await svc.getTimeline(ORG, CUST_ID, 50, [L1]);
    const call = (prisma.payment.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.invoice).toEqual({ order: { locationId: { in: [L1] } } });
  });

  it('8: locationIds=[L1] passes invoice.order.locationId IN to receipt query', async () => {
    const prisma = makePrismaForTimeline();
    const svc = new CustomersService(prisma as never, makeEventEmitter());
    await svc.getTimeline(ORG, CUST_ID, 50, [L1]);
    const call = (prisma.receipt.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.invoice).toEqual({ order: { locationId: { in: [L1] } } });
  });

  it('9: locationIds=[] applies deny-all to all transaction queries', async () => {
    const prisma = makePrismaForTimeline();
    const svc = new CustomersService(prisma as never, makeEventEmitter());
    await svc.getTimeline(ORG, CUST_ID, 50, []);
    const orderCall = (prisma.salesOrder.findMany as jest.Mock).mock.calls[0][0];
    const invoiceCall = (prisma.invoice.findMany as jest.Mock).mock.calls[0][0];
    const paymentCall = (prisma.payment.findMany as jest.Mock).mock.calls[0][0];
    const receiptCall = (prisma.receipt.findMany as jest.Mock).mock.calls[0][0];
    expect(orderCall.where.locationId).toBe('__none__');
    expect(invoiceCall.where.order).toEqual({ locationId: '__none__' });
    expect(paymentCall.where.invoice).toEqual({ order: { locationId: '__none__' } });
    expect(receiptCall.where.invoice).toEqual({ order: { locationId: '__none__' } });
  });

  it('10: locationIds=null passes no location filter (org-wide for all event types)', async () => {
    const prisma = makePrismaForTimeline();
    const svc = new CustomersService(prisma as never, makeEventEmitter());
    await svc.getTimeline(ORG, CUST_ID, 50, null);
    const invoiceCall = (prisma.invoice.findMany as jest.Mock).mock.calls[0][0];
    const paymentCall = (prisma.payment.findMany as jest.Mock).mock.calls[0][0];
    const receiptCall = (prisma.receipt.findMany as jest.Mock).mock.calls[0][0];
    expect(invoiceCall.where.order).toBeUndefined();
    expect(paymentCall.where.invoice).toBeUndefined();
    expect(receiptCall.where.invoice).toBeUndefined();
  });
});
