import { AutomationEventsListener } from './automation-events.listener';

function makeRule() {
  return {
    id: 'rule-1',
    organizationId: 'org-1',
    trigger: 'inventory.low',
    conditions: [],
    actions: [{ type: 'SEND_NOTIFICATION', params: { title: 'Alert', message: 'Low' } }],
    isActive: true,
  };
}

function makeRulesService(rules = [makeRule()]) {
  return { findMatchingRules: jest.fn(async () => rules) };
}

function makeDispatcher() {
  return { dispatchForEvent: jest.fn(async () => undefined) };
}

function makeSvc(overrides: { rules?: ReturnType<typeof makeRule>[]; dispatcherError?: boolean } = {}) {
  const rules = overrides.rules ?? [makeRule()];
  const dispatcher = makeDispatcher();
  if (overrides.dispatcherError) {
    dispatcher.dispatchForEvent = jest.fn(async () => { throw new Error('dispatch failed'); });
  }
  const rulesService = makeRulesService(rules);
  return {
    listener: new AutomationEventsListener(rulesService as never, dispatcher as never),
    rulesService,
    dispatcher,
  };
}

describe('AutomationEventsListener', () => {
  it('dispatches for inventory.low with matching org', async () => {
    const { listener, dispatcher } = makeSvc();
    await listener.onInventoryLow({ organizationId: 'org-1', productId: 'p1', quantity: 2, threshold: 10 });
    expect(dispatcher.dispatchForEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: 'inventory.low', organizationId: 'org-1' }),
    );
  });

  it('skips event without organizationId', async () => {
    const { listener, dispatcher } = makeSvc();
    await listener.onInventoryLow({ productId: 'p1' });
    expect(dispatcher.dispatchForEvent).not.toHaveBeenCalled();
  });

  it('skips dispatch when no matching rules', async () => {
    const { listener, dispatcher } = makeSvc({ rules: [] });
    await listener.onOrderCreated({ organizationId: 'org-1', orderId: 'o1' });
    expect(dispatcher.dispatchForEvent).not.toHaveBeenCalled();
  });

  it('does not throw when dispatcher fails (swallows error)', async () => {
    const { listener } = makeSvc({ dispatcherError: true });
    await expect(
      listener.onInventoryLow({ organizationId: 'org-1', productId: 'p1' })
    ).resolves.toBeUndefined();
  });

  it('passes locationId from payload to envelope', async () => {
    const { listener, dispatcher } = makeSvc();
    await listener.onInventoryLow({ organizationId: 'org-1', locationId: 'loc-A', productId: 'p1' });
    const envelope = (dispatcher.dispatchForEvent as jest.Mock).mock.calls[0][1];
    expect(envelope.locationId).toBe('loc-A');
  });

  it('passes automationDepth from payload (default 0)', async () => {
    const { listener, dispatcher } = makeSvc();
    await listener.onTaskCreated({ organizationId: 'org-1', taskId: 't1' });
    const envelope = (dispatcher.dispatchForEvent as jest.Mock).mock.calls[0][1];
    expect(envelope.automationDepth).toBe(0);
  });

  it('dispatches order.completed correctly', async () => {
    const { listener, dispatcher } = makeSvc();
    await listener.onOrderCompleted({ organizationId: 'org-1', orderId: 'o-1' });
    const envelope = (dispatcher.dispatchForEvent as jest.Mock).mock.calls[0][1];
    expect(envelope.eventType).toBe('order.completed');
  });

  it('dispatches purchase_order.approved correctly', async () => {
    const { listener, dispatcher } = makeSvc();
    await listener.onPurchaseOrderApproved({ organizationId: 'org-1', purchaseOrderId: 'po-1' });
    const envelope = (dispatcher.dispatchForEvent as jest.Mock).mock.calls[0][1];
    expect(envelope.eventType).toBe('purchase_order.approved');
  });

  it('dispatches customer.created correctly', async () => {
    const { listener, dispatcher } = makeSvc();
    await listener.onCustomerCreated({ organizationId: 'org-1', customerId: 'c-1' });
    const envelope = (dispatcher.dispatchForEvent as jest.Mock).mock.calls[0][1];
    expect(envelope.eventType).toBe('customer.created');
  });
});
