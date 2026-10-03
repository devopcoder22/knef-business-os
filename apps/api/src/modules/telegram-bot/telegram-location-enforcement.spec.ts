/**
 * Telegram Location Enforcement — Security Regression Tests
 *
 * Verifies that Telegram command handlers and the AI assistant use
 * server-derived location scope and cannot be bypassed by the caller.
 *
 * Coverage:
 *   - /sales command: L1-scoped user sees only L1 orders
 *   - /inventory command: L1-scoped user sees only L1 inventory
 *   - Natural-language assistant: location scope threaded from getUserLocationIds
 *   - No separate Telegram authorization path bypasses LocationScopeService
 */

import { TelegramCommandService } from './telegram-command.service';
import { TelegramAssistantService } from './telegram-assistant.service';

// ── 1. TelegramCommandService — /sales ───────────────────────────────────────

describe('TelegramCommandService.handleSales — location enforcement', () => {
  function makeSvc(salesOrdersOverride?: jest.Mock) {
    const prisma = {
      salesOrder: {
        findMany: salesOrdersOverride ?? jest.fn(async () => []),
      },
    };
    return { svc: new TelegramCommandService(prisma as never), prisma };
  }

  it('1: L1-scoped user → WHERE.locationId = { in: [L1] } for both queries', async () => {
    const { svc, prisma } = makeSvc();

    await svc.handleSales('org1', ['loc-L1']);

    const calls = (prisma.salesOrder.findMany as jest.Mock).mock.calls;
    // Two queries: today and last-7-days
    expect(calls[0][0].where.locationId).toEqual({ in: ['loc-L1'] });
    expect(calls[1][0].where.locationId).toEqual({ in: ['loc-L1'] });
  });

  it('2: org-wide user → no locationId filter in either query', async () => {
    const { svc, prisma } = makeSvc();

    await svc.handleSales('org1', null);

    const calls = (prisma.salesOrder.findMany as jest.Mock).mock.calls;
    expect(calls[0][0].where).not.toHaveProperty('locationId');
    expect(calls[1][0].where).not.toHaveProperty('locationId');
  });

  it('3: L1 user cannot see orders from L2 via /sales (L2 data not in result)', async () => {
    const l2Orders = [{ totalAmount: 99999, status: 'COMPLETED' }];
    const mockFindMany = jest.fn(async (args: { where: { locationId?: unknown } }) => {
      // Only return L2 data if no location filter (would be a security bug)
      if (!args.where.locationId) return l2Orders;
      return []; // correct: filtered to L1, which has no orders
    });
    const { svc } = makeSvc(mockFindMany);

    const result = await svc.handleSales('org1', ['loc-L1']);
    // Revenue must be 0 since no L1 orders exist
    expect(result.text).toContain('₦0.00');
  });

  it('4: organizationId is always included in WHERE', async () => {
    const { svc, prisma } = makeSvc();

    await svc.handleSales('org-correct', null);

    const [call] = (prisma.salesOrder.findMany as jest.Mock).mock.calls;
    expect(call[0].where.organizationId).toBe('org-correct');
  });
});

// ── 2. TelegramCommandService — /inventory ────────────────────────────────────

describe('TelegramCommandService.handleInventory — location enforcement', () => {
  function makeSvc(productOverride?: jest.Mock) {
    const prisma = {
      product: {
        findMany: productOverride ?? jest.fn(async () => []),
      },
    };
    return { svc: new TelegramCommandService(prisma as never), prisma };
  }

  it('5: L1-scoped user → inventoryLevels.where.locationId = { in: [L1] }', async () => {
    const { svc, prisma } = makeSvc();

    await svc.handleInventory('org1', ['loc-L1']);

    const [call] = (prisma.product.findMany as jest.Mock).mock.calls;
    expect(call[0].where.organizationId).toBe('org1');
    // inventoryLevels.where filters by location
    expect(call[0].select.inventoryLevels.where).toEqual({ locationId: { in: ['loc-L1'] } });
  });

  it('6: org-wide user → inventoryLevels.where is undefined (no filter)', async () => {
    const { svc, prisma } = makeSvc();

    await svc.handleInventory('org1', null);

    const [call] = (prisma.product.findMany as jest.Mock).mock.calls;
    expect(call[0].select.inventoryLevels.where).toBeUndefined();
  });

  it('7: L1 user inventory query includes locationId filter on inventoryLevels (server enforced)', async () => {
    // Verify that the DB query itself is scoped to L1 — the server enforces this,
    // not client-side filtering of the result.
    const { svc, prisma } = makeSvc();

    await svc.handleInventory('org1', ['loc-L1']);

    const [call] = (prisma.product.findMany as jest.Mock).mock.calls;
    // The inventoryLevels sub-select must carry the location filter
    expect(call[0].select.inventoryLevels.where).toEqual({ locationId: { in: ['loc-L1'] } });
    // And the org isolation is also present
    expect(call[0].where.organizationId).toBe('org1');
  });
});

// ── 3. TelegramAssistantService — location scope ──────────────────────────────

describe('TelegramAssistantService — location scope in context loading', () => {
  function makePermissions(effective: string[]) {
    return {
      getResolvedPermissions: jest.fn(async () => ({ data: { effective } })),
    };
  }

  function makeCommands() {
    return {
      handleSales: jest.fn(async () => ({ text: 'SALES_DATA' })),
      handleInventory: jest.fn(async () => ({ text: 'INVENTORY_DATA' })),
      handleProfit: jest.fn(async () => ({ text: 'FINANCE_DATA' })),
    };
  }

  function makeAI() {
    return { complete: jest.fn(async () => ({ content: 'AI response' })) };
  }

  function makePrisma() {
    return {
      task: { count: jest.fn(async () => 0) },
      plan: { findMany: jest.fn(async () => []) },
    };
  }

  it('8: L1-scoped user: handleSales is called with locationIds=[L1]', async () => {
    const perms = makePermissions(['sales.view']);
    const commands = makeCommands();
    const ai = makeAI();
    const locationScope = { getUserLocationIds: jest.fn(async () => ['loc-L1']) };

    const svc = new TelegramAssistantService(ai as never, perms as never, locationScope as never, commands as never, makePrisma() as never);
    await svc.handleNaturalLanguage('org1', 'user1', 'Show me today sales');

    expect(commands.handleSales).toHaveBeenCalledWith('org1', ['loc-L1']);
  });

  it('9: org-wide user: handleSales is called with locationIds=null', async () => {
    const perms = makePermissions(['sales.view']);
    const commands = makeCommands();
    const ai = makeAI();
    const locationScope = { getUserLocationIds: jest.fn(async () => null) };

    const svc = new TelegramAssistantService(ai as never, perms as never, locationScope as never, commands as never, makePrisma() as never);
    await svc.handleNaturalLanguage('org1', 'user1', 'Show me today sales');

    expect(commands.handleSales).toHaveBeenCalledWith('org1', null);
  });

  it('10: locationScope.getUserLocationIds is called with the correct userId', async () => {
    const perms = makePermissions(['sales.view']);
    const commands = makeCommands();
    const ai = makeAI();
    const locationScope = { getUserLocationIds: jest.fn(async () => null) };

    const svc = new TelegramAssistantService(ai as never, perms as never, locationScope as never, commands as never, makePrisma() as never);
    await svc.handleNaturalLanguage('org1', 'user-target', 'hello');

    expect(locationScope.getUserLocationIds).toHaveBeenCalledWith('user-target');
  });

  it('11: L1-scoped user context: AI only receives L1-scoped data', async () => {
    const perms = makePermissions(['sales.view', 'inventory.view']);
    const commands = {
      handleSales: jest.fn(async () => ({ text: 'L1_SALES_DATA' })),
      handleInventory: jest.fn(async () => ({ text: 'L1_INVENTORY_DATA' })),
      handleProfit: jest.fn(async () => ({ text: 'FINANCE_DATA' })),
    };
    const ai = makeAI();
    const locationScope = { getUserLocationIds: jest.fn(async () => ['loc-L1']) };

    const svc = new TelegramAssistantService(ai as never, perms as never, locationScope as never, commands as never, makePrisma() as never);
    await svc.handleNaturalLanguage('org1', 'user1', 'Summary?');

    expect(commands.handleSales).toHaveBeenCalledWith('org1', ['loc-L1']);
    expect(commands.handleInventory).toHaveBeenCalledWith('org1', ['loc-L1']);
    // Location data is derived server-side — user cannot supply arbitrary locationIds
    const contextSent = (ai.complete as jest.Mock).mock.calls[0][0].messages[0].content as string;
    expect(contextSent).toContain('L1_SALES_DATA');
    expect(contextSent).toContain('L1_INVENTORY_DATA');
  });
});

// ── 4. Cross-org isolation (Telegram path) ────────────────────────────────────

describe('Telegram — cross-org isolation', () => {
  it('12: /sales handler always scopes by organizationId', async () => {
    const prisma = {
      salesOrder: { findMany: jest.fn(async () => []) },
    };
    const svc = new TelegramCommandService(prisma as never);

    await svc.handleSales('org-correct', null);

    const [call] = (prisma.salesOrder.findMany as jest.Mock).mock.calls;
    expect(call[0].where.organizationId).toBe('org-correct');
  });

  it('13: /inventory handler always scopes by organizationId', async () => {
    const prisma = {
      product: { findMany: jest.fn(async () => []) },
    };
    const svc = new TelegramCommandService(prisma as never);

    await svc.handleInventory('org-correct', null);

    const [call] = (prisma.product.findMany as jest.Mock).mock.calls;
    expect(call[0].where.organizationId).toBe('org-correct');
  });
});
