import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ForbiddenException, NotImplementedException } from '@nestjs/common';
import { AdvertisingAccountService } from './advertising-account.service';
import { AdvertisingCampaignService } from './advertising-campaign.service';
import { AdvertisingMetricsService } from './advertising-metrics.service';
import { AdvertisingActionService } from './advertising-action.service';
import { GoogleAdsProvider } from './providers/google-ads.provider';
import { MetaAdsProvider } from './providers/meta-ads.provider';
import { TikTokAdsProvider } from './providers/tiktok-ads.provider';
import { PrismaService } from '../../common/services/prisma.service';
import { AuditService } from '../audit/audit.service';
import { QueueService } from '../../common/services/queue.service';

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockPrisma = {
  advertisingAccount: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  advertisingCampaign: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    upsert: jest.fn(),
  },
  advertisingMetricSnapshot: {
    upsert: jest.fn(),
    findMany: jest.fn(),
  },
  advertisingAction: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  externalConnection: {
    findFirst: jest.fn(),
  },
};

const mockAudit = {
  log: jest.fn().mockResolvedValue(undefined),
};

const mockQueue = {
  enqueue: jest.fn().mockResolvedValue('job-id-1'),
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const makeAccount = (overrides = {}) => ({
  id: 'adacct-1',
  organizationId: 'org-1',
  connectionId: 'conn-1',
  provider: 'GOOGLE_ADS',
  providerAccountId: 'gads-acct-001',
  displayName: 'KNEF Google Ads',
  currency: 'USD',
  timezone: 'UTC',
  accountStatus: 'ENABLED',
  capabilities: [],
  approvalStatus: 'APPROVED',
  isActive: true,
  lastSyncedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeCampaign = (overrides = {}) => ({
  id: 'camp-1',
  organizationId: 'org-1',
  advertisingAccountId: 'adacct-1',
  provider: 'GOOGLE_ADS',
  providerCampaignId: 'gads-camp-001',
  name: 'KNEF Summer Sale',
  status: 'ACTIVE',
  objective: 'CONVERSIONS',
  budgetType: 'DAILY',
  budgetAmountMicros: BigInt(5_000_000),
  currency: 'USD',
  rawMeta: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeAction = (overrides = {}) => ({
  id: 'action-1',
  organizationId: 'org-1',
  provider: 'GOOGLE_ADS',
  advertisingAccountId: 'adacct-1',
  campaignId: null,
  actionType: 'CAMPAIGN_PAUSE',
  status: 'DRAFT',
  requestPayload: { campaignId: 'camp-1' },
  previousValue: null,
  proposedValue: null,
  requestedById: 'user-1',
  approvedById: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

// ── AdvertisingAccountService ──────────────────────────────────────────────────

describe('AdvertisingAccountService', () => {
  let service: AdvertisingAccountService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdvertisingAccountService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();
    service = module.get<AdvertisingAccountService>(AdvertisingAccountService);
  });

  describe('listAccounts', () => {
    it('returns only org-scoped records', async () => {
      const accounts = [makeAccount()];
      mockPrisma.advertisingAccount.findMany.mockResolvedValue(accounts);

      const result = await service.listAccounts('org-1');

      expect(result).toBe(accounts);
      expect(mockPrisma.advertisingAccount.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: 'org-1' }),
        }),
      );
    });
  });

  describe('getAccount', () => {
    it('throws NotFoundException for wrong org', async () => {
      mockPrisma.advertisingAccount.findFirst.mockResolvedValue(null);

      await expect(service.getAccount('org-OTHER', 'adacct-1')).rejects.toThrow(NotFoundException);
    });

    it('returns account for correct org', async () => {
      const account = makeAccount();
      mockPrisma.advertisingAccount.findFirst.mockResolvedValue(account);

      const result = await service.getAccount('org-1', 'adacct-1');
      expect(result).toBe(account);
    });
  });

  describe('linkAccount', () => {
    it('creates record when connectionId belongs to org', async () => {
      const conn = { id: 'conn-1', organizationId: 'org-1' };
      mockPrisma.externalConnection.findFirst.mockResolvedValue(conn);
      const account = makeAccount();
      mockPrisma.advertisingAccount.create.mockResolvedValue(account);

      const result = await service.linkAccount('org-1', 'user-1', {
        connectionId: 'conn-1',
        provider: 'GOOGLE_ADS',
        providerAccountId: 'gads-001',
        displayName: 'Test Account',
      });

      expect(mockPrisma.advertisingAccount.create).toHaveBeenCalled();
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ADVERTISING_ACCOUNT_LINKED' }),
      );
      expect(result).toBe(account);
    });

    it('throws BadRequestException when connectionId belongs to a different org', async () => {
      mockPrisma.externalConnection.findFirst.mockResolvedValue(null);

      await expect(
        service.linkAccount('org-1', 'user-1', {
          connectionId: 'conn-OTHER-ORG',
          provider: 'META',
          providerAccountId: 'meta-001',
          displayName: 'Wrong Org Account',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('removeAccount', () => {
    it('sets isActive=false and does not delete', async () => {
      const account = makeAccount();
      mockPrisma.advertisingAccount.findFirst.mockResolvedValue(account);
      mockPrisma.advertisingAccount.update.mockResolvedValue({ ...account, isActive: false });

      await service.removeAccount('org-1', 'adacct-1', 'user-1');

      expect(mockPrisma.advertisingAccount.update).toHaveBeenCalledWith({
        where: { id: 'adacct-1' },
        data: { isActive: false },
      });
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ADVERTISING_ACCOUNT_REMOVED' }),
      );
    });
  });

  describe('organization isolation', () => {
    it('cross-org account ID returns NotFoundException', async () => {
      mockPrisma.advertisingAccount.findFirst.mockResolvedValue(null);

      await expect(service.getAccount('org-ATTACKER', 'adacct-1')).rejects.toThrow(NotFoundException);
    });
  });
});

// ── AdvertisingCampaignService ─────────────────────────────────────────────────

describe('AdvertisingCampaignService', () => {
  let service: AdvertisingCampaignService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdvertisingCampaignService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<AdvertisingCampaignService>(AdvertisingCampaignService);
  });

  describe('listCampaigns', () => {
    it('filters by org', async () => {
      const campaigns = [makeCampaign()];
      mockPrisma.advertisingCampaign.findMany.mockResolvedValue(campaigns);

      const result = await service.listCampaigns('org-1');

      expect(result).toBe(campaigns);
      expect(mockPrisma.advertisingCampaign.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: 'org-1' }),
        }),
      );
    });

    it('filters by accountId within org', async () => {
      mockPrisma.advertisingCampaign.findMany.mockResolvedValue([]);

      await service.listCampaigns('org-1', { accountId: 'adacct-1' });

      expect(mockPrisma.advertisingCampaign.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-1',
            advertisingAccountId: 'adacct-1',
          }),
        }),
      );
    });
  });

  describe('getCampaign', () => {
    it('throws NotFoundException for wrong org', async () => {
      mockPrisma.advertisingCampaign.findFirst.mockResolvedValue(null);

      await expect(service.getCampaign('org-OTHER', 'camp-1')).rejects.toThrow(NotFoundException);
    });

    it('returns campaign for correct org', async () => {
      const campaign = makeCampaign();
      mockPrisma.advertisingCampaign.findFirst.mockResolvedValue(campaign);

      const result = await service.getCampaign('org-1', 'camp-1');
      expect(result).toBe(campaign);
    });
  });

  describe('upsertFromSync', () => {
    it('creates new campaigns on first sync', async () => {
      const account = makeAccount();
      mockPrisma.advertisingAccount.findFirst.mockResolvedValue(account);
      const campaign = makeCampaign();
      mockPrisma.advertisingCampaign.upsert.mockResolvedValue(campaign);

      const rawCampaigns = [
        {
          providerCampaignId: 'gads-camp-001',
          name: 'Test Campaign',
          status: 'ACTIVE',
        },
      ];

      const result = await service.upsertFromSync('org-1', 'adacct-1', rawCampaigns);

      expect(mockPrisma.advertisingCampaign.upsert).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(1);
    });

    it('updates existing campaigns on re-sync', async () => {
      const account = makeAccount();
      mockPrisma.advertisingAccount.findFirst.mockResolvedValue(account);
      const updatedCampaign = makeCampaign({ status: 'PAUSED' });
      mockPrisma.advertisingCampaign.upsert.mockResolvedValue(updatedCampaign);

      const rawCampaigns = [
        {
          providerCampaignId: 'gads-camp-001',
          name: 'Test Campaign',
          status: 'PAUSED',
        },
      ];

      const result = await service.upsertFromSync('org-1', 'adacct-1', rawCampaigns);

      expect(result[0].status).toBe('PAUSED');
    });
  });

  describe('organization isolation', () => {
    it('cross-org campaign returns NotFoundException', async () => {
      mockPrisma.advertisingCampaign.findFirst.mockResolvedValue(null);

      await expect(service.getCampaign('org-ATTACKER', 'camp-1')).rejects.toThrow(NotFoundException);
    });
  });
});

// ── AdvertisingMetricsService ─────────────────────────────────────────────────

describe('AdvertisingMetricsService', () => {
  let service: AdvertisingMetricsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdvertisingMetricsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<AdvertisingMetricsService>(AdvertisingMetricsService);
  });

  describe('querySummary', () => {
    it('returns zeros when no data', async () => {
      mockPrisma.advertisingMetricSnapshot.findMany.mockResolvedValue([]);

      const result = await service.querySummary('org-1', {
        from: '2026-10-01',
        to: '2026-10-20',
      });

      expect(result).toHaveLength(1);
      expect(result[0].totalSpend).toBe(0);
      expect(result[0].impressions).toBe(0);
      expect(result[0].clicks).toBe(0);
      expect(result[0].conversions).toBe(0);
    });

    it('aggregates correctly', async () => {
      const snapshots = [
        { currency: 'USD', impressions: 1000, clicks: 50, spend: '100.00', conversions: '5.00' },
        { currency: 'USD', impressions: 2000, clicks: 100, spend: '200.00', conversions: '10.00' },
      ];
      mockPrisma.advertisingMetricSnapshot.findMany.mockResolvedValue(snapshots);

      const result = await service.querySummary('org-1', {
        from: '2026-10-01',
        to: '2026-10-20',
      });

      expect(result).toHaveLength(1);
      expect(result[0].totalSpend).toBeCloseTo(300, 1);
      expect(result[0].impressions).toBe(3000);
      expect(result[0].clicks).toBe(150);
      expect(result[0].conversions).toBeCloseTo(15, 1);
    });

    it('does NOT mix currencies — returns separate summary per currency', async () => {
      const snapshots = [
        { currency: 'USD', impressions: 1000, clicks: 50, spend: '100.00', conversions: null },
        { currency: 'EUR', impressions: 500, clicks: 25, spend: '80.00', conversions: null },
      ];
      mockPrisma.advertisingMetricSnapshot.findMany.mockResolvedValue(snapshots);

      const result = await service.querySummary('org-1', {
        from: '2026-10-01',
        to: '2026-10-20',
      });

      expect(result).toHaveLength(2);
      const currencies = result.map((r) => r.currency).sort();
      expect(currencies).toEqual(['EUR', 'USD']);
    });
  });

  describe('upsertSnapshot', () => {
    it('is idempotent on same date/account/provider', async () => {
      const snapshot = {
        id: 'snap-1',
        advertisingAccountId: 'adacct-1',
        date: new Date('2026-10-10'),
        provider: 'GOOGLE_ADS',
        impressions: 1000,
        clicks: 50,
        spend: '100.00',
        currency: 'USD',
      };
      mockPrisma.advertisingMetricSnapshot.upsert.mockResolvedValue(snapshot);

      const rawMetrics = [
        {
          date: '2026-10-10',
          impressions: 1000,
          clicks: 50,
          spend: 100.0,
          currency: 'USD',
        },
      ];

      // Call twice with same data
      await service.upsertSnapshot('org-1', 'adacct-1', 'GOOGLE_ADS', rawMetrics);
      await service.upsertSnapshot('org-1', 'adacct-1', 'GOOGLE_ADS', rawMetrics);

      expect(mockPrisma.advertisingMetricSnapshot.upsert).toHaveBeenCalledTimes(2);
      // Both calls use upsert on the same unique key — idempotent by design
      const firstCall = mockPrisma.advertisingMetricSnapshot.upsert.mock.calls[0][0];
      const secondCall = mockPrisma.advertisingMetricSnapshot.upsert.mock.calls[1][0];
      expect(firstCall.where).toEqual(secondCall.where);
    });
  });

  describe('queryTimeSeries', () => {
    it('filters by date range', async () => {
      mockPrisma.advertisingMetricSnapshot.findMany.mockResolvedValue([]);

      await service.queryTimeSeries('org-1', {
        from: '2026-10-01',
        to: '2026-10-10',
        groupBy: 'date',
      });

      expect(mockPrisma.advertisingMetricSnapshot.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-1',
            date: expect.objectContaining({
              gte: new Date('2026-10-01'),
              lte: new Date('2026-10-10'),
            }),
          }),
        }),
      );
    });
  });
});

// ── AdvertisingActionService ───────────────────────────────────────────────────

describe('AdvertisingActionService', () => {
  let service: AdvertisingActionService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdvertisingActionService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();
    service = module.get<AdvertisingActionService>(AdvertisingActionService);
  });

  describe('createAction', () => {
    beforeEach(() => {
      mockPrisma.advertisingAccount.findFirst.mockResolvedValue(makeAccount());
    });

    it('CAMPAIGN_ENABLE sets status=APPROVAL_REQUIRED', async () => {
      const action = makeAction({ actionType: 'CAMPAIGN_ENABLE', status: 'APPROVAL_REQUIRED' });
      mockPrisma.advertisingAction.create.mockResolvedValue(action);

      const result = await service.createAction('org-1', 'user-1', {
        provider: 'GOOGLE_ADS',
        advertisingAccountId: 'adacct-1',
        actionType: 'CAMPAIGN_ENABLE',
        requestPayload: { campaignId: 'camp-1' },
      });

      const createCall = mockPrisma.advertisingAction.create.mock.calls[0][0];
      expect(createCall.data.status).toBe('APPROVAL_REQUIRED');
    });

    it('BUDGET_INCREASE sets status=APPROVAL_REQUIRED', async () => {
      const action = makeAction({ actionType: 'BUDGET_INCREASE', status: 'APPROVAL_REQUIRED' });
      mockPrisma.advertisingAction.create.mockResolvedValue(action);

      await service.createAction('org-1', 'user-1', {
        provider: 'GOOGLE_ADS',
        advertisingAccountId: 'adacct-1',
        actionType: 'BUDGET_INCREASE',
        requestPayload: { budgetAmountMicros: 10_000_000 },
      });

      const createCall = mockPrisma.advertisingAction.create.mock.calls[0][0];
      expect(createCall.data.status).toBe('APPROVAL_REQUIRED');
    });

    it('CAMPAIGN_PAUSE does NOT require approval (not high-risk) — sets DRAFT', async () => {
      const action = makeAction({ actionType: 'CAMPAIGN_PAUSE', status: 'DRAFT' });
      mockPrisma.advertisingAction.create.mockResolvedValue(action);

      await service.createAction('org-1', 'user-1', {
        provider: 'GOOGLE_ADS',
        advertisingAccountId: 'adacct-1',
        actionType: 'CAMPAIGN_PAUSE',
        requestPayload: { campaignId: 'camp-1' },
      });

      const createCall = mockPrisma.advertisingAction.create.mock.calls[0][0];
      expect(createCall.data.status).toBe('DRAFT');
    });

    it('CAMPAIGN_CREATE (high-risk) sets status=APPROVAL_REQUIRED', async () => {
      mockPrisma.advertisingAction.create.mockResolvedValue(
        makeAction({ actionType: 'CAMPAIGN_CREATE', status: 'APPROVAL_REQUIRED' }),
      );

      await service.createAction('org-1', 'user-1', {
        provider: 'META',
        advertisingAccountId: 'adacct-1',
        actionType: 'CAMPAIGN_CREATE',
        requestPayload: { name: 'New Campaign' },
      });

      const createCall = mockPrisma.advertisingAction.create.mock.calls[0][0];
      expect(createCall.data.status).toBe('APPROVAL_REQUIRED');
    });
  });

  describe('approveAction', () => {
    it('sets status=APPROVED and enqueues submit job', async () => {
      const action = makeAction({ status: 'APPROVAL_REQUIRED', requestedById: 'user-1' });
      mockPrisma.advertisingAction.findFirst.mockResolvedValue(action);
      mockPrisma.advertisingAction.update.mockResolvedValue({ ...action, status: 'APPROVED', approvedById: 'user-2' });

      await service.approveAction('org-1', 'user-2', 'action-1', mockQueue as unknown as QueueService);

      expect(mockPrisma.advertisingAction.update).toHaveBeenCalledWith({
        where: { id: 'action-1' },
        data: { status: 'APPROVED', approvedById: 'user-2' },
      });
      expect(mockQueue.enqueue).toHaveBeenCalledWith(
        'advertising',
        'advertising-action-submit',
        expect.objectContaining({ actionId: 'action-1' }),
      );
    });

    it('rejects if approvedById === requestedById', async () => {
      const action = makeAction({ status: 'APPROVAL_REQUIRED', requestedById: 'user-1' });
      mockPrisma.advertisingAction.findFirst.mockResolvedValue(action);

      await expect(
        service.approveAction('org-1', 'user-1', 'action-1', mockQueue as unknown as QueueService),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('cancelAction', () => {
    it('sets status=CANCELLED and logs audit', async () => {
      const action = makeAction({ status: 'DRAFT' });
      mockPrisma.advertisingAction.findFirst.mockResolvedValue(action);
      mockPrisma.advertisingAction.update.mockResolvedValue({ ...action, status: 'CANCELLED' });

      await service.cancelAction('org-1', 'action-1', 'user-1');

      expect(mockPrisma.advertisingAction.update).toHaveBeenCalledWith({
        where: { id: 'action-1' },
        data: { status: 'CANCELLED' },
      });
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ADVERTISING_ACTION_CANCELLED' }),
      );
    });
  });

  describe('submitAction', () => {
    it('re-reads action from DB (not from job data)', async () => {
      const action = makeAction({ status: 'APPROVED' });
      mockPrisma.advertisingAction.findUnique.mockResolvedValue(action);
      mockPrisma.advertisingAction.update.mockResolvedValue(action);

      await service.submitAction('action-1');

      // Verifies DB re-read — findUnique called with actionId
      expect(mockPrisma.advertisingAction.findUnique).toHaveBeenCalledWith({
        where: { id: 'action-1' },
      });
    });

    it('FOUNDATION_ONLY providers set status=FAILED', async () => {
      const action = makeAction({ status: 'APPROVED', provider: 'GOOGLE_ADS' });
      mockPrisma.advertisingAction.findUnique.mockResolvedValue(action);
      mockPrisma.advertisingAction.update.mockResolvedValue(action);

      await service.submitAction('action-1');

      // First update sets SUBMITTED, second sets FAILED
      const updates = mockPrisma.advertisingAction.update.mock.calls;
      const failedUpdate = updates.find(
        (call: [{ data: { status?: string } }]) => call[0].data.status === 'FAILED',
      );
      expect(failedUpdate).toBeDefined();
      expect(failedUpdate[0].data.errorMessage).toContain('foundation-only');
    });

    it('AI cannot bypass approval — APPROVAL_REQUIRED check is enforced in service layer', async () => {
      mockPrisma.advertisingAccount.findFirst.mockResolvedValue(makeAccount());

      // HIGH_RISK action must get APPROVAL_REQUIRED status — cannot be DRAFT
      mockPrisma.advertisingAction.create.mockImplementation(
        (args: { data: { status: string } }) => {
          return Promise.resolve({ ...makeAction(), status: args.data.status });
        },
      );

      const result = await service.createAction('org-1', 'user-ai', {
        provider: 'GOOGLE_ADS',
        advertisingAccountId: 'adacct-1',
        actionType: 'CAMPAIGN_ENABLE', // HIGH_RISK
        requestPayload: { campaignId: 'camp-1' },
      });

      expect(result.status).toBe('APPROVAL_REQUIRED');
    });
  });
});

// ── GoogleAdsProvider ─────────────────────────────────────────────────────────

describe('GoogleAdsProvider', () => {
  let provider: GoogleAdsProvider;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GoogleAdsProvider],
    }).compile();
    provider = module.get<GoogleAdsProvider>(GoogleAdsProvider);
  });

  it('discoverAccounts throws NotImplementedException', async () => {
    await expect(
      provider.discoverAccounts({ accessToken: 'token' }),
    ).rejects.toThrow(NotImplementedException);
  });

  it('syncCampaigns throws NotImplementedException', async () => {
    await expect(
      provider.syncCampaigns({ providerAccountId: 'acct-1', accessToken: 'token' }),
    ).rejects.toThrow(NotImplementedException);
  });

  it('getMetrics throws NotImplementedException', async () => {
    await expect(
      provider.getMetrics(
        { providerAccountId: 'acct-1', accessToken: 'token' },
        { fromDate: '2026-10-01', toDate: '2026-10-20' },
      ),
    ).rejects.toThrow(NotImplementedException);
  });

  it('provider name is GOOGLE_ADS', () => {
    expect(provider.provider).toBe('GOOGLE_ADS');
  });
});

// ── MetaAdsProvider ───────────────────────────────────────────────────────────

describe('MetaAdsProvider', () => {
  let provider: MetaAdsProvider;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MetaAdsProvider],
    }).compile();
    provider = module.get<MetaAdsProvider>(MetaAdsProvider);
  });

  it('discoverAccounts throws NotImplementedException', async () => {
    await expect(
      provider.discoverAccounts({ accessToken: 'token' }),
    ).rejects.toThrow(NotImplementedException);
  });

  it('syncCampaigns throws NotImplementedException', async () => {
    await expect(
      provider.syncCampaigns({ providerAccountId: 'act_123', accessToken: 'token' }),
    ).rejects.toThrow(NotImplementedException);
  });

  it('error message mentions app review requirement', async () => {
    await expect(
      provider.discoverAccounts({ accessToken: 'token' }),
    ).rejects.toThrow(/app review/i);
  });
});

// ── TikTokAdsProvider ─────────────────────────────────────────────────────────

describe('TikTokAdsProvider', () => {
  let provider: TikTokAdsProvider;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TikTokAdsProvider],
    }).compile();
    provider = module.get<TikTokAdsProvider>(TikTokAdsProvider);
  });

  it('discoverAccounts throws NotImplementedException', async () => {
    await expect(
      provider.discoverAccounts({ accessToken: 'token' }),
    ).rejects.toThrow(NotImplementedException);
  });

  it('syncCampaigns throws NotImplementedException', async () => {
    await expect(
      provider.syncCampaigns({ providerAccountId: 'tiktok-acct-1', accessToken: 'token' }),
    ).rejects.toThrow(NotImplementedException);
  });

  it('error message mentions separate developer access tier', async () => {
    await expect(
      provider.discoverAccounts({ accessToken: 'token' }),
    ).rejects.toThrow(/developer access tier/i);
  });
});

// ── Security ──────────────────────────────────────────────────────────────────

describe('Security', () => {
  let accountService: AdvertisingAccountService;
  let campaignService: AdvertisingCampaignService;
  let actionService: AdvertisingActionService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdvertisingAccountService,
        AdvertisingCampaignService,
        AdvertisingActionService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();
    accountService = module.get<AdvertisingAccountService>(AdvertisingAccountService);
    campaignService = module.get<AdvertisingCampaignService>(AdvertisingCampaignService);
    actionService = module.get<AdvertisingActionService>(AdvertisingActionService);
  });

  it('Cross-org account access returns NotFoundException', async () => {
    mockPrisma.advertisingAccount.findFirst.mockResolvedValue(null);

    await expect(
      accountService.getAccount('org-ATTACKER', 'adacct-1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('Cross-org campaign access returns NotFoundException', async () => {
    mockPrisma.advertisingCampaign.findFirst.mockResolvedValue(null);

    await expect(
      campaignService.getCampaign('org-ATTACKER', 'camp-1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('Cross-org action access returns NotFoundException', async () => {
    mockPrisma.advertisingAction.findFirst.mockResolvedValue(null);

    await expect(
      actionService.cancelAction('org-ATTACKER', 'action-1', 'user-evil'),
    ).rejects.toThrow(NotFoundException);
  });

  it('Approval by same user as requester is rejected', async () => {
    const action = makeAction({ status: 'APPROVAL_REQUIRED', requestedById: 'user-1' });
    mockPrisma.advertisingAction.findFirst.mockResolvedValue(action);

    await expect(
      actionService.approveAction('org-1', 'user-1', 'action-1', mockQueue as unknown as QueueService),
    ).rejects.toThrow(ForbiddenException);
  });

  it('HIGH_RISK action (BID_CHANGE) always sets APPROVAL_REQUIRED', async () => {
    mockPrisma.advertisingAccount.findFirst.mockResolvedValue(makeAccount());
    mockPrisma.advertisingAction.create.mockImplementation(
      (args: { data: { status: string } }) =>
        Promise.resolve({ ...makeAction(), status: args.data.status }),
    );

    const result = await actionService.createAction('org-1', 'user-1', {
      provider: 'GOOGLE_ADS',
      advertisingAccountId: 'adacct-1',
      actionType: 'BID_CHANGE',
      requestPayload: { bidAmountMicros: 5_000_000 },
    });

    expect(result.status).toBe('APPROVAL_REQUIRED');
  });

  it('Action payload re-read from DB on submit (not from job data)', async () => {
    const action = makeAction({ status: 'APPROVED' });
    mockPrisma.advertisingAction.findUnique.mockResolvedValue(action);
    mockPrisma.advertisingAction.update.mockResolvedValue(action);

    // submitAction only receives the actionId — it re-reads from DB
    await actionService.submitAction('action-1');

    expect(mockPrisma.advertisingAction.findUnique).toHaveBeenCalledWith({
      where: { id: 'action-1' },
    });
  });

  it('Non-HIGH_RISK action (CAMPAIGN_PAUSE) is created as DRAFT', async () => {
    mockPrisma.advertisingAccount.findFirst.mockResolvedValue(makeAccount());
    mockPrisma.advertisingAction.create.mockImplementation(
      (args: { data: { status: string } }) =>
        Promise.resolve({ ...makeAction(), status: args.data.status }),
    );

    const result = await actionService.createAction('org-1', 'user-1', {
      provider: 'GOOGLE_ADS',
      advertisingAccountId: 'adacct-1',
      actionType: 'CAMPAIGN_PAUSE',
      requestPayload: { campaignId: 'camp-1' },
    });

    expect(result.status).toBe('DRAFT');
  });

  it('Duplicate submit is idempotent — FAILED action is skipped on second call', async () => {
    const alreadyFailed = makeAction({ status: 'FAILED' });
    mockPrisma.advertisingAction.findUnique.mockResolvedValue(alreadyFailed);

    await actionService.submitAction('action-1');

    // update must NOT be called for a terminal-status action
    expect(mockPrisma.advertisingAction.update).not.toHaveBeenCalled();
  });

  it('Duplicate submit is idempotent — APPLIED action is skipped on second call', async () => {
    const alreadyApplied = makeAction({ status: 'APPLIED' });
    mockPrisma.advertisingAction.findUnique.mockResolvedValue(alreadyApplied);

    await actionService.submitAction('action-1');

    expect(mockPrisma.advertisingAction.update).not.toHaveBeenCalled();
  });

  it('Duplicate submit is idempotent — SUBMITTED action is skipped on second call', async () => {
    const alreadySubmitted = makeAction({ status: 'SUBMITTED' });
    mockPrisma.advertisingAction.findUnique.mockResolvedValue(alreadySubmitted);

    await actionService.submitAction('action-1');

    expect(mockPrisma.advertisingAction.update).not.toHaveBeenCalled();
  });

  it('FOUNDATION provider submit sets FAILED with non-spend error message', async () => {
    const approvedAction = makeAction({ status: 'APPROVED', provider: 'GOOGLE_ADS' });
    mockPrisma.advertisingAction.findUnique.mockResolvedValue(approvedAction);
    const updatedToSubmitted = { ...approvedAction, status: 'SUBMITTED' };
    const updatedToFailed = { ...approvedAction, status: 'FAILED', errorMessage: expect.any(String) };
    mockPrisma.advertisingAction.update
      .mockResolvedValueOnce(updatedToSubmitted)
      .mockResolvedValueOnce(updatedToFailed);

    await actionService.submitAction('action-1');

    // First update: SUBMITTED; second update: FAILED
    expect(mockPrisma.advertisingAction.update).toHaveBeenCalledTimes(2);
    const secondCallArgs = mockPrisma.advertisingAction.update.mock.calls[1] as [{ where: unknown; data: { status: string; errorMessage?: string } }];
    expect(secondCallArgs[0].data.status).toBe('FAILED');
    expect(secondCallArgs[0].data.errorMessage).toContain('foundation-only');
  });

  it('Unapproved DRAFT action is NOT in terminal state — submitAction proceeds to SUBMITTED then FAILED', async () => {
    // A DRAFT action is not in terminal state, so idempotency guard does NOT block it.
    // The action will go through to the FOUNDATION stub and end up FAILED.
    const draftAction = makeAction({ status: 'DRAFT', provider: 'META' });
    mockPrisma.advertisingAction.findUnique.mockResolvedValue(draftAction);
    mockPrisma.advertisingAction.update
      .mockResolvedValueOnce({ ...draftAction, status: 'SUBMITTED' })
      .mockResolvedValueOnce({ ...draftAction, status: 'FAILED' });

    await actionService.submitAction('action-1');

    // update IS called (not skipped by idempotency guard)
    expect(mockPrisma.advertisingAction.update).toHaveBeenCalled();
    const firstUpdateArgs = mockPrisma.advertisingAction.update.mock.calls[0] as [{ where: unknown; data: { status: string } }];
    expect(firstUpdateArgs[0].data.status).toBe('SUBMITTED');
  });

  it('HIGH_RISK CAMPAIGN_ENABLE action requires approval — cannot be auto-submitted', async () => {
    mockPrisma.advertisingAccount.findFirst.mockResolvedValue(makeAccount());
    mockPrisma.advertisingAction.create.mockImplementation(
      (args: { data: { status: string } }) =>
        Promise.resolve({ ...makeAction(), status: args.data.status }),
    );

    const result = await actionService.createAction('org-1', 'user-1', {
      provider: 'GOOGLE_ADS',
      advertisingAccountId: 'adacct-1',
      actionType: 'CAMPAIGN_ENABLE',
      requestPayload: { campaignId: 'camp-1' },
    });

    // Must be APPROVAL_REQUIRED — cannot transition directly to submitted
    expect(result.status).toBe('APPROVAL_REQUIRED');
    // Queue must NOT have been called during createAction
    expect(mockQueue.enqueue).not.toHaveBeenCalled();
  });
});
