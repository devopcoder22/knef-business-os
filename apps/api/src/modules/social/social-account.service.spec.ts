import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SocialAccountService } from './social-account.service';
import { PrismaService } from '../../common/services/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ACCOUNT_APPROVAL_STATUS } from './publishers/publisher.interface';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockPrisma = {
  externalConnection: {
    findFirst: jest.fn(),
  },
  socialAccount: {
    upsert: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
};

const mockAudit = {
  log: jest.fn().mockResolvedValue(undefined),
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const makeMetaConnection = (overrides = {}) => ({
  id: 'conn-1',
  organizationId: 'org-1',
  provider: 'meta',
  externalAccountId: 'acc-123',
  externalAccountName: 'Test Page',
  externalPageId: 'page-456',
  externalPageName: 'KNEF Gadgets',
  scopes: ['pages_manage_posts', 'instagram_basic', 'instagram_content_publish'],
  ...overrides,
});

const makeTikTokConnection = (overrides = {}) => ({
  id: 'conn-2',
  organizationId: 'org-1',
  provider: 'tiktok',
  externalAccountId: 'tt-789',
  externalAccountName: 'KNEF TikTok',
  scopes: ['user.info.basic', 'video.publish'],
  ...overrides,
});

const makeSnapchatConnection = (overrides = {}) => ({
  id: 'conn-3',
  organizationId: 'org-1',
  provider: 'snapchat',
  externalAccountId: 'snap-101',
  externalAccountName: 'KNEF Snap',
  scopes: [],
  ...overrides,
});

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('SocialAccountService', () => {
  let service: SocialAccountService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SocialAccountService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<SocialAccountService>(SocialAccountService);
  });

  // ── syncAccountsFromConnection ─────────────────────────────────────────────

  describe('syncAccountsFromConnection', () => {
    it('creates FACEBOOK and INSTAGRAM accounts from meta connection', async () => {
      mockPrisma.externalConnection.findFirst.mockResolvedValue(makeMetaConnection());
      const upserted = { id: 'sa-1', provider: 'FACEBOOK', displayName: 'KNEF Gadgets' };
      mockPrisma.socialAccount.upsert.mockResolvedValue(upserted);

      const result = await service.syncAccountsFromConnection('org-1', 'conn-1', 'user-1');

      // meta connection should create 2 accounts (FACEBOOK page + INSTAGRAM)
      expect(mockPrisma.socialAccount.upsert).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(2);
    });

    it('creates TIKTOK account from tiktok connection', async () => {
      mockPrisma.externalConnection.findFirst.mockResolvedValue(makeTikTokConnection());
      const upserted = { id: 'sa-2', provider: 'TIKTOK', displayName: 'KNEF TikTok' };
      mockPrisma.socialAccount.upsert.mockResolvedValue(upserted);

      const result = await service.syncAccountsFromConnection('org-1', 'conn-2', 'user-1');

      expect(mockPrisma.socialAccount.upsert).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(1);
    });

    it('creates SNAPCHAT account from snapchat connection', async () => {
      mockPrisma.externalConnection.findFirst.mockResolvedValue(makeSnapchatConnection());
      const upserted = { id: 'sa-3', provider: 'SNAPCHAT', displayName: 'KNEF Snap' };
      mockPrisma.socialAccount.upsert.mockResolvedValue(upserted);

      const result = await service.syncAccountsFromConnection('org-1', 'conn-3', 'user-1');

      expect(result).toHaveLength(1);
    });

    it('throws NotFoundException for wrong org connection', async () => {
      mockPrisma.externalConnection.findFirst.mockResolvedValue(null);

      await expect(
        service.syncAccountsFromConnection('org-OTHER', 'conn-1', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException for google (unsupported social provider)', async () => {
      mockPrisma.externalConnection.findFirst.mockResolvedValue({
        id: 'conn-g',
        organizationId: 'org-1',
        provider: 'google',
        scopes: [],
      });

      await expect(
        service.syncAccountsFromConnection('org-1', 'conn-g', 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('resolves SCOPES_INCOMPLETE for Facebook when pages_manage_posts missing', async () => {
      mockPrisma.externalConnection.findFirst.mockResolvedValue(
        makeMetaConnection({ scopes: ['instagram_basic'] }),
      );
      let capturedData: { approvalStatus?: string } = {};
      mockPrisma.socialAccount.upsert.mockImplementation(({ create }: { create: { approvalStatus?: string } }) => {
        capturedData = create;
        return { id: 'sa-x', ...create };
      });

      await service.syncAccountsFromConnection('org-1', 'conn-1', 'user-1');

      // Find the FACEBOOK upsert call
      const fbCall = mockPrisma.socialAccount.upsert.mock.calls.find(
        (c: [{ create: { provider?: string } }]) => c[0].create.provider === 'FACEBOOK',
      );
      expect(fbCall?.[0].create.approvalStatus).toBe(ACCOUNT_APPROVAL_STATUS.SCOPES_INCOMPLETE);
    });

    it('resolves APP_REVIEW_PENDING for Facebook with full scopes', async () => {
      mockPrisma.externalConnection.findFirst.mockResolvedValue(makeMetaConnection());
      mockPrisma.socialAccount.upsert.mockImplementation(({ create }: { create: Record<string, unknown> }) => ({
        id: 'sa-y',
        ...create,
      }));

      await service.syncAccountsFromConnection('org-1', 'conn-1', 'user-1');

      const fbCall = mockPrisma.socialAccount.upsert.mock.calls.find(
        (c: [{ create: { provider?: string } }]) => c[0].create.provider === 'FACEBOOK',
      );
      expect(fbCall?.[0].create.approvalStatus).toBe(ACCOUNT_APPROVAL_STATUS.APP_REVIEW_PENDING);
    });

    it('resolves SCOPES_INCOMPLETE for Instagram when instagram_content_publish missing', async () => {
      mockPrisma.externalConnection.findFirst.mockResolvedValue(
        makeMetaConnection({ scopes: ['pages_manage_posts', 'instagram_basic'] }),
      );
      mockPrisma.socialAccount.upsert.mockImplementation(({ create }: { create: Record<string, unknown> }) => ({
        id: 'sa-z',
        ...create,
      }));

      await service.syncAccountsFromConnection('org-1', 'conn-1', 'user-1');

      const igCall = mockPrisma.socialAccount.upsert.mock.calls.find(
        (c: [{ create: { provider?: string } }]) => c[0].create.provider === 'INSTAGRAM',
      );
      expect(igCall?.[0].create.approvalStatus).toBe(ACCOUNT_APPROVAL_STATUS.SCOPES_INCOMPLETE);
    });

    it('resolves AUDIT_PENDING for TikTok with video.publish scope', async () => {
      mockPrisma.externalConnection.findFirst.mockResolvedValue(makeTikTokConnection());
      mockPrisma.socialAccount.upsert.mockImplementation(({ create }: { create: Record<string, unknown> }) => ({
        id: 'sa-tt',
        ...create,
      }));

      await service.syncAccountsFromConnection('org-1', 'conn-2', 'user-1');

      const call = mockPrisma.socialAccount.upsert.mock.calls[0] as [{ create: { approvalStatus?: string } }];
      expect(call[0].create.approvalStatus).toBe(ACCOUNT_APPROVAL_STATUS.AUDIT_PENDING);
    });

    it('resolves SCOPES_INCOMPLETE for TikTok without video.publish', async () => {
      mockPrisma.externalConnection.findFirst.mockResolvedValue(
        makeTikTokConnection({ scopes: ['user.info.basic'] }),
      );
      mockPrisma.socialAccount.upsert.mockImplementation(({ create }: { create: Record<string, unknown> }) => ({
        id: 'sa-tt2',
        ...create,
      }));

      await service.syncAccountsFromConnection('org-1', 'conn-2', 'user-1');

      const call = mockPrisma.socialAccount.upsert.mock.calls[0] as [{ create: { approvalStatus?: string } }];
      expect(call[0].create.approvalStatus).toBe(ACCOUNT_APPROVAL_STATUS.SCOPES_INCOMPLETE);
    });

    it('logs audit event after sync', async () => {
      mockPrisma.externalConnection.findFirst.mockResolvedValue(makeTikTokConnection());
      mockPrisma.socialAccount.upsert.mockResolvedValue({ id: 'sa-tt' });

      await service.syncAccountsFromConnection('org-1', 'conn-2', 'user-1');

      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'SOCIAL_ACCOUNTS_SYNCED' }),
      );
    });
  });

  // ── listAccounts ──────────────────────────────────────────────────────────

  describe('listAccounts', () => {
    it('returns active accounts for org', async () => {
      const accounts = [{ id: 'sa-1', provider: 'FACEBOOK' }];
      mockPrisma.socialAccount.findMany.mockResolvedValue(accounts);

      const result = await service.listAccounts('org-1');

      expect(result).toBe(accounts);
      expect(mockPrisma.socialAccount.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: 'org-1', isActive: true }),
        }),
      );
    });

    it('filters by provider when provided', async () => {
      mockPrisma.socialAccount.findMany.mockResolvedValue([]);

      await service.listAccounts('org-1', 'TIKTOK');

      expect(mockPrisma.socialAccount.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ provider: 'TIKTOK' }),
        }),
      );
    });
  });

  // ── deactivate ────────────────────────────────────────────────────────────

  describe('deactivate', () => {
    it('sets isActive=false and logs audit', async () => {
      mockPrisma.socialAccount.findFirst.mockResolvedValue({
        id: 'sa-1',
        organizationId: 'org-1',
        provider: 'FACEBOOK',
        displayName: 'Page',
        connection: {},
      });
      mockPrisma.socialAccount.update.mockResolvedValue({ id: 'sa-1', isActive: false });

      await service.deactivate('org-1', 'sa-1', 'user-1');

      expect(mockPrisma.socialAccount.update).toHaveBeenCalledWith({
        where: { id: 'sa-1' },
        data: { isActive: false },
      });
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'SOCIAL_ACCOUNT_DEACTIVATED' }),
      );
    });

    it('throws NotFoundException for non-existent account', async () => {
      mockPrisma.socialAccount.findFirst.mockResolvedValue(null);

      await expect(service.deactivate('org-1', 'bad-id', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
