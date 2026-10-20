import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MarketingCampaignService } from './marketing-campaign.service';
import { PrismaService } from '../../common/services/prisma.service';
import { AuditService } from '../audit/audit.service';

const mockPrisma = {
  marketingCampaign: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
};

const mockAudit = { log: jest.fn().mockResolvedValue(undefined) };

describe('MarketingCampaignService', () => {
  let service: MarketingCampaignService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketingCampaignService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get(MarketingCampaignService);
  });

  // ── list ────────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('returns campaigns for org with pagination', async () => {
      const campaigns = [{ id: 'c-1', name: 'Promo', status: 'DRAFT' }];
      mockPrisma.marketingCampaign.findMany.mockResolvedValue(campaigns);
      mockPrisma.marketingCampaign.count.mockResolvedValue(1);

      const result = await service.list('org-1', { page: 1, pageSize: 10 });

      expect(mockPrisma.marketingCampaign.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-1' } }),
      );
      expect(result.items).toEqual(campaigns);
      expect(result.total).toBe(1);
    });

    it('filters by status', async () => {
      mockPrisma.marketingCampaign.findMany.mockResolvedValue([]);
      mockPrisma.marketingCampaign.count.mockResolvedValue(0);

      await service.list('org-1', { status: 'ACTIVE' });

      expect(mockPrisma.marketingCampaign.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-1', status: 'ACTIVE' } }),
      );
    });

    it('enforces organization isolation — cannot see other org campaigns', async () => {
      mockPrisma.marketingCampaign.findMany.mockResolvedValue([]);
      mockPrisma.marketingCampaign.count.mockResolvedValue(0);

      await service.list('org-2', {});

      expect(mockPrisma.marketingCampaign.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-2' } }),
      );
      expect(mockPrisma.marketingCampaign.findMany).not.toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-1' } }),
      );
    });
  });

  // ── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates a campaign with correct defaults', async () => {
      mockPrisma.marketingCampaign.create.mockResolvedValue({
        id: 'c-1',
        name: 'Black Friday',
        objective: 'PROMOTION',
        status: 'DRAFT',
      });

      const result = await service.create(
        'org-1',
        { name: 'Black Friday', objective: 'PROMOTION' },
        'user-1',
      );

      expect(mockPrisma.marketingCampaign.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org-1',
            name: 'Black Friday',
            objective: 'PROMOTION',
            createdById: 'user-1',
          }),
        }),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'MARKETING_CAMPAIGN_CREATED' }),
      );
      expect(result.id).toBe('c-1');
    });

    it('throws when endDate is before startDate', async () => {
      await expect(
        service.create(
          'org-1',
          { name: 'Bad Dates', startDate: '2026-12-31', endDate: '2026-01-01' },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts valid date range', async () => {
      mockPrisma.marketingCampaign.create.mockResolvedValue({ id: 'c-2', name: 'Good Dates' });

      await expect(
        service.create(
          'org-1',
          { name: 'Good Dates', startDate: '2026-11-01', endDate: '2026-11-30' },
          'user-1',
        ),
      ).resolves.not.toThrow();
    });
  });

  // ── getById ─────────────────────────────────────────────────────────────────

  describe('getById', () => {
    it('returns campaign by id for correct org', async () => {
      const campaign = { id: 'c-1', organizationId: 'org-1', name: 'Test' };
      mockPrisma.marketingCampaign.findFirst.mockResolvedValue(campaign);

      const result = await service.getById('org-1', 'c-1');
      expect(result).toEqual(campaign);
    });

    it('throws NotFoundException for unknown id', async () => {
      mockPrisma.marketingCampaign.findFirst.mockResolvedValue(null);

      await expect(service.getById('org-1', 'bad-id')).rejects.toThrow(NotFoundException);
    });

    it('enforces org isolation — throws for wrong org', async () => {
      mockPrisma.marketingCampaign.findFirst.mockResolvedValue(null);

      await expect(service.getById('org-2', 'c-1')).rejects.toThrow(NotFoundException);

      expect(mockPrisma.marketingCampaign.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'c-1', organizationId: 'org-2' } }),
      );
    });
  });

  // ── campaign lifecycle ───────────────────────────────────────────────────────

  describe('submitForReview', () => {
    it('transitions DRAFT to REVIEW', async () => {
      mockPrisma.marketingCampaign.findFirst.mockResolvedValue({ id: 'c-1', status: 'DRAFT' });
      mockPrisma.marketingCampaign.update.mockResolvedValue({ id: 'c-1', status: 'REVIEW' });

      await service.submitForReview('org-1', 'c-1', 'user-1');

      expect(mockPrisma.marketingCampaign.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'REVIEW' } }),
      );
    });

    it('throws when campaign not in DRAFT status', async () => {
      mockPrisma.marketingCampaign.findFirst.mockResolvedValue({ id: 'c-1', status: 'ACTIVE' });

      await expect(service.submitForReview('org-1', 'c-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('approve', () => {
    it('transitions REVIEW to APPROVED and sets approvedById', async () => {
      mockPrisma.marketingCampaign.findFirst.mockResolvedValue({ id: 'c-1', status: 'REVIEW' });
      mockPrisma.marketingCampaign.update.mockResolvedValue({ id: 'c-1', status: 'APPROVED' });

      await service.approve('org-1', 'c-1', 'approver-1');

      expect(mockPrisma.marketingCampaign.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'APPROVED',
            approvedById: 'approver-1',
            approvedAt: expect.any(Date),
          }),
        }),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'MARKETING_CAMPAIGN_APPROVED' }),
      );
    });

    it('throws when campaign not in REVIEW status', async () => {
      mockPrisma.marketingCampaign.findFirst.mockResolvedValue({ id: 'c-1', status: 'DRAFT' });

      await expect(service.approve('org-1', 'c-1', 'user-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('reject', () => {
    it('returns REVIEW campaign to DRAFT', async () => {
      mockPrisma.marketingCampaign.findFirst.mockResolvedValue({ id: 'c-1', status: 'REVIEW' });
      mockPrisma.marketingCampaign.update.mockResolvedValue({ id: 'c-1', status: 'DRAFT' });

      await service.reject('org-1', 'c-1', 'user-1', 'Needs more work');

      expect(mockPrisma.marketingCampaign.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'DRAFT' } }),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'MARKETING_CAMPAIGN_REJECTED',
          metadata: { reason: 'Needs more work' },
        }),
      );
    });
  });

  describe('pause', () => {
    it('transitions ACTIVE to PAUSED', async () => {
      mockPrisma.marketingCampaign.findFirst.mockResolvedValue({ id: 'c-1', status: 'ACTIVE' });
      mockPrisma.marketingCampaign.update.mockResolvedValue({ id: 'c-1', status: 'PAUSED' });

      await service.pause('org-1', 'c-1', 'user-1');

      expect(mockPrisma.marketingCampaign.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'PAUSED' } }),
      );
    });

    it('throws when not ACTIVE', async () => {
      mockPrisma.marketingCampaign.findFirst.mockResolvedValue({ id: 'c-1', status: 'DRAFT' });

      await expect(service.pause('org-1', 'c-1', 'user-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('cancel', () => {
    it('cancels any non-cancelled campaign', async () => {
      mockPrisma.marketingCampaign.findFirst.mockResolvedValue({ id: 'c-1', status: 'ACTIVE' });
      mockPrisma.marketingCampaign.update.mockResolvedValue({ id: 'c-1', status: 'CANCELLED' });

      await service.cancel('org-1', 'c-1', 'user-1');

      expect(mockPrisma.marketingCampaign.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'CANCELLED' } }),
      );
    });

    it('throws when already cancelled', async () => {
      mockPrisma.marketingCampaign.findFirst.mockResolvedValue({ id: 'c-1', status: 'CANCELLED' });

      await expect(service.cancel('org-1', 'c-1', 'user-1')).rejects.toThrow(BadRequestException);
    });
  });

  // ── getDashboardSummary ──────────────────────────────────────────────────────

  describe('getDashboardSummary', () => {
    it('returns counts by status', async () => {
      mockPrisma.marketingCampaign.count
        .mockResolvedValueOnce(3) // active
        .mockResolvedValueOnce(5) // draft
        .mockResolvedValueOnce(1) // scheduled
        .mockResolvedValueOnce(2); // review

      const result = await service.getDashboardSummary('org-1');

      expect(result.active).toBe(3);
      expect(result.draft).toBe(5);
      expect(result.scheduled).toBe(1);
      expect(result.awaitingReview).toBe(2);
    });
  });
});
