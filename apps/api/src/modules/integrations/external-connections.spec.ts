import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ExternalConnectionsService } from './external-connections.service';
import { ExternalProviderFactory } from './providers/external-provider.factory';
import { PrismaService } from '../../common/services/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import { AuditService } from '../audit/audit.service';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockProvider = {
  provider: 'google',
  capabilities: {
    supportsOAuth: true,
    supportsApiKey: false,
    supportsRefreshToken: true,
    supportsWebhook: false,
    supportsPublishing: false,
    supportsAds: true,
  },
  getAuthorizationUrl: jest.fn().mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?state=abc'),
  exchangeCode: jest.fn().mockResolvedValue({
    accessToken: 'access-token-123',
    refreshToken: 'refresh-token-456',
    expiresInSeconds: 3600,
    scopes: ['openid', 'email'],
  }),
  getAccountInfo: jest.fn().mockResolvedValue({
    id: 'google-user-1',
    name: 'Test User',
    email: 'test@example.com',
  }),
  refreshTokens: jest.fn().mockResolvedValue({
    accessToken: 'new-access-token',
    refreshToken: 'new-refresh-token',
    expiresInSeconds: 3600,
  }),
  revokeToken: jest.fn().mockResolvedValue(undefined),
  verifyWebhookSignature: jest.fn().mockReturnValue(true),
};

const mockFactory = {
  getProvider: jest.fn().mockReturnValue(mockProvider),
  isSupported: jest.fn().mockReturnValue(true),
  listProviders: jest.fn().mockReturnValue(['google', 'meta', 'tiktok', 'shopify']),
};

const mockPrisma = {
  externalConnection: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
  },
};

const mockRedis = {
  setJson: jest.fn().mockResolvedValue(undefined),
  getJson: jest.fn(),
  del: jest.fn().mockResolvedValue(undefined),
};

const mockAudit = {
  log: jest.fn().mockResolvedValue(undefined),
};

const mockConfig = {
  getOrThrow: jest.fn().mockImplementation((key) => {
    if (key === 'ENCRYPTION_KEY') return 'a'.repeat(64);
    return `mock-${key}`;
  }),
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('ExternalConnectionsService', () => {
  let service: ExternalConnectionsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExternalConnectionsService,
        { provide: ExternalProviderFactory, useValue: mockFactory },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: AuditService, useValue: mockAudit },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get(ExternalConnectionsService);
  });

  // ── initiateOAuth ──────────────────────────────────────────────────────────

  describe('initiateOAuth', () => {
    it('stores state in Redis and returns authorization URL', async () => {
      const result = await service.initiateOAuth('user-1', 'org-1', {
        provider: 'google',
      });

      expect(mockRedis.setJson).toHaveBeenCalledWith(
        expect.stringMatching(/^integrations:oauth:state:/),
        expect.objectContaining({ userId: 'user-1', organizationId: 'org-1', provider: 'google' }),
        600,
      );
      expect(result.url).toContain('accounts.google.com');
      expect(result.state).toBeTruthy();
    });

    it('prepends shopDomain to scopes for Shopify', async () => {
      await service.initiateOAuth('user-1', 'org-1', {
        provider: 'shopify',
        shopDomain: 'my-store.myshopify.com',
      });

      expect(mockProvider.getAuthorizationUrl).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['my-store.myshopify.com']),
      );
    });
  });

  // ── handleOAuthCallback ────────────────────────────────────────────────────

  describe('handleOAuthCallback', () => {
    const stateData = {
      userId: 'user-1',
      organizationId: 'org-1',
      provider: 'google',
    };

    beforeEach(() => {
      mockRedis.getJson.mockResolvedValue(stateData);
      mockPrisma.externalConnection.findFirst.mockResolvedValue(null);
      mockPrisma.externalConnection.create.mockResolvedValue({
        id: 'conn-1',
        provider: 'google',
      });
    });

    it('consumes state token (single-use) and creates connection', async () => {
      const result = await service.handleOAuthCallback('code-abc', 'state-xyz');

      expect(mockRedis.del).toHaveBeenCalledWith(expect.stringContaining('state-xyz'));
      expect(mockPrisma.externalConnection.create).toHaveBeenCalled();
      expect(result.connectionId).toBe('conn-1');
      expect(result.provider).toBe('google');
    });

    it('throws UnauthorizedException when state is missing or expired', async () => {
      mockRedis.getJson.mockResolvedValue(null);

      await expect(service.handleOAuthCallback('code-abc', 'bad-state')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('updates existing connection when account already linked', async () => {
      const existing = { id: 'conn-existing', refreshTokenEncrypted: null, metadata: null };
      mockPrisma.externalConnection.findFirst.mockResolvedValue(existing);
      mockPrisma.externalConnection.update.mockResolvedValue({
        id: 'conn-existing',
        provider: 'google',
      });

      const result = await service.handleOAuthCallback('code-abc', 'state-xyz');

      expect(mockPrisma.externalConnection.update).toHaveBeenCalled();
      expect(mockPrisma.externalConnection.create).not.toHaveBeenCalled();
      expect(result.connectionId).toBe('conn-existing');
    });

    it('throws BadRequestException when token exchange fails', async () => {
      mockProvider.exchangeCode.mockRejectedValueOnce(new Error('Exchange failed'));

      await expect(service.handleOAuthCallback('code-abc', 'state-xyz')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('logs audit event on successful connection', async () => {
      await service.handleOAuthCallback('code-abc', 'state-xyz');

      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'INTEGRATION_CONNECTED',
          entity: 'ExternalConnection',
        }),
      );
    });
  });

  // ── disconnect ─────────────────────────────────────────────────────────────

  describe('disconnect', () => {
    const conn = {
      id: 'conn-1',
      provider: 'google',
      organizationId: 'org-1',
      accessTokenEncrypted: null,
      metadata: null,
    };

    it('marks connection as disconnected', async () => {
      mockPrisma.externalConnection.findFirst.mockResolvedValue(conn);
      mockPrisma.externalConnection.update.mockResolvedValue({ ...conn, status: 'disconnected' });

      const result = await service.disconnect('org-1', 'user-1', 'conn-1');

      expect(mockPrisma.externalConnection.update).toHaveBeenCalledWith({
        where: { id: 'conn-1' },
        data: expect.objectContaining({ status: 'disconnected' }),
      });
      expect(result.message).toContain('disconnected');
    });

    it('throws NotFoundException for unknown connection', async () => {
      mockPrisma.externalConnection.findFirst.mockResolvedValue(null);

      await expect(service.disconnect('org-1', 'user-1', 'bad-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── runHealthCheck ─────────────────────────────────────────────────────────

  describe('runHealthCheck', () => {
    it('returns unhealthy for connection without credentials', async () => {
      mockPrisma.externalConnection.findFirst.mockResolvedValue({
        id: 'conn-1',
        provider: 'google',
        accessTokenEncrypted: null,
      });

      const result = await service.runHealthCheck('conn-1');

      expect(result.healthy).toBe(false);
      expect(result.message).toContain('No credentials');
    });

    it('throws NotFoundException for unknown connection', async () => {
      mockPrisma.externalConnection.findFirst.mockResolvedValue(null);

      await expect(service.runHealthCheck('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ── listProviders ──────────────────────────────────────────────────────────

  describe('listProviders', () => {
    it('returns all supported providers with capabilities', () => {
      const result = service.listProviders();

      expect(result).toHaveLength(4);
      expect(result[0]).toHaveProperty('name');
      expect(result[0]).toHaveProperty('capabilities');
    });
  });
});
