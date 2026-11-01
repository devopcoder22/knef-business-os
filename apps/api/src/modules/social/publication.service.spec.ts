import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PublicationService } from './publication.service';
import { PrismaService } from '../../common/services/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ExternalConnectionsService } from '../integrations/external-connections.service';
import { QueueService } from '../../common/services/queue.service';
import { SsrfGuardService } from './ssrf-guard.service';
import { FacebookPagePublisher } from './publishers/facebook-page.publisher';
import { InstagramPublisher } from './publishers/instagram.publisher';
import { TikTokPublisher } from './publishers/tiktok.publisher';
import { SnapchatPublisher } from './publishers/snapchat.publisher';
import { PUBLICATION_STATUS } from './publishers/publisher.interface';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockPrisma = {
  contentDraft: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  socialAccount: {
    findFirst: jest.fn(),
  },
  publicationAttempt: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  mediaAsset: {
    findMany: jest.fn().mockResolvedValue([]),
  },
};

const mockAudit = { log: jest.fn().mockResolvedValue(undefined) };
const mockConnections = { decryptConnectionToken: jest.fn().mockResolvedValue('decrypted-token') };
const mockQueues = { enqueue: jest.fn().mockResolvedValue('job-id-1') };
const mockSsrf = { assertSafeUrl: jest.fn().mockResolvedValue(undefined) };

const mockFb: Partial<FacebookPagePublisher> = {
  provider: 'FACEBOOK',
  validateContent: jest.fn().mockReturnValue({ valid: true, errors: [] }),
  publish: jest.fn().mockResolvedValue({ status: PUBLICATION_STATUS.PUBLISHED, externalPostId: 'fb-123', isRetryable: false }),
  getPublicationStatus: jest.fn(),
};

const mockIg: Partial<InstagramPublisher> = {
  provider: 'INSTAGRAM',
  validateContent: jest.fn().mockReturnValue({ valid: true, errors: [] }),
  publish: jest.fn().mockResolvedValue({ status: PUBLICATION_STATUS.PUBLISHED, externalPostId: 'ig-456', isRetryable: false }),
  getPublicationStatus: jest.fn(),
};

const mockTt: Partial<TikTokPublisher> = {
  provider: 'TIKTOK',
  validateContent: jest.fn().mockReturnValue({ valid: true, errors: [] }),
  publish: jest.fn().mockResolvedValue({ status: PUBLICATION_STATUS.PROCESSING, providerPublishId: 'tt-pub-789', isRetryable: false }),
  getPublicationStatus: jest.fn(),
};

const mockSc: Partial<SnapchatPublisher> = {
  provider: 'SNAPCHAT',
  validateContent: jest.fn().mockReturnValue({ valid: false, errors: ['FOUNDATION_ONLY'] }),
  publish: jest.fn().mockResolvedValue({ status: PUBLICATION_STATUS.REQUIRES_USER_ACTION, isRetryable: false }),
  getPublicationStatus: jest.fn(),
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const makeApprovedDraft = (overrides = {}) => ({
  id: 'draft-1',
  organizationId: 'org-1',
  status: 'APPROVED',
  body: 'Hello world',
  callToAction: null,
  destinationUrl: null,
  variants: [],
  ...overrides,
});

const makeSocialAccount = (overrides = {}) => ({
  id: 'sa-1',
  organizationId: 'org-1',
  provider: 'FACEBOOK',
  providerAccountId: 'page-123',
  isActive: true,
  connection: { id: 'conn-1' },
  ...overrides,
});

const makeAttempt = (overrides = {}) => ({
  id: 'attempt-1',
  organizationId: 'org-1',
  draftId: 'draft-1',
  variantId: null,
  socialAccountId: 'sa-1',
  provider: 'FACEBOOK',
  externalAccountId: 'page-123',
  status: 'QUEUED',
  idempotencyKey: 'idem-key',
  attemptNumber: 1,
  externalPostId: null,
  providerPublishId: null,
  isRetryable: false,
  draft: makeApprovedDraft(),
  socialAccount: { ...makeSocialAccount(), connection: { id: 'conn-1' } },
  variant: null,
  ...overrides,
});

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('PublicationService', () => {
  let service: PublicationService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PublicationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
        { provide: ExternalConnectionsService, useValue: mockConnections },
        { provide: QueueService, useValue: mockQueues },
        { provide: SsrfGuardService, useValue: mockSsrf },
        { provide: FacebookPagePublisher, useValue: mockFb },
        { provide: InstagramPublisher, useValue: mockIg },
        { provide: TikTokPublisher, useValue: mockTt },
        { provide: SnapchatPublisher, useValue: mockSc },
      ],
    }).compile();

    service = module.get<PublicationService>(PublicationService);
  });

  // ── publishNow ────────────────────────────────────────────────────────────

  describe('publishNow', () => {
    it('creates attempt with QUEUED status', async () => {
      mockPrisma.contentDraft.findFirst.mockResolvedValue(makeApprovedDraft());
      mockPrisma.socialAccount.findFirst.mockResolvedValue(makeSocialAccount());
      const attempt = makeAttempt();
      mockPrisma.publicationAttempt.create.mockResolvedValue(attempt);

      const result = await service.publishNow('org-1', 'user-1', 'draft-1', 'sa-1');

      expect(mockPrisma.publicationAttempt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: PUBLICATION_STATUS.QUEUED }),
        }),
      );
      expect(result).toBe(attempt);
    });

    it('enqueues SOCIAL_PUBLISH job with deterministic jobId', async () => {
      mockPrisma.contentDraft.findFirst.mockResolvedValue(makeApprovedDraft());
      mockPrisma.socialAccount.findFirst.mockResolvedValue(makeSocialAccount());
      const attempt = makeAttempt({ id: 'attempt-abc' });
      mockPrisma.publicationAttempt.create.mockResolvedValue(attempt);

      await service.publishNow('org-1', 'user-1', 'draft-1', 'sa-1');

      expect(mockQueues.enqueue).toHaveBeenCalledWith(
        'marketing',
        'social-publish',
        expect.objectContaining({ attemptId: 'attempt-abc' }),
        expect.objectContaining({ jobId: 'social-publish:attempt-abc' }),
      );
    });

    it('throws NotFoundException for cross-org draft', async () => {
      mockPrisma.contentDraft.findFirst.mockResolvedValue(null);

      await expect(
        service.publishNow('org-OTHER', 'user-1', 'draft-1', 'sa-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for cross-org social account', async () => {
      mockPrisma.contentDraft.findFirst.mockResolvedValue(makeApprovedDraft());
      mockPrisma.socialAccount.findFirst.mockResolvedValue(null);

      await expect(
        service.publishNow('org-1', 'user-1', 'draft-1', 'sa-OTHER'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException for DRAFT status content', async () => {
      mockPrisma.contentDraft.findFirst.mockResolvedValue(makeApprovedDraft({ status: 'DRAFT' }));

      await expect(
        service.publishNow('org-1', 'user-1', 'draft-1', 'sa-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for REVIEW status content', async () => {
      mockPrisma.contentDraft.findFirst.mockResolvedValue(makeApprovedDraft({ status: 'REVIEW' }));

      await expect(
        service.publishNow('org-1', 'user-1', 'draft-1', 'sa-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts SCHEDULED status content', async () => {
      mockPrisma.contentDraft.findFirst.mockResolvedValue(makeApprovedDraft({ status: 'SCHEDULED' }));
      mockPrisma.socialAccount.findFirst.mockResolvedValue(makeSocialAccount());
      mockPrisma.publicationAttempt.create.mockResolvedValue(makeAttempt());

      await expect(
        service.publishNow('org-1', 'user-1', 'draft-1', 'sa-1'),
      ).resolves.not.toThrow();
    });
  });

  // ── executePublish ────────────────────────────────────────────────────────

  describe('executePublish', () => {
    it('skips if attempt already PUBLISHED (idempotent)', async () => {
      mockPrisma.publicationAttempt.findUnique.mockResolvedValue(
        makeAttempt({ status: PUBLICATION_STATUS.PUBLISHED }),
      );

      await service.executePublish('attempt-1');

      expect(mockFb.publish).not.toHaveBeenCalled();
    });

    it('fails with DRAFT_NOT_PUBLISHABLE when draft status changed', async () => {
      mockPrisma.publicationAttempt.findUnique.mockResolvedValue(
        makeAttempt({ draft: makeApprovedDraft({ status: 'DRAFT' }) }),
      );
      mockPrisma.publicationAttempt.update.mockResolvedValue({});

      await service.executePublish('attempt-1');

      expect(mockPrisma.publicationAttempt.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ errorCode: 'DRAFT_NOT_PUBLISHABLE' }),
        }),
      );
    });

    it('calls Facebook publisher and marks PUBLISHED on success', async () => {
      mockPrisma.publicationAttempt.findUnique.mockResolvedValue(makeAttempt());
      mockPrisma.publicationAttempt.update.mockResolvedValue({});
      mockPrisma.publicationAttempt.findMany.mockResolvedValue([makeAttempt({ status: PUBLICATION_STATUS.PUBLISHED })]);
      mockPrisma.contentDraft.update.mockResolvedValue({});

      await service.executePublish('attempt-1');

      expect(mockFb.publish).toHaveBeenCalled();
      expect(mockPrisma.publicationAttempt.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: PUBLICATION_STATUS.PUBLISHED }),
        }),
      );
    });

    it('enqueues SOCIAL_STATUS_CHECK for PROCESSING result (TikTok)', async () => {
      mockPrisma.publicationAttempt.findUnique.mockResolvedValue(
        makeAttempt({ provider: 'TIKTOK', socialAccount: { ...makeSocialAccount(), provider: 'TIKTOK', connection: { id: 'conn-1' } } }),
      );
      mockPrisma.publicationAttempt.update.mockResolvedValue({});
      mockPrisma.publicationAttempt.findMany.mockResolvedValue([]);

      await service.executePublish('attempt-1');

      expect(mockQueues.enqueue).toHaveBeenCalledWith(
        'marketing',
        'social-status-check',
        expect.objectContaining({ attemptId: 'attempt-1' }),
        expect.anything(),
      );
    });

    it('calls SSRF guard for each media asset', async () => {
      const assets = [
        { id: 'a1', url: 'https://cdn.example.com/img.jpg', mimeType: 'image/jpeg', size: 1000, filename: 'img.jpg' },
      ];
      mockPrisma.publicationAttempt.findUnique.mockResolvedValue(
        makeAttempt({ variant: { mediaAssetIds: JSON.stringify(['a1']), body: 'test', callToAction: null } }),
      );
      mockPrisma.mediaAsset.findMany.mockResolvedValue(assets);
      mockPrisma.publicationAttempt.update.mockResolvedValue({});
      mockPrisma.publicationAttempt.findMany.mockResolvedValue([makeAttempt({ status: PUBLICATION_STATUS.PUBLISHED })]);
      mockPrisma.contentDraft.update.mockResolvedValue({});

      await service.executePublish('attempt-1');

      expect(mockSsrf.assertSafeUrl).toHaveBeenCalledWith('https://cdn.example.com/img.jpg');
    });

    it('fails with MEDIA_VALIDATION_FAILED when validation fails', async () => {
      (mockFb.validateContent as jest.Mock).mockReturnValueOnce({
        valid: false,
        errors: ['File too large'],
      });
      mockPrisma.publicationAttempt.findUnique.mockResolvedValue(makeAttempt());
      mockPrisma.publicationAttempt.update.mockResolvedValue({});

      await service.executePublish('attempt-1');

      expect(mockPrisma.publicationAttempt.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ errorCode: 'MEDIA_VALIDATION_FAILED' }),
        }),
      );
    });

    it('returns early for unknown attemptId without throwing', async () => {
      mockPrisma.publicationAttempt.findUnique.mockResolvedValue(null);

      await expect(service.executePublish('bad-id')).resolves.toBeUndefined();
    });
  });

  // ── retryAttempt ─────────────────────────────────────────────────────────

  describe('retryAttempt', () => {
    it('throws BadRequestException if attempt is not retryable', async () => {
      mockPrisma.publicationAttempt.findFirst.mockResolvedValue(
        makeAttempt({ isRetryable: false, status: PUBLICATION_STATUS.FAILED }),
      );

      await expect(service.retryAttempt('org-1', 'attempt-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException if max attempts reached', async () => {
      mockPrisma.publicationAttempt.findFirst.mockResolvedValue(
        makeAttempt({ isRetryable: true, attemptNumber: 5, status: PUBLICATION_STATUS.FAILED }),
      );

      await expect(service.retryAttempt('org-1', 'attempt-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws NotFoundException for cross-org attempt', async () => {
      mockPrisma.publicationAttempt.findFirst.mockResolvedValue(null);

      await expect(service.retryAttempt('org-OTHER', 'attempt-1', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('creates new attempt with incremented attemptNumber', async () => {
      mockPrisma.publicationAttempt.findFirst.mockResolvedValue(
        makeAttempt({ isRetryable: true, attemptNumber: 1, status: PUBLICATION_STATUS.FAILED }),
      );
      mockPrisma.publicationAttempt.create.mockResolvedValue(
        makeAttempt({ id: 'attempt-2', attemptNumber: 2 }),
      );

      await service.retryAttempt('org-1', 'attempt-1', 'user-1');

      expect(mockPrisma.publicationAttempt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ attemptNumber: 2 }),
        }),
      );
    });
  });

  // ── handleWebhookEvent ────────────────────────────────────────────────────

  describe('handleWebhookEvent', () => {
    it('is idempotent on duplicate eventId', async () => {
      mockPrisma.publicationAttempt.findFirst.mockResolvedValue(
        makeAttempt({ providerEventId: 'evt-1' }),
      );

      await service.handleWebhookEvent('org-1', 'TIKTOK', 'evt-1', 'pub-1', true);

      expect(mockPrisma.publicationAttempt.update).not.toHaveBeenCalled();
    });

    it('updates attempt to PUBLISHED on success webhook', async () => {
      // First call: check duplicate → null; second call: find by publishId
      mockPrisma.publicationAttempt.findFirst
        .mockResolvedValueOnce(null) // no duplicate
        .mockResolvedValueOnce(makeAttempt({ providerPublishId: 'pub-1' })); // find attempt

      mockPrisma.publicationAttempt.update.mockResolvedValue({});
      mockPrisma.publicationAttempt.findMany.mockResolvedValue([
        makeAttempt({ status: PUBLICATION_STATUS.PUBLISHED }),
      ]);
      mockPrisma.contentDraft.update.mockResolvedValue({});

      await service.handleWebhookEvent('org-1', 'TIKTOK', 'evt-unique', 'pub-1', true, 'tt-post-1');

      expect(mockPrisma.publicationAttempt.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: PUBLICATION_STATUS.PUBLISHED }),
        }),
      );
    });

    it('handles failed webhook event', async () => {
      mockPrisma.publicationAttempt.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(makeAttempt({ providerPublishId: 'pub-fail' }));
      mockPrisma.publicationAttempt.update.mockResolvedValue({});

      await service.handleWebhookEvent('org-1', 'TIKTOK', 'evt-fail', 'pub-fail', false);

      expect(mockPrisma.publicationAttempt.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: PUBLICATION_STATUS.FAILED }),
        }),
      );
    });

    it('returns without updating if publishId not found', async () => {
      mockPrisma.publicationAttempt.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      await service.handleWebhookEvent('org-1', 'TIKTOK', 'evt-miss', 'unknown-pub', true);

      expect(mockPrisma.publicationAttempt.update).not.toHaveBeenCalled();
    });
  });

  // ── draft aggregation ─────────────────────────────────────────────────────

  describe('draft aggregation', () => {
    it('does not mark draft PUBLISHED while other attempts are pending', async () => {
      mockPrisma.publicationAttempt.findUnique.mockResolvedValue(makeAttempt());
      mockPrisma.publicationAttempt.update.mockResolvedValue({});
      // Another attempt still PROCESSING
      mockPrisma.publicationAttempt.findMany.mockResolvedValue([
        makeAttempt({ id: 'attempt-1', status: PUBLICATION_STATUS.PUBLISHED }),
        makeAttempt({ id: 'attempt-2', status: PUBLICATION_STATUS.PROCESSING }),
      ]);

      await service.executePublish('attempt-1');

      expect(mockPrisma.contentDraft.update).not.toHaveBeenCalled();
    });
  });
});
