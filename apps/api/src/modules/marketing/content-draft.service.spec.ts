import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ContentDraftService } from './content-draft.service';
import { PrismaService } from '../../common/services/prisma.service';
import { AuditService } from '../audit/audit.service';

const mockPrisma = {
  contentDraft: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  contentVariant: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  marketingCampaign: {
    findFirst: jest.fn(),
  },
  socialAccount: {
    findMany: jest.fn(),
  },
  socialPublicationTarget: {
    findMany: jest.fn(),
    createMany: jest.fn(),
    deleteMany: jest.fn(),
    updateMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockAudit = { log: jest.fn().mockResolvedValue(undefined) };

describe('ContentDraftService', () => {
  let service: ContentDraftService;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Restore $transaction implementation after clearAllMocks wipes it
    mockPrisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(mockPrisma));
    mockPrisma.socialPublicationTarget.updateMany.mockResolvedValue({ count: 0 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentDraftService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get(ContentDraftService);
  });

  // ── list ────────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('returns drafts for org', async () => {
      const drafts = [{ id: 'd-1', title: 'Hello', status: 'DRAFT' }];
      mockPrisma.contentDraft.findMany.mockResolvedValue(drafts);
      mockPrisma.contentDraft.count.mockResolvedValue(1);

      const result = await service.list('org-1');

      expect(mockPrisma.contentDraft.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-1' } }),
      );
      expect(result.items).toEqual(drafts);
    });

    it('enforces organization isolation', async () => {
      mockPrisma.contentDraft.findMany.mockResolvedValue([]);
      mockPrisma.contentDraft.count.mockResolvedValue(0);

      await service.list('org-2');

      expect(mockPrisma.contentDraft.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-2' } }),
      );
    });
  });

  // ── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates a draft with correct fields', async () => {
      mockPrisma.contentDraft.create.mockResolvedValue({
        id: 'd-1',
        title: 'Summer Sale',
        status: 'DRAFT',
      });

      const result = await service.create(
        'org-1',
        { title: 'Summer Sale', targetChannel: 'SOCIAL' },
        'user-1',
      );

      expect(mockPrisma.contentDraft.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org-1',
            title: 'Summer Sale',
            ownerId: 'user-1',
          }),
        }),
      );
      expect(result.id).toBe('d-1');
    });

    it('rejects invalid channel', async () => {
      await expect(
        service.create('org-1', { title: 'Bad', targetChannel: 'PIGEONPOST' }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('verifies campaign belongs to org when campaignId provided', async () => {
      mockPrisma.marketingCampaign.findFirst.mockResolvedValue(null);

      await expect(
        service.create('org-1', { title: 'Test', campaignId: 'bad-campaign' }, 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── content lifecycle ────────────────────────────────────────────────────────

  describe('submitForReview', () => {
    it('transitions DRAFT to REVIEW', async () => {
      mockPrisma.contentDraft.findFirst.mockResolvedValue({ id: 'd-1', status: 'DRAFT' });
      mockPrisma.contentDraft.update.mockResolvedValue({ id: 'd-1', status: 'REVIEW' });

      await service.submitForReview('org-1', 'd-1', 'user-1');

      expect(mockPrisma.contentDraft.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'REVIEW' } }),
      );
    });

    it('throws when not DRAFT', async () => {
      mockPrisma.contentDraft.findFirst.mockResolvedValue({ id: 'd-1', status: 'APPROVED' });

      await expect(service.submitForReview('org-1', 'd-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('approve', () => {
    it('approves a REVIEW draft', async () => {
      mockPrisma.contentDraft.findFirst.mockResolvedValue({ id: 'd-1', status: 'REVIEW' });
      mockPrisma.contentDraft.update.mockResolvedValue({ id: 'd-1', status: 'APPROVED' });

      await service.approve('org-1', 'd-1', 'approver-1');

      expect(mockPrisma.contentDraft.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'APPROVED',
            approvedById: 'approver-1',
            approvedAt: expect.any(Date),
          }),
        }),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CONTENT_DRAFT_APPROVED' }),
      );
    });
  });

  describe('schedule', () => {
    it('schedules an APPROVED draft with future date', async () => {
      mockPrisma.contentDraft.findFirst.mockResolvedValue({
        id: 'd-1',
        status: 'APPROVED',
        timezone: 'UTC',
      });
      mockPrisma.socialAccount.findMany.mockResolvedValue([
        { id: 'acct-1', provider: 'FACEBOOK', connection: { status: 'active' } },
      ]);
      mockPrisma.contentVariant.findMany.mockResolvedValue([]);
      mockPrisma.socialPublicationTarget.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.socialPublicationTarget.createMany.mockResolvedValue({ count: 1 });
      mockPrisma.contentDraft.update.mockResolvedValue({ id: 'd-1', status: 'SCHEDULED' });

      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await service.schedule('org-1', 'd-1', { scheduledAt: futureDate, targetAccountIds: ['acct-1'] }, 'user-1');

      expect(mockPrisma.contentDraft.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'SCHEDULED', scheduledAt: expect.any(Date) }),
        }),
      );
    });

    it('rejects scheduling in the past', async () => {
      mockPrisma.contentDraft.findFirst.mockResolvedValue({ id: 'd-1', status: 'APPROVED', timezone: 'UTC' });

      await expect(
        service.schedule('org-1', 'd-1', { scheduledAt: '2020-01-01T00:00:00Z', targetAccountIds: ['acct-1'] }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects scheduling when not APPROVED', async () => {
      mockPrisma.contentDraft.findFirst.mockResolvedValue({ id: 'd-1', status: 'DRAFT', timezone: 'UTC' });

      await expect(
        service.schedule(
          'org-1',
          'd-1',
          { scheduledAt: new Date(Date.now() + 86400000).toISOString(), targetAccountIds: ['acct-1'] },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects scheduling with no target accounts', async () => {
      mockPrisma.contentDraft.findFirst.mockResolvedValue({ id: 'd-1', status: 'APPROVED', timezone: 'UTC' });

      await expect(
        service.schedule(
          'org-1',
          'd-1',
          { scheduledAt: new Date(Date.now() + 86400000).toISOString(), targetAccountIds: [] },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('cancelSchedule', () => {
    it('returns SCHEDULED draft to APPROVED', async () => {
      mockPrisma.contentDraft.findFirst.mockResolvedValue({ id: 'd-1', status: 'SCHEDULED' });
      mockPrisma.contentDraft.update.mockResolvedValue({ id: 'd-1', status: 'APPROVED' });

      await service.cancelSchedule('org-1', 'd-1', 'user-1');

      expect(mockPrisma.contentDraft.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'APPROVED', scheduledAt: null } }),
      );
    });
  });

  // ── unauthorized access ──────────────────────────────────────────────────────

  describe('cross-org IDOR protection', () => {
    it('throws NotFoundException when accessing draft from different org', async () => {
      mockPrisma.contentDraft.findFirst.mockResolvedValue(null);

      await expect(service.getById('org-2', 'draft-from-org-1')).rejects.toThrow(NotFoundException);

      expect(mockPrisma.contentDraft.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'draft-from-org-1', organizationId: 'org-2' } }),
      );
    });
  });

  // ── variants ────────────────────────────────────────────────────────────────

  describe('createVariant', () => {
    it('creates an INSTAGRAM variant', async () => {
      mockPrisma.contentDraft.findFirst.mockResolvedValue({ id: 'd-1', organizationId: 'org-1' });
      mockPrisma.contentVariant.findFirst.mockResolvedValue(null);
      mockPrisma.contentVariant.create.mockResolvedValue({
        id: 'v-1',
        draftId: 'd-1',
        platform: 'INSTAGRAM',
      });

      const result = await service.createVariant(
        'org-1',
        'd-1',
        { platform: 'INSTAGRAM', body: 'Hello IG!' },
        'user-1',
      );

      expect(mockPrisma.contentVariant.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ platform: 'INSTAGRAM', draftId: 'd-1' }),
        }),
      );
      expect(result.id).toBe('v-1');
    });

    it('rejects invalid platform', async () => {
      mockPrisma.contentDraft.findFirst.mockResolvedValue({ id: 'd-1', organizationId: 'org-1' });

      await expect(
        service.createVariant('org-1', 'd-1', { platform: 'MYSPACE' }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects duplicate platform variant', async () => {
      mockPrisma.contentDraft.findFirst.mockResolvedValue({ id: 'd-1', organizationId: 'org-1' });
      mockPrisma.contentVariant.findFirst.mockResolvedValue({ id: 'v-existing' });

      await expect(
        service.createVariant('org-1', 'd-1', { platform: 'INSTAGRAM' }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── update restrictions ──────────────────────────────────────────────────────

  describe('update', () => {
    it('allows editing DRAFT content', async () => {
      mockPrisma.contentDraft.findFirst.mockResolvedValue({ id: 'd-1', status: 'DRAFT' });
      mockPrisma.contentDraft.update.mockResolvedValue({ id: 'd-1', title: 'Updated' });

      await service.update('org-1', 'd-1', { title: 'Updated' }, 'user-1');

      expect(mockPrisma.contentDraft.update).toHaveBeenCalled();
    });

    it('blocks editing APPROVED content', async () => {
      mockPrisma.contentDraft.findFirst.mockResolvedValue({ id: 'd-1', status: 'APPROVED' });

      await expect(
        service.update('org-1', 'd-1', { title: 'Unauthorized edit' }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── apply-semantics (AI content persist) ─────────────────────────────────────

  describe('update — AI apply semantics', () => {
    const EXACT_BODY = 'Exclusive offer: 30% off all gadgets this weekend only.';
    const EXACT_CTA = 'Shop the Sale';

    it('persists the exact body passed — no transformation', async () => {
      mockPrisma.contentDraft.findFirst.mockResolvedValue({ id: 'd-1', status: 'DRAFT' });
      mockPrisma.contentDraft.update.mockResolvedValue({ id: 'd-1', body: EXACT_BODY });

      await service.update('org-1', 'd-1', { body: EXACT_BODY }, 'user-1');

      const updateArg = mockPrisma.contentDraft.update.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(updateArg.data.body).toBe(EXACT_BODY);
    });

    it('persists exact CTA alongside body without altering status', async () => {
      mockPrisma.contentDraft.findFirst.mockResolvedValue({ id: 'd-1', status: 'DRAFT' });
      mockPrisma.contentDraft.update.mockResolvedValue({ id: 'd-1', body: EXACT_BODY, callToAction: EXACT_CTA });

      await service.update('org-1', 'd-1', { body: EXACT_BODY, callToAction: EXACT_CTA }, 'user-1');

      const updateArg = mockPrisma.contentDraft.update.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(updateArg.data.body).toBe(EXACT_BODY);
      expect(updateArg.data.callToAction).toBe(EXACT_CTA);
      expect(updateArg.data.status).toBeUndefined();
    });

    it('never changes organizationId during body/CTA update (IDOR protection)', async () => {
      mockPrisma.contentDraft.findFirst.mockResolvedValue({ id: 'd-1', status: 'DRAFT' });
      mockPrisma.contentDraft.update.mockResolvedValue({ id: 'd-1', body: EXACT_BODY });

      await service.update('org-1', 'd-1', { body: EXACT_BODY }, 'user-1');

      const updateArg = mockPrisma.contentDraft.update.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(updateArg.data.organizationId).toBeUndefined();
    });

    it('enforces org isolation — throws NotFoundException for cross-org apply', async () => {
      mockPrisma.contentDraft.findFirst.mockResolvedValue(null);

      await expect(
        service.update('org-evil', 'd-1', { body: EXACT_BODY }, 'attacker'),
      ).rejects.toThrow(NotFoundException);
    });

    it('status remains DRAFT after body update — apply never auto-promotes', async () => {
      mockPrisma.contentDraft.findFirst.mockResolvedValue({ id: 'd-1', status: 'DRAFT' });
      mockPrisma.contentDraft.update.mockResolvedValue({ id: 'd-1', body: EXACT_BODY, status: 'DRAFT' });

      await service.update('org-1', 'd-1', { body: EXACT_BODY }, 'user-1');

      const updateArg = mockPrisma.contentDraft.update.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      // status must not be written — it must stay as-is at DB level
      expect(updateArg.data.status).toBeUndefined();
    });
  });

  // ── calendar ─────────────────────────────────────────────────────────────────

  describe('getCalendar', () => {
    it('returns scheduled drafts in date range', async () => {
      const scheduledDrafts = [
        { id: 'd-1', title: 'Post 1', status: 'SCHEDULED', scheduledAt: new Date() },
      ];
      mockPrisma.contentDraft.findMany.mockResolvedValue(scheduledDrafts);

      const result = await service.getCalendar('org-1', {});

      expect(mockPrisma.contentDraft.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-1',
            status: { in: ['SCHEDULED', 'PUBLISHED'] },
          }),
        }),
      );
      expect(result).toEqual(scheduledDrafts);
    });
  });
});
