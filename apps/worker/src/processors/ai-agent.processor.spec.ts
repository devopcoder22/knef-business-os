/**
 * AIAgentProcessor — unit tests
 *
 * Verifies that scheduled agents load provider config from DB, call the AI,
 * and correctly update lastRunAt/lastStatus. Confirms org-level security:
 * no user-specific locationIds bypass is introduced — agents run at org scope.
 */

jest.mock('@knef/utils', () => ({
  decrypt: jest.fn(() => 'test-api-key'),
}));

import { AIAgentProcessor } from './ai-agent.processor';

function makeAgent(overrides: Partial<{
  id: string;
  organizationId: string;
  isActive: boolean;
  taskType: string;
  parameters: Record<string, unknown>;
  name: string;
}> = {}) {
  return {
    id: 'agent-1',
    organizationId: 'org-1',
    isActive: true,
    taskType: 'sales_summary',
    parameters: {},
    name: 'Daily Sales',
    ...overrides,
  };
}

function makePrisma(
  agent: unknown | null = makeAgent(),
  provider: unknown | null = {
    id: 'prov-1',
    provider: 'anthropic',
    apiKeyEncrypted: 'encrypted',
    baseUrl: null,
    isActive: true,
    isDefault: true,
    organizationId: 'org-1',
  },
) {
  return {
    aIScheduledAgent: {
      findFirst: jest.fn(async () => agent),
      update: jest.fn(async () => null),
    },
    aIProvider: {
      findFirst: jest.fn(async () => provider),
    },
    aIProviderRoute: {
      findFirst: jest.fn(async () => null),
    },
    aIUsageLog: {
      create: jest.fn(async () => null),
    },
  };
}

function makeConfig(encryptionKey = 'a'.repeat(64)) {
  return {
    get: jest.fn((key: string, def?: unknown) => {
      if (key === 'ENCRYPTION_KEY') return encryptionKey;
      return def;
    }),
  };
}

describe('AIAgentProcessor.runScheduledAgent', () => {
  it('1: agent not found → skipped without calling AI provider', async () => {
    const prisma = makePrisma(null);
    const config = makeConfig();

    const processor = new AIAgentProcessor(prisma as never, config as never);

    await expect(
      (processor as unknown as { runScheduledAgent: (d: unknown) => Promise<void> })
        .runScheduledAgent({ agentId: 'agent-1', organizationId: 'org-1' }),
    ).resolves.toBeUndefined();

    expect((prisma.aIProvider.findFirst as jest.Mock).mock.calls.length).toBe(0);
  });

  it('2: no AI provider configured → marks agent FAILED and throws', async () => {
    const prisma = makePrisma(makeAgent(), null);
    const config = makeConfig();

    const processor = new AIAgentProcessor(prisma as never, config as never);

    await expect(
      (processor as unknown as { runScheduledAgent: (d: unknown) => Promise<void> })
        .runScheduledAgent({ agentId: 'agent-1', organizationId: 'org-1' }),
    ).rejects.toThrow('No active AI provider configured');

    const updateCall = (prisma.aIScheduledAgent.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.lastStatus).toContain('FAILED');
  });

  it('3: successful Anthropic call → lastStatus=SUCCESS, lastRunAt set', async () => {
    const prisma = makePrisma();
    const config = makeConfig();

    const processor = new AIAgentProcessor(prisma as never, config as never);

    (processor as unknown as { callAnthropic: jest.Mock }).callAnthropic =
      jest.fn(async () => 'Sales look great!');

    await (processor as unknown as { runScheduledAgent: (d: unknown) => Promise<void> })
      .runScheduledAgent({ agentId: 'agent-1', organizationId: 'org-1' });

    const updateCall = (prisma.aIScheduledAgent.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.lastStatus).toBe('SUCCESS');
    expect(updateCall.data.lastRunAt).toBeInstanceOf(Date);
  });

  it('4: agent runs with org-level context (no userId/locationId in DB query)', async () => {
    const prisma = makePrisma();
    const config = makeConfig();

    const processor = new AIAgentProcessor(prisma as never, config as never);
    (processor as unknown as { callAnthropic: jest.Mock }).callAnthropic =
      jest.fn(async () => 'result');

    await (processor as unknown as { runScheduledAgent: (d: unknown) => Promise<void> })
      .runScheduledAgent({ agentId: 'agent-1', organizationId: 'org-1' });

    const agentLookup = (prisma.aIScheduledAgent.findFirst as jest.Mock).mock.calls[0][0];
    expect(agentLookup.where).not.toHaveProperty('userId');
    expect(agentLookup.where).not.toHaveProperty('locationId');
    expect(agentLookup.where.organizationId).toBe('org-1');
  });

  it('5: provider route model takes precedence over default', async () => {
    const prisma = makePrisma(makeAgent(), {
      id: 'prov-1',
      provider: 'anthropic',
      apiKeyEncrypted: 'enc',
      baseUrl: null,
    });

    (prisma.aIProviderRoute.findFirst as jest.Mock).mockResolvedValue({
      model: 'claude-opus-4-7',
      maxTokens: 4096,
    });

    const config = makeConfig();
    const processor = new AIAgentProcessor(prisma as never, config as never);

    let capturedModel: string | undefined;
    (processor as unknown as { callAnthropic: (key: string, model: string, prompt: string) => Promise<string> }).callAnthropic =
      jest.fn(async (_key: string, model: string) => {
        capturedModel = model;
        return 'ok';
      });

    await (processor as unknown as { runScheduledAgent: (d: unknown) => Promise<void> })
      .runScheduledAgent({ agentId: 'agent-1', organizationId: 'org-1' });

    expect(capturedModel).toBe('claude-opus-4-7');
  });

  it('6: AI call failure → marks agent FAILED and re-throws', async () => {
    const prisma = makePrisma();
    const config = makeConfig();

    const processor = new AIAgentProcessor(prisma as never, config as never);
    (processor as unknown as { callAnthropic: jest.Mock }).callAnthropic =
      jest.fn(async () => { throw new Error('API rate limit'); });

    await expect(
      (processor as unknown as { runScheduledAgent: (d: unknown) => Promise<void> })
        .runScheduledAgent({ agentId: 'agent-1', organizationId: 'org-1' }),
    ).rejects.toThrow('API rate limit');

    const updateCall = (prisma.aIScheduledAgent.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.lastStatus).toContain('FAILED');
    expect(updateCall.data.lastStatus).toContain('rate limit');
  });
});
