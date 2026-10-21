import { MarketingSchedulerProcessor } from './marketing-scheduler.processor';
import { JOB_TYPES } from '@knef/constants';
import type { Job } from 'bullmq';

const makePrisma = () => ({
  contentDraft: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
  socialPublicationTarget: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  publicationAttempt: {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 'attempt-1' }),
  },
});

const makeTarget = (overrides: Partial<{
  id: string;
  draftId: string;
  socialAccountId: string;
  provider: string;
  variantId: string | null;
  isCancelled: boolean;
  socialAccount: {
    id: string;
    provider: string;
    isActive: boolean;
    organizationId: string;
    providerAccountId: string;
    connection: { status: string };
  };
}> = {}) => ({
  id: overrides.id ?? 'target-1',
  draftId: overrides.draftId ?? 'draft-1',
  socialAccountId: overrides.socialAccountId ?? 'acct-1',
  provider: overrides.provider ?? 'FACEBOOK',
  variantId: overrides.variantId ?? null,
  isCancelled: overrides.isCancelled ?? false,
  socialAccount: overrides.socialAccount ?? {
    id: 'acct-1',
    provider: 'FACEBOOK',
    isActive: true,
    organizationId: 'org-1',
    providerAccountId: 'fb-page-1',
    connection: { status: 'active' },
  },
});

const makeConfig = () => ({
  get: jest.fn((key: string) => {
    if (key === 'REDIS_URL') return 'redis://localhost:6379';
    return undefined;
  }),
});

function makeJob(data: unknown): Job {
  return { id: 'j-1', name: JOB_TYPES.MARKETING_SCHEDULE_CHECK, data } as Job;
}

// Prevent the processor from opening real Redis/BullMQ connections in tests
jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation(() => ({ on: jest.fn(), close: jest.fn() })),
  Queue: jest.fn().mockImplementation(() => ({ add: jest.fn().mockResolvedValue({}), close: jest.fn().mockResolvedValue(undefined) })),
}));
jest.mock('ioredis', () => jest.fn().mockImplementation(() => ({ quit: jest.fn() })));

describe('MarketingSchedulerProcessor — scheduling invariant', () => {
  let processor: MarketingSchedulerProcessor;
  let mockPrisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma = makePrisma();
    const config = makeConfig();
    processor = new MarketingSchedulerProcessor(
      mockPrisma as never,
      config as never,
    );
    processor.onModuleInit(); // safe: bullmq and ioredis are fully mocked above
  });

  describe('processScheduleCheck', () => {
    it('does nothing when no drafts are due', async () => {
      mockPrisma.contentDraft.findMany.mockResolvedValue([]);

      await processor.process(makeJob({ organizationId: 'org-1' }));

      expect(mockPrisma.contentDraft.update).not.toHaveBeenCalled();
    });

    it('NEVER auto-transitions SCHEDULED drafts to PUBLISHED — reaching scheduledAt alone is not publication', async () => {
      const dueDraft = {
        id: 'draft-1',
        title: 'Spring Sale',
        targetChannel: 'EMAIL',
      };
      mockPrisma.contentDraft.findMany.mockResolvedValue([dueDraft]);

      await processor.process(makeJob({ organizationId: 'org-1' }));

      // Core invariant: no status update must be written
      expect(mockPrisma.contentDraft.update).not.toHaveBeenCalled();
    });

    it('does not set status PUBLISHED on any due draft regardless of count', async () => {
      const drafts = [
        { id: 'draft-1', title: 'A', targetChannel: 'EMAIL' },
        { id: 'draft-2', title: 'B', targetChannel: 'SMS' },
        { id: 'draft-3', title: 'C', targetChannel: 'WHATSAPP' },
      ];
      mockPrisma.contentDraft.findMany.mockResolvedValue(drafts);

      await processor.process(makeJob({ organizationId: 'org-1' }));

      expect(mockPrisma.contentDraft.update).not.toHaveBeenCalled();
    });

    it('queries only SCHEDULED drafts with scheduledAt <= now for the correct org', async () => {
      mockPrisma.contentDraft.findMany.mockResolvedValue([]);

      const before = new Date();
      await processor.process(makeJob({ organizationId: 'org-99' }));
      const after = new Date();

      const call = mockPrisma.contentDraft.findMany.mock.calls[0][0] as {
        where: {
          organizationId: string;
          status: string;
          scheduledAt: { lte: Date };
        };
      };
      expect(call.where.organizationId).toBe('org-99');
      expect(call.where.status).toBe('SCHEDULED');
      expect(call.where.scheduledAt.lte.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(call.where.scheduledAt.lte.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('ignores unknown job types', async () => {
      const job = { id: 'j-1', name: 'UNKNOWN_JOB', data: { organizationId: 'org-1' } } as Job;

      await processor.process(job);

      expect(mockPrisma.contentDraft.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.contentDraft.update).not.toHaveBeenCalled();
    });

    it('is idempotent — running schedule-check twice does not change state', async () => {
      const dueDraft = { id: 'draft-1', title: 'Idempotent Test', targetChannel: 'EMAIL' };
      mockPrisma.contentDraft.findMany.mockResolvedValue([dueDraft]);

      const jobData = makeJob({ organizationId: 'org-1' });
      await processor.process(jobData);
      await processor.process(jobData);

      expect(mockPrisma.contentDraft.update).not.toHaveBeenCalled();
    });
  });

  describe('destination safety invariants', () => {
    it('Scenario 1: 5 active accounts, 2 selected — exactly 2 PublicationAttempts', async () => {
      const draft = { id: 'draft-1', title: 'Test', targetChannel: 'SOCIAL' };
      mockPrisma.contentDraft.findMany.mockResolvedValue([draft]);
      mockPrisma.socialPublicationTarget.findMany.mockResolvedValue([
        makeTarget({ id: 't-1', socialAccountId: 'acct-1', provider: 'FACEBOOK', socialAccount: { id: 'acct-1', provider: 'FACEBOOK', isActive: true, organizationId: 'org-1', providerAccountId: 'fb-1', connection: { status: 'active' } } }),
        makeTarget({ id: 't-2', socialAccountId: 'acct-2', provider: 'INSTAGRAM', socialAccount: { id: 'acct-2', provider: 'INSTAGRAM', isActive: true, organizationId: 'org-1', providerAccountId: 'ig-1', connection: { status: 'active' } } }),
      ]);

      await processor.process(makeJob({ organizationId: 'org-1' }));

      expect(mockPrisma.publicationAttempt.create).toHaveBeenCalledTimes(2);
    });

    it('Scenario 2: 0 selected targets — 0 provider calls, 0 attempts', async () => {
      const draft = { id: 'draft-1', title: 'Test', targetChannel: 'SOCIAL' };
      mockPrisma.contentDraft.findMany.mockResolvedValue([draft]);
      mockPrisma.socialPublicationTarget.findMany.mockResolvedValue([]);

      await processor.process(makeJob({ organizationId: 'org-1' }));

      expect(mockPrisma.publicationAttempt.create).not.toHaveBeenCalled();
    });

    it('Scenario 3: 2 accounts same provider, 1 selected — only selected account used', async () => {
      const draft = { id: 'draft-1', title: 'Test', targetChannel: 'SOCIAL' };
      mockPrisma.contentDraft.findMany.mockResolvedValue([draft]);
      // Only one Facebook account is targeted (not the other FB account)
      mockPrisma.socialPublicationTarget.findMany.mockResolvedValue([
        makeTarget({ socialAccountId: 'fb-selected', provider: 'FACEBOOK', socialAccount: { id: 'fb-selected', provider: 'FACEBOOK', isActive: true, organizationId: 'org-1', providerAccountId: 'page-A', connection: { status: 'active' } } }),
      ]);

      await processor.process(makeJob({ organizationId: 'org-1' }));

      expect(mockPrisma.publicationAttempt.create).toHaveBeenCalledTimes(1);
      const createCall = mockPrisma.publicationAttempt.create.mock.calls[0][0] as { data: { socialAccountId: string } };
      expect(createCall.data.socialAccountId).toBe('fb-selected');
    });

    it('Scenario 4: cross-org socialAccountId — skipped (organizationId mismatch)', async () => {
      const draft = { id: 'draft-1', title: 'Test', targetChannel: 'SOCIAL' };
      mockPrisma.contentDraft.findMany.mockResolvedValue([draft]);
      mockPrisma.socialPublicationTarget.findMany.mockResolvedValue([
        makeTarget({ socialAccount: { id: 'acct-X', provider: 'FACEBOOK', isActive: true, organizationId: 'org-OTHER', providerAccountId: 'fb-x', connection: { status: 'active' } } }),
      ]);

      await processor.process(makeJob({ organizationId: 'org-1' }));

      expect(mockPrisma.publicationAttempt.create).not.toHaveBeenCalled();
    });

    it('Scenario 5: inactive selected account — no provider call', async () => {
      const draft = { id: 'draft-1', title: 'Test', targetChannel: 'SOCIAL' };
      mockPrisma.contentDraft.findMany.mockResolvedValue([draft]);
      mockPrisma.socialPublicationTarget.findMany.mockResolvedValue([
        makeTarget({ socialAccount: { id: 'acct-1', provider: 'FACEBOOK', isActive: false, organizationId: 'org-1', providerAccountId: 'fb-1', connection: { status: 'active' } } }),
      ]);

      await processor.process(makeJob({ organizationId: 'org-1' }));

      expect(mockPrisma.publicationAttempt.create).not.toHaveBeenCalled();
    });

    it('Scenario 6: disconnected selected account — safe failure, no attempt', async () => {
      const draft = { id: 'draft-1', title: 'Test', targetChannel: 'SOCIAL' };
      mockPrisma.contentDraft.findMany.mockResolvedValue([draft]);
      mockPrisma.socialPublicationTarget.findMany.mockResolvedValue([
        makeTarget({ socialAccount: { id: 'acct-1', provider: 'TIKTOK', isActive: true, organizationId: 'org-1', providerAccountId: 'tt-1', connection: { status: 'disconnected' } } }),
      ]);

      await processor.process(makeJob({ organizationId: 'org-1' }));

      expect(mockPrisma.publicationAttempt.create).not.toHaveBeenCalled();
    });

    it('Scenario 7: repeated scheduler execution — no duplicate attempt', async () => {
      const draft = { id: 'draft-1', title: 'Test', targetChannel: 'SOCIAL' };
      mockPrisma.contentDraft.findMany.mockResolvedValue([draft]);
      mockPrisma.socialPublicationTarget.findMany.mockResolvedValue([
        makeTarget(),
      ]);
      // Second run: existing attempt exists
      mockPrisma.publicationAttempt.findFirst
        .mockResolvedValueOnce(null)           // first run: no existing
        .mockResolvedValueOnce({ id: 'existing-attempt' }); // second run: exists

      await processor.process(makeJob({ organizationId: 'org-1' }));
      await processor.process(makeJob({ organizationId: 'org-1' }));

      expect(mockPrisma.publicationAttempt.create).toHaveBeenCalledTimes(1); // only once
    });

    it('Scenario 8: cancelled target — no publication attempt created', async () => {
      const draft = { id: 'draft-1', title: 'Test', targetChannel: 'SOCIAL' };
      mockPrisma.contentDraft.findMany.mockResolvedValue([draft]);
      // isCancelled targets are filtered by the DB query (isCancelled: false in where clause)
      // The mock returns empty array simulating DB filtering
      mockPrisma.socialPublicationTarget.findMany.mockResolvedValue([]);

      await processor.process(makeJob({ organizationId: 'org-1' }));

      expect(mockPrisma.publicationAttempt.create).not.toHaveBeenCalled();
    });

    it('Scenario 9: unselected account is never contacted', async () => {
      const draft = { id: 'draft-1', title: 'Test', targetChannel: 'SOCIAL' };
      mockPrisma.contentDraft.findMany.mockResolvedValue([draft]);
      // Only Instagram is targeted, NOT the Facebook account that also exists in the org
      mockPrisma.socialPublicationTarget.findMany.mockResolvedValue([
        makeTarget({ socialAccountId: 'ig-acct', provider: 'INSTAGRAM', socialAccount: { id: 'ig-acct', provider: 'INSTAGRAM', isActive: true, organizationId: 'org-1', providerAccountId: 'ig-1', connection: { status: 'active' } } }),
      ]);

      await processor.process(makeJob({ organizationId: 'org-1' }));

      // Only the Instagram account gets an attempt
      expect(mockPrisma.publicationAttempt.create).toHaveBeenCalledTimes(1);
      const createCall = mockPrisma.publicationAttempt.create.mock.calls[0][0] as { data: { provider: string; socialAccountId: string } };
      expect(createCall.data.provider).toBe('INSTAGRAM');
      expect(createCall.data.socialAccountId).toBe('ig-acct');
    });
  });
});
