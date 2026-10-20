import { MarketingSchedulerProcessor } from './marketing-scheduler.processor';
import { JOB_TYPES } from '@knef/constants';
import type { Job } from 'bullmq';

const makePrisma = () => ({
  contentDraft: {
    findMany: jest.fn(),
    update: jest.fn(),
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
jest.mock('bullmq', () => ({ Worker: jest.fn().mockImplementation(() => ({ on: jest.fn(), close: jest.fn() })) }));
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
    // Skip onModuleInit to avoid real Redis connections
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
});
