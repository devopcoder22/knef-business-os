import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ExternalAgentAuthGuard } from './external-agent-auth.guard';
import { PrismaService } from '../../common/services/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ExternalAgentsService } from './external-agents.service';
import { createHash } from 'crypto';

const RAW_KEY = 'knef_agent_test1234_abcdef1234567890abcdef1234567890abcdef12';
const KEY_HASH = createHash('sha256').update(RAW_KEY).digest('hex');

const mockApiKey = {
  id: 'key-1',
  organizationId: 'org-1',
  name: 'Agent Key',
  keyHash: KEY_HASH,
  prefix: 'knef_agent_test1234',
  scopes: ['inventory:read'],
  isActive: true,
  expiresAt: null,
  lastUsedAt: null,
  createdBy: null,
  createdAt: new Date(),
};

const mockAgent = {
  id: 'agent-1',
  organizationId: 'org-1',
  name: 'Test Agent',
  status: 'ACTIVE',
  scopes: ['inventory:read'],
  allowedTools: [],
  autonomyLevel: 'APPROVAL_REQUIRED',
  rateLimitPerMinute: 60,
  apiKeyId: 'key-1',
  description: null,
  ownerId: 'user-1',
  metadata: null,
  lastUsedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeContext(key?: string): ExecutionContext {
  const headers: Record<string, string> = {};
  if (key) headers['x-api-key'] = key;
  const request: Record<string, unknown> = { headers };

  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('ExternalAgentAuthGuard', () => {
  let guard: ExternalAgentAuthGuard;
  let prismaService: jest.Mocked<PrismaService>;
  let agentsService: jest.Mocked<ExternalAgentsService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExternalAgentAuthGuard,
        {
          provide: PrismaService,
          useValue: {
            aPIKey: {
              findFirst: jest.fn(),
              update: jest.fn().mockResolvedValue({}),
            },
            externalAgent: {
              update: jest.fn().mockResolvedValue({}),
            },
          },
        },
        {
          provide: AuditService,
          useValue: { log: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: ExternalAgentsService,
          useValue: { resolveAgentByApiKeyId: jest.fn() },
        },
      ],
    }).compile();

    guard = module.get<ExternalAgentAuthGuard>(ExternalAgentAuthGuard);
    prismaService = module.get(PrismaService) as jest.Mocked<PrismaService>;
    agentsService = module.get(ExternalAgentsService) as jest.Mocked<ExternalAgentsService>;
  });

  // 1. Valid API key
  it('authenticates with valid API key', async () => {
    (prismaService.aPIKey.findFirst as jest.Mock).mockResolvedValue(mockApiKey);
    (agentsService.resolveAgentByApiKeyId as jest.Mock).mockResolvedValue(mockAgent);

    const ctx = makeContext(RAW_KEY);
    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);

    const req = ctx.switchToHttp().getRequest() as Record<string, unknown>;
    expect(req['externalAgent']).toBeDefined();
    expect((req['externalAgent'] as typeof mockAgent).id).toBe('agent-1');
    expect(req['organizationId']).toBe('org-1');
  });

  // 2. Missing API key
  it('throws UnauthorizedException when API key is missing', async () => {
    await expect(guard.canActivate(makeContext())).rejects.toThrow(UnauthorizedException);
  });

  // 3. Invalid API key
  it('throws UnauthorizedException for invalid API key', async () => {
    (prismaService.aPIKey.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(guard.canActivate(makeContext('invalid-key'))).rejects.toThrow(UnauthorizedException);
  });

  // 4. Revoked API key
  it('throws UnauthorizedException for revoked API key', async () => {
    (prismaService.aPIKey.findFirst as jest.Mock).mockResolvedValue({
      ...mockApiKey,
      isActive: false,
    });
    await expect(guard.canActivate(makeContext(RAW_KEY))).rejects.toThrow(UnauthorizedException);
  });

  // 5. Expired API key
  it('throws UnauthorizedException for expired API key', async () => {
    (prismaService.aPIKey.findFirst as jest.Mock).mockResolvedValue({
      ...mockApiKey,
      expiresAt: new Date(Date.now() - 1000),
    });
    await expect(guard.canActivate(makeContext(RAW_KEY))).rejects.toThrow(UnauthorizedException);
  });

  // 6. No external agent linked
  it('throws UnauthorizedException when no agent is linked to the key', async () => {
    (prismaService.aPIKey.findFirst as jest.Mock).mockResolvedValue(mockApiKey);
    (agentsService.resolveAgentByApiKeyId as jest.Mock).mockResolvedValue(null);
    await expect(guard.canActivate(makeContext(RAW_KEY))).rejects.toThrow(UnauthorizedException);
  });

  // 7. Suspended agent
  it('throws UnauthorizedException for suspended agent', async () => {
    (prismaService.aPIKey.findFirst as jest.Mock).mockResolvedValue(mockApiKey);
    (agentsService.resolveAgentByApiKeyId as jest.Mock).mockResolvedValue({
      ...mockAgent,
      status: 'SUSPENDED',
    });
    await expect(guard.canActivate(makeContext(RAW_KEY))).rejects.toThrow(UnauthorizedException);
  });
});
