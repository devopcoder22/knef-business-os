/**
 * PaystackService.verifyAndConfirm — a payment is only completed (and its order confirmed)
 * when Paystack's verify API reports success for the exact reference, in NGN, for at least
 * the server-computed amount. Confirmation is idempotent.
 */
import { Prisma } from '@prisma/client';
import { PaystackService } from './paystack.service';

const REF = 'KNEF-ABCDEF0123456789ABCD';

function makePayment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pay-1',
    status: 'PENDING',
    amount: new Prisma.Decimal('7000'),
    order: {
      id: 'order-1',
      reference: 'WEB-14112026-ABCD',
      organizationId: 'org-1',
      totalAmount: new Prisma.Decimal('10000'),
      customer: { firstName: 'Ada', lastName: 'Buyer', email: 'ada@example.com', phone: '+2348000000001' },
    },
    ...overrides,
  };
}

function setup(payment: unknown, verifyData: Record<string, unknown> | null) {
  const tx = {
    payment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    salesOrder: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  const prisma = {
    payment: { findFirst: jest.fn().mockResolvedValue(payment) },
    $transaction: jest.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
  };
  const credentials = { resolve: jest.fn().mockResolvedValue('sk_test_x') };
  const events = { emit: jest.fn() };
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => (verifyData ? { status: true, data: verifyData } : { status: false }),
  }) as never;
  const service = new PaystackService(prisma as never, credentials as never, events as never);
  return { service, prisma, tx, events };
}

const success = (overrides: Record<string, unknown> = {}) => ({
  status: 'success',
  reference: REF,
  amount: 700_000,
  currency: 'NGN',
  channel: 'card',
  ...overrides,
});

describe('PaystackService.verifyAndConfirm', () => {
  afterEach(() => jest.restoreAllMocks());

  it('confirms a fully paid NGN transaction and emits the order confirmation once', async () => {
    const { service, tx, events } = setup(makePayment(), success());
    const result = await service.verifyAndConfirm(REF, 'org-1');

    expect(result).toEqual({ status: 'paid', orderReference: 'WEB-14112026-ABCD' });
    expect(tx.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'pay-1', status: { in: ['PENDING', 'FAILED'] } } }),
    );
    expect(tx.salesOrder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'CONFIRMED' } }),
    );
    expect(events.emit).toHaveBeenCalledTimes(1);
  });

  it('accepts an amount above the expected one (customer-borne fees)', async () => {
    const { service } = setup(makePayment(), success({ amount: 710_500 }));
    expect((await service.verifyAndConfirm(REF, 'org-1')).status).toBe('paid');
  });

  it.each([
    ['underpaid', { amount: 699_999 }],
    ['wrong currency', { currency: 'USD' }],
    ['different reference', { reference: 'KNEF-OTHER' }],
  ])('rejects a %s transaction without touching the order', async (_label, override) => {
    const { service, tx, events } = setup(makePayment(), success(override));
    expect((await service.verifyAndConfirm(REF, 'org-1')).status).toBe('failed');
    expect(tx.payment.updateMany).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('leaves an abandoned/ongoing transaction pending so the customer can retry', async () => {
    const { service, tx } = setup(makePayment(), success({ status: 'abandoned' }));
    expect((await service.verifyAndConfirm(REF, 'org-1')).status).toBe('pending');
    expect(tx.payment.updateMany).not.toHaveBeenCalled();
  });

  it('is idempotent: an already completed payment returns paid without calling Paystack', async () => {
    const { service } = setup(makePayment({ status: 'COMPLETED' }), success());
    expect((await service.verifyAndConfirm(REF, 'org-1')).status).toBe('paid');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('does not emit twice when a concurrent request already confirmed it', async () => {
    const { service, tx, events } = setup(makePayment(), success());
    tx.payment.updateMany.mockResolvedValue({ count: 0 });
    expect((await service.verifyAndConfirm(REF, 'org-1')).status).toBe('paid');
    expect(tx.salesOrder.updateMany).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('scopes the lookup to the organisation when one is given', async () => {
    const { service, prisma } = setup(null, success());
    expect((await service.verifyAndConfirm(REF, 'org-1')).status).toBe('not_found');
    expect(prisma.payment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { gatewayRef: REF, method: 'PAYSTACK', organizationId: 'org-1' } }),
    );
  });
});
